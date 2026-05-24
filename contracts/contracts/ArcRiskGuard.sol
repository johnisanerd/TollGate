// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArcRiskGuard
/// @notice Stores user-visible safety rules for the ArcMind Control Layer.
contract ArcRiskGuard {
    address public immutable owner;
    address public operator;
    bool public armed = true;

    struct Rules {
        uint16 maxDrawdownBps;
        uint256 maxDailySpend;
        uint256 maxPerAction;
        uint32 staleSourceTimeoutSeconds;
        uint16 sourceDivergenceBps;
        bool emergencyStop;
    }

    Rules public rules;

    event RulesUpdated(Rules rules);
    event Armed(bool armed);
    event EmergencyExit(address indexed user, bytes32 indexed reasonHash, uint256 ts);
    event OperatorUpdated(address indexed operator);

    error NotOwner();
    error NotOperator();
    error GuardBlocked();

    constructor(address _operator) {
        owner = msg.sender;
        operator = _operator == address(0) ? msg.sender : _operator;
        rules = Rules({
            maxDrawdownBps: 1500,
            maxDailySpend: 1 ether,
            maxPerAction: 0.5 ether,
            staleSourceTimeoutSeconds: 15 minutes,
            sourceDivergenceBps: 3500,
            emergencyStop: false
        });
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperatorOrOwner() {
        if (msg.sender != operator && msg.sender != owner) revert NotOperator();
        _;
    }

    function setOperator(address nextOperator) external onlyOwner {
        operator = nextOperator == address(0) ? owner : nextOperator;
        emit OperatorUpdated(operator);
    }

    function updateRules(
        uint16 maxDrawdownBps,
        uint256 maxDailySpend,
        uint256 maxPerAction,
        uint32 staleSourceTimeoutSeconds,
        uint16 sourceDivergenceBps
    ) external onlyOwner {
        rules.maxDrawdownBps = maxDrawdownBps;
        rules.maxDailySpend = maxDailySpend;
        rules.maxPerAction = maxPerAction;
        rules.staleSourceTimeoutSeconds = staleSourceTimeoutSeconds;
        rules.sourceDivergenceBps = sourceDivergenceBps;
        emit RulesUpdated(rules);
    }

    function setArmed(bool nextArmed) external onlyOwner {
        armed = nextArmed;
        emit Armed(nextArmed);
    }

    function triggerEmergencyExit(address user, bytes32 reasonHash) external onlyOperatorOrOwner {
        rules.emergencyStop = true;
        armed = true;
        emit RulesUpdated(rules);
        emit EmergencyExit(user, reasonHash, block.timestamp);
    }

    function checkAction(uint256 amount, uint16 drawdownBps, uint16 divergenceBps, uint256 sourceUpdatedAt)
        external
        view
        returns (bool ok, string memory reason)
    {
        if (!armed) return (true, "guard_disarmed");
        if (rules.emergencyStop) return (false, "emergency_stop");
        if (amount > rules.maxPerAction) return (false, "max_per_action");
        if (drawdownBps > rules.maxDrawdownBps) return (false, "drawdown");
        if (divergenceBps > rules.sourceDivergenceBps) return (false, "source_divergence");
        if (sourceUpdatedAt == 0 || block.timestamp > sourceUpdatedAt + rules.staleSourceTimeoutSeconds) return (false, "stale_source");
        return (true, "passed");
    }
}
