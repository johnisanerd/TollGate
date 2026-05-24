// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArcAgentTreasury
/// @notice Native-USDC operating budget for one AI market agent on Arc.
///         User strategy capital must not live here; this contract only funds
///         paid sources/actions such as x402 data calls and route checks.
contract ArcAgentTreasury {
    address public immutable owner;
    address public operator;

    uint256 public dailyCap;
    uint256 public maxPerCall;
    uint256 public dayStart;
    uint256 public spentToday;
    bool public paused;

    mapping(bytes32 => bool) public allowedServices;
    mapping(bytes32 => uint256) public serviceSpend;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event PolicyUpdated(uint256 dailyCap, uint256 maxPerCall, bool paused);
    event OperatorUpdated(address indexed operator);
    event ServiceAllowed(bytes32 indexed serviceId, bool allowed);
    event SpendRecorded(bytes32 indexed serviceId, address indexed provider, uint256 amount, bytes32 receiptHash);

    error NotOwner();
    error NotOperator();
    error TreasuryPaused();
    error ServiceBlocked(bytes32 serviceId);
    error AmountTooHigh();
    error DailyCapExceeded();
    error TransferFailed();

    constructor(address _operator, uint256 _dailyCap, uint256 _maxPerCall) {
        owner = msg.sender;
        operator = _operator == address(0) ? msg.sender : _operator;
        dailyCap = _dailyCap;
        maxPerCall = _maxPerCall;
        dayStart = block.timestamp;
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
        emit Deposited(msg.sender, msg.value);
    }

    function deposit() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function setOperator(address nextOperator) external onlyOwner {
        operator = nextOperator == address(0) ? owner : nextOperator;
        emit OperatorUpdated(operator);
    }

    function setPolicy(uint256 nextDailyCap, uint256 nextMaxPerCall, bool nextPaused) external onlyOwner {
        dailyCap = nextDailyCap;
        maxPerCall = nextMaxPerCall;
        paused = nextPaused;
        emit PolicyUpdated(nextDailyCap, nextMaxPerCall, nextPaused);
    }

    function setServiceAllowed(bytes32 serviceId, bool allowed) external onlyOwner {
        allowedServices[serviceId] = allowed;
        emit ServiceAllowed(serviceId, allowed);
    }

    function recordSpend(bytes32 serviceId, address payable provider, uint256 amount, bytes32 receiptHash)
        external
        onlyOperatorOrOwner
    {
        if (paused) revert TreasuryPaused();
        if (!allowedServices[serviceId]) revert ServiceBlocked(serviceId);
        if (amount > maxPerCall) revert AmountTooHigh();

        if (block.timestamp >= dayStart + 1 days) {
            dayStart = block.timestamp;
            spentToday = 0;
        }
        if (spentToday + amount > dailyCap) revert DailyCapExceeded();
        spentToday += amount;
        serviceSpend[serviceId] += amount;

        if (amount > 0 && provider != address(0)) {
            (bool ok, ) = provider.call{value: amount}("");
            if (!ok) revert TransferFailed();
        }

        emit SpendRecorded(serviceId, provider, amount, receiptHash);
    }

    function withdraw(uint256 amount, address payable to) external onlyOwner {
        address payable receiver = to == address(0) ? payable(owner) : to;
        (bool ok, ) = receiver.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(receiver, amount);
    }

    function availableToday() external view returns (uint256) {
        if (paused) return 0;
        if (block.timestamp >= dayStart + 1 days) return dailyCap;
        return dailyCap > spentToday ? dailyCap - spentToday : 0;
    }
}
