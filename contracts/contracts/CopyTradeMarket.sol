// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20}        from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}     from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable}       from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable}      from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title  CopyTradeMarket
/// @notice Production-grade ERC-8183-compatible copy-trade market for a single
///         (base, quote) pair driven by a single autonomous agent (operator).
///
///         Each market is its own contract — deployed by MarketFactory — so that:
///           * markets can be independently paused, parameterised, and audited
///           * risk on one market never affects another
///           * fees, drawdown limits, and asset specifics live with the market
///
///         Security primitives:
///           * Ownable + Pausable + ReentrancyGuard from OpenZeppelin 5.x
///           * SafeERC20 for every stake/transfer/payout
///           * Strict role separation: owner (factory or DAO), operator (agent), trader (user)
///           * Performance fee + drawdown limits are immutable per market
///           * No `delegatecall`, no proxy — every state read is direct
///           * CEI ordering on all external calls
///
///         Lifecycle (ERC-8183 Job semantics):
///           Open → Funded (stake) → Submitted (settle/killSwitch) → Terminal
contract CopyTradeMarket is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ──────────────────────────────────────────────────────────────

    uint16  public constant BPS_DENOMINATOR         = 10_000;
    uint16  public constant MAX_PERFORMANCE_FEE_BPS = 2_000; // 20% cap
    uint16  public constant MAX_KILL_THRESHOLD_BPS  = 5_000; // 50% cap
    uint16  public constant MIN_KILL_THRESHOLD_BPS  = 500;   // 5% floor

    // ── Immutable market identity ──────────────────────────────────────────────

    /// @notice The collateral / settlement token (always an ERC-20, typically USDC).
    IERC20 public immutable quoteToken;

    /// @notice The base-asset symbol this market trades (informational only — the
    ///         actual on-chain leg is virtual; the agent settles in `quoteToken`).
    string public baseSymbol;

    /// @notice Operator address — the agent that records decisions and settles.
    address public immutable operator;

    /// @notice Fee + drawdown parameters fixed at construction.
    uint16 public immutable performanceFeeBps;
    uint16 public immutable killThresholdBps;

    /// @notice Minimum and maximum stake per trader (USDC, 6 decimals).
    uint256 public immutable minStake;
    uint256 public immutable maxStake;

    // ── State ──────────────────────────────────────────────────────────────────

    struct Position {
        uint256 stakeQuote;
        uint256 entryTs;
        uint256 peakQuote;
        bool    paused;
    }

    struct SettlementRecord {
        address trader;
        uint256 stakeQuote;
        int256  pnlQuote;
        uint256 returnedQuote;
        uint256 settledAt;
    }

    mapping(address => Position) private _positions;
    SettlementRecord[]           private _settlements;

    uint256 public totalStaked;
    uint256 public totalSettled;
    uint256 public totalFeesPaid;

    // ── Events ─────────────────────────────────────────────────────────────────

    event MarketCreated(
        address indexed operator,
        IERC20 indexed quoteToken,
        string baseSymbol,
        uint16 performanceFeeBps,
        uint16 killThresholdBps
    );

    event Staked(address indexed trader, uint256 amount, uint256 ts);
    event Settled(address indexed trader, int256 pnl, uint256 returned, uint256 fee);
    event KillSwitchTriggered(address indexed trader, uint256 drawdownBps, uint256 ts);

    event JobCreated(
        bytes32 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 budget,
        uint256 ts
    );
    event JobFunded(bytes32 indexed jobId, uint256 amount, uint256 ts);
    event JobSubmitted(bytes32 indexed jobId, bytes32 outcome, uint256 ts);
    event JobCompleted(bytes32 indexed jobId, bytes32 reason, uint256 ts);

    // ── Errors ─────────────────────────────────────────────────────────────────

    error AlreadyStaked(address trader);
    error NoPosition(address trader);
    error NotOperator(address caller);
    error AlreadyPaused(address trader);
    error InsufficientAmount(uint256 provided, uint256 minimum);
    error OverMaxStake(uint256 provided, uint256 maximum);
    error InvalidFeeBps(uint16 provided);
    error InvalidKillThresholdBps(uint16 provided);
    error InvalidStakeBounds(uint256 min, uint256 max);
    error ZeroAddress();
    error CannotSweepQuoteToken();

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor(
        address owner_,
        address operator_,
        IERC20 quoteToken_,
        string memory baseSymbol_,
        uint16 performanceFeeBps_,
        uint16 killThresholdBps_,
        uint256 minStake_,
        uint256 maxStake_
    ) Ownable(owner_) {
        if (owner_       == address(0)) revert ZeroAddress();
        if (operator_    == address(0)) revert ZeroAddress();
        if (address(quoteToken_) == address(0)) revert ZeroAddress();
        if (performanceFeeBps_ > MAX_PERFORMANCE_FEE_BPS) revert InvalidFeeBps(performanceFeeBps_);
        if (killThresholdBps_  < MIN_KILL_THRESHOLD_BPS || killThresholdBps_ > MAX_KILL_THRESHOLD_BPS) {
            revert InvalidKillThresholdBps(killThresholdBps_);
        }
        if (minStake_ == 0 || maxStake_ < minStake_) revert InvalidStakeBounds(minStake_, maxStake_);

        operator          = operator_;
        quoteToken        = quoteToken_;
        baseSymbol        = baseSymbol_;
        performanceFeeBps = performanceFeeBps_;
        killThresholdBps  = killThresholdBps_;
        minStake          = minStake_;
        maxStake          = maxStake_;

        emit MarketCreated(operator_, quoteToken_, baseSymbol_, performanceFeeBps_, killThresholdBps_);
    }

    // ── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator(msg.sender);
        _;
    }

    // ── User operations ────────────────────────────────────────────────────────

    /// @notice Open a copy-trade position. Caller must approve quoteToken first.
    function stake(uint256 amount) external whenNotPaused nonReentrant {
        if (amount < minStake) revert InsufficientAmount(amount, minStake);
        if (amount > maxStake) revert OverMaxStake(amount, maxStake);
        if (_positions[msg.sender].stakeQuote != 0) revert AlreadyStaked(msg.sender);

        quoteToken.safeTransferFrom(msg.sender, address(this), amount);

        _positions[msg.sender] = Position({
            stakeQuote: amount,
            entryTs:    block.timestamp,
            peakQuote:  amount,
            paused:     false
        });

        totalStaked += amount;
        emit Staked(msg.sender, amount, block.timestamp);

        bytes32 jobId = _computeJobId(msg.sender, block.timestamp);
        emit JobCreated(jobId, msg.sender, operator, operator, amount, block.timestamp);
        emit JobFunded(jobId, amount, block.timestamp);
    }

    // ── Operator operations ────────────────────────────────────────────────────

    function settle(address trader, int256 pnlQuote) external onlyOperator nonReentrant {
        Position memory pos = _positions[trader];
        if (pos.stakeQuote == 0) revert NoPosition(trader);

        uint256 gross;
        uint256 fee = 0;
        if (pnlQuote >= 0) {
            uint256 profit = uint256(pnlQuote);
            fee   = (profit * performanceFeeBps) / BPS_DENOMINATOR;
            gross = pos.stakeQuote + profit - fee;
        } else {
            uint256 loss = uint256(-pnlQuote);
            gross = pos.stakeQuote > loss ? pos.stakeQuote - loss : 0;
        }

        delete _positions[trader];
        _settlements.push(SettlementRecord({
            trader:        trader,
            stakeQuote:    pos.stakeQuote,
            pnlQuote:      pnlQuote,
            returnedQuote: gross,
            settledAt:     block.timestamp
        }));
        totalSettled  += gross;
        totalFeesPaid += fee;

        bytes32 jobId   = _computeJobId(trader, pos.entryTs);
        bytes32 outcome = keccak256(abi.encode(pnlQuote, gross, fee));
        emit JobSubmitted(jobId, outcome, block.timestamp);
        emit JobCompleted(jobId, bytes32("settled"), block.timestamp);
        emit Settled(trader, pnlQuote, gross, fee);

        if (gross > 0) quoteToken.safeTransfer(trader, gross);
        if (fee   > 0) quoteToken.safeTransfer(operator, fee);
    }

    function killSwitch(address trader, uint256 drawdownBps) external onlyOperator nonReentrant {
        Position memory pos = _positions[trader];
        if (pos.stakeQuote == 0) revert NoPosition(trader);
        if (pos.paused) revert AlreadyPaused(trader);
        if (drawdownBps > BPS_DENOMINATOR) drawdownBps = BPS_DENOMINATOR;

        uint256 loss      = (pos.stakeQuote * drawdownBps) / BPS_DENOMINATOR;
        uint256 remaining = pos.stakeQuote > loss ? pos.stakeQuote - loss : 0;

        delete _positions[trader];

        bytes32 jobId   = _computeJobId(trader, pos.entryTs);
        bytes32 outcome = keccak256(abi.encode(uint256(0xDEAD), drawdownBps, remaining));
        emit JobSubmitted(jobId, outcome, block.timestamp);
        emit JobCompleted(jobId, bytes32("kill_switch"), block.timestamp);
        emit KillSwitchTriggered(trader, drawdownBps, block.timestamp);

        if (remaining > 0) quoteToken.safeTransfer(trader, remaining);
    }

    // ── Owner operations ───────────────────────────────────────────────────────

    function pause()   external onlyOwner { _pause();   }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Sweep accidental ERC-20 transfers OTHER than quoteToken. Quote
    ///         token can never be swept — that's user capital.
    function sweepDust(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (address(token) == address(quoteToken)) revert CannotSweepQuoteToken();
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
    }

    // ── Views ──────────────────────────────────────────────────────────────────

    function getPosition(address trader) external view returns (Position memory) {
        return _positions[trader];
    }

    function getSettlementCount() external view returns (uint256) {
        return _settlements.length;
    }

    function getSettlement(uint256 index) external view returns (SettlementRecord memory) {
        return _settlements[index];
    }

    function jobIdOf(address trader) public view returns (bytes32) {
        uint256 entryTs = _positions[trader].entryTs;
        if (entryTs == 0) return bytes32(0);
        return _computeJobId(trader, entryTs);
    }

    function _computeJobId(address client, uint256 entryTs) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(client, entryTs, address(this)));
    }
}
