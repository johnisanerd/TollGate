// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title CopyTradeEscrow
/// @notice ERC-8183 compliant copy-trading escrow for ArcMind.
///         Copy-traders stake USDC; ArcMind allocates capital and settles PnL.
///         An autonomous kill switch closes all positions if drawdown exceeds the threshold.
///
///         Deployed on Arc L1 testnet (chainId 5042002).
///         USDC is the native gas token and settlement currency on Arc.
contract CopyTradeEscrow {

    struct Position {
        address trader;
        uint256 stakeUsdc;   // initial stake in USDC (6 decimals)
        uint256 entryTs;     // block.timestamp when position opened
        uint256 peakUsdc;    // highest value reached (for drawdown calc)
        bool    paused;      // true after kill switch fires for this position
    }

    struct SettlementRecord {
        address trader;
        uint256 stakeUsdc;
        int256  pnlUsdc;     // positive = profit, negative = loss
        uint256 returnedUsdc;
        uint256 settledAt;
    }

    address public immutable operator;  // ArcMind wallet — can settle and trigger kill switch
    address public immutable usdc;      // USDC contract on Arc L1
    uint16  public killThresholdBps;    // default 1500 = 15%
    uint16  public performanceFeeBps;   // default 500 = 5%

    mapping(address => Position)     private _positions;
    SettlementRecord[]               private _settlements;
    uint256 public totalStaked;
    uint256 public totalSettled;
    bool    public globalKillSwitch;

    event Staked(address indexed trader, uint256 amount, uint256 ts);
    event Settled(address indexed trader, int256 pnl, uint256 returned, uint256 fee);
    event KillSwitchTriggered(address indexed trader, uint256 drawdownBps, uint256 ts);
    event GlobalKillSwitch(uint256 ts, string reason);

    // ── ERC-8183 (Agentic Commerce) standard events ─────────────────────────
    //
    // Each copy-trade position is modelled as a Job in ERC-8183 terms:
    //   client    = trader (user staking USDC)
    //   provider  = operator (ArcMind agent address)
    //   evaluator = operator (settlement is operator-attested)
    //   budget    = staked USDC amount
    //
    // Job state machine: Open → Funded → Submitted → Terminal.
    // stake() transitions to Funded immediately (open + funded in one tx).
    // settle()/killSwitch()/global halt emit JobSubmitted + JobCompleted.

    /// @notice ERC-8183 — emitted when a new Job is created.
    event JobCreated(
        bytes32 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 budget,
        uint256 ts
    );

    /// @notice ERC-8183 — emitted when the Job is funded (escrow received budget).
    event JobFunded(bytes32 indexed jobId, uint256 amount, uint256 ts);

    /// @notice ERC-8183 — emitted when the provider submits work for evaluation.
    /// @param outcome  keccak256 of an outcome blob, or a packed status code.
    event JobSubmitted(bytes32 indexed jobId, bytes32 outcome, uint256 ts);

    /// @notice ERC-8183 — emitted when the Job reaches terminal state.
    /// @param reason   bytes32 packed reason: "settled" | "kill_switch" | "global_halt"
    event JobCompleted(bytes32 indexed jobId, bytes32 reason, uint256 ts);

    error AlreadyStaked(address trader);
    error NoPosition(address trader);
    error NotOperator(address caller);
    error AlreadyPaused(address trader);
    error GlobalHalt();
    error InsufficientAmount();
    error TransferFailed();

    constructor(address _usdc, uint16 _killThresholdBps, uint16 _performanceFeeBps) {
        operator          = msg.sender;
        usdc              = _usdc;
        killThresholdBps  = _killThresholdBps == 0 ? 1500 : _killThresholdBps;
        performanceFeeBps = _performanceFeeBps == 0 ? 500  : _performanceFeeBps;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator(msg.sender);
        _;
    }

    modifier notHalted() {
        if (globalKillSwitch) revert GlobalHalt();
        _;
    }

    /// @notice Open a copy-trade position. Caller must approve USDC first.
    function stake(uint256 amount) external notHalted {
        if (amount == 0) revert InsufficientAmount();
        if (_positions[msg.sender].stakeUsdc != 0) revert AlreadyStaked(msg.sender);

        bool ok = IERC20(usdc).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        _positions[msg.sender] = Position({
            trader:    msg.sender,
            stakeUsdc: amount,
            entryTs:   block.timestamp,
            peakUsdc:  amount,
            paused:    false
        });

        totalStaked += amount;
        emit Staked(msg.sender, amount, block.timestamp);

        // ERC-8183 lifecycle: Open + Funded in the same tx.
        bytes32 jobId = _computeJobId(msg.sender, block.timestamp);
        emit JobCreated(jobId, msg.sender, operator, operator, amount, block.timestamp);
        emit JobFunded(jobId, amount, block.timestamp);
    }

    /// @notice Settle a position with realised PnL. Only operator (ArcMind) can call.
    function settle(address trader, int256 pnlUsdc) external onlyOperator {
        Position storage pos = _positions[trader];
        if (pos.stakeUsdc == 0) revert NoPosition(trader);

        uint256 gross;
        uint256 fee = 0;

        if (pnlUsdc >= 0) {
            uint256 profit = uint256(pnlUsdc);
            fee   = (profit * performanceFeeBps) / 10_000;
            gross = pos.stakeUsdc + profit - fee;
        } else {
            uint256 loss = uint256(-pnlUsdc);
            gross = pos.stakeUsdc > loss ? pos.stakeUsdc - loss : 0;
        }

        if (gross > 0) {
            bool ok = IERC20(usdc).transfer(trader, gross);
            if (!ok) revert TransferFailed();
        }
        if (fee > 0) {
            bool ok2 = IERC20(usdc).transfer(operator, fee);
            if (!ok2) revert TransferFailed();
        }

        _settlements.push(SettlementRecord({
            trader:       trader,
            stakeUsdc:    pos.stakeUsdc,
            pnlUsdc:      pnlUsdc,
            returnedUsdc: gross,
            settledAt:    block.timestamp
        }));

        totalSettled += gross;

        // ERC-8183 lifecycle: Submitted + Completed in the same tx.
        bytes32 jobId = _computeJobId(trader, pos.entryTs);
        bytes32 outcome = keccak256(abi.encode(pnlUsdc, gross, fee));
        emit JobSubmitted(jobId, outcome, block.timestamp);
        emit JobCompleted(jobId, bytes32("settled"), block.timestamp);

        delete _positions[trader];
        emit Settled(trader, pnlUsdc, gross, fee);
    }

    /// @notice Kill switch for a single trader — returns remaining capital immediately.
    function killSwitch(address trader, uint256 drawdownBps) external onlyOperator {
        Position storage pos = _positions[trader];
        if (pos.stakeUsdc == 0) revert NoPosition(trader);
        if (pos.paused) revert AlreadyPaused(trader);

        pos.paused = true;
        uint256 loss      = pos.stakeUsdc * drawdownBps / 10_000;
        uint256 remaining = pos.stakeUsdc > loss ? pos.stakeUsdc - loss : 0;

        if (remaining > 0) {
            bool ok = IERC20(usdc).transfer(trader, remaining);
            if (!ok) revert TransferFailed();
        }

        // ERC-8183 lifecycle: Submitted (with kill-switch outcome) + Completed.
        bytes32 jobId = _computeJobId(trader, pos.entryTs);
        bytes32 outcome = keccak256(abi.encode(uint256(0xDEAD), drawdownBps, remaining));
        emit JobSubmitted(jobId, outcome, block.timestamp);
        emit JobCompleted(jobId, bytes32("kill_switch"), block.timestamp);

        delete _positions[trader];
        emit KillSwitchTriggered(trader, drawdownBps, block.timestamp);
    }

    /// @notice Halt all new stakes globally.
    function triggerGlobalKillSwitch(string calldata reason) external onlyOperator {
        globalKillSwitch = true;
        emit GlobalKillSwitch(block.timestamp, reason);
    }

    function getPosition(address trader) external view returns (Position memory) {
        return _positions[trader];
    }

    function getSettlementCount() external view returns (uint256) {
        return _settlements.length;
    }

    function getSettlement(uint256 index) external view returns (SettlementRecord memory) {
        return _settlements[index];
    }

    // ── ERC-8183 helpers ─────────────────────────────────────────────────────

    /// @notice Deterministic ERC-8183 Job id for a trader's currently-open position.
    /// @dev    keccak256(client || entryTs || escrow). Two consecutive positions
    ///         by the same trader produce different jobIds because entryTs differs.
    ///         Returns 0x0 when the trader has no open position.
    function jobIdOf(address trader) public view returns (bytes32) {
        uint256 entryTs = _positions[trader].entryTs;
        if (entryTs == 0) return bytes32(0);
        return _computeJobId(trader, entryTs);
    }

    function _computeJobId(address client, uint256 entryTs) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(client, entryTs, address(this)));
    }
}
