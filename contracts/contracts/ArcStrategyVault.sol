// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArcStrategyVault
/// @notice User-owned strategy stake vault for ArcMind strategies.
///         AgentTreasury funds operating costs; this vault holds user capital.
contract ArcStrategyVault {
    address public immutable owner;
    address public operator;
    bool public paused;

    struct Position {
        uint256 stake;
        uint256 exposure;
        uint256 withdrawable;
        int256 realizedPnl;
        bool active;
    }

    mapping(address => Position) private positions;
    uint256 public totalStake;
    uint256 public totalExposure;

    event Deposited(address indexed user, uint256 amount);
    event ExposureReduced(address indexed user, uint256 amount);
    event Closed(address indexed user, uint256 returnedAmount);
    event Settled(address indexed user, int256 pnl, uint256 withdrawable);
    event Withdrawn(address indexed user, uint256 amount);
    event Paused(bool paused);
    event OperatorUpdated(address indexed operator);

    error NotOwner();
    error NotOperator();
    error VaultPaused();
    error NoPosition();
    error AmountTooHigh();
    error TransferFailed();

    constructor(address _operator) {
        owner = msg.sender;
        operator = _operator == address(0) ? msg.sender : _operator;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperatorOrOwner() {
        if (msg.sender != operator && msg.sender != owner) revert NotOperator();
        _;
    }

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        if (paused) revert VaultPaused();
        if (msg.value == 0) revert AmountTooHigh();
        Position storage p = positions[msg.sender];
        p.stake += msg.value;
        p.exposure += msg.value;
        p.active = true;
        totalStake += msg.value;
        totalExposure += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function setOperator(address nextOperator) external onlyOwner {
        operator = nextOperator == address(0) ? owner : nextOperator;
        emit OperatorUpdated(operator);
    }

    function setPaused(bool nextPaused) external onlyOwner {
        paused = nextPaused;
        emit Paused(nextPaused);
    }

    function reduce(address user, uint256 amount) external onlyOperatorOrOwner {
        Position storage p = positions[user];
        if (!p.active) revert NoPosition();
        if (amount > p.exposure) revert AmountTooHigh();
        p.exposure -= amount;
        p.withdrawable += amount;
        totalExposure -= amount;
        emit ExposureReduced(user, amount);
    }

    function close(address user) external onlyOperatorOrOwner {
        Position storage p = positions[user];
        if (!p.active) revert NoPosition();
        uint256 returnedAmount = p.exposure;
        p.withdrawable += returnedAmount;
        totalExposure -= returnedAmount;
        p.exposure = 0;
        p.active = false;
        emit Closed(user, returnedAmount);
    }

    function settle(address user, int256 pnl) external onlyOperatorOrOwner {
        Position storage p = positions[user];
        if (!p.active && p.stake == 0) revert NoPosition();
        p.realizedPnl += pnl;
        if (pnl > 0) {
            p.withdrawable += uint256(pnl);
        } else {
            uint256 loss = uint256(-pnl);
            p.withdrawable = p.withdrawable > loss ? p.withdrawable - loss : 0;
        }
        emit Settled(user, pnl, p.withdrawable);
    }

    function withdraw(uint256 amount) external {
        Position storage p = positions[msg.sender];
        if (amount > p.withdrawable) revert AmountTooHigh();
        p.withdrawable -= amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    function positionOf(address user) external view returns (Position memory) {
        return positions[user];
    }
}
