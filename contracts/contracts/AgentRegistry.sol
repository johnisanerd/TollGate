// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable}      from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title  AgentRegistry
/// @notice Generalised, production-grade replacement for ArcMindRegistry.
///         Implements ERC-8004 (Agent Identity & Reputation) and supports an
///         unbounded set of agents — not just ArcMind.
///
///         Security primitives:
///           * OpenZeppelin AccessControl — DEFAULT_ADMIN_ROLE, RESOLVER_ROLE, GOVERNOR_ROLE
///           * Pausable — admin can pause registrations and decisions globally
///           * Strict per-agent permissions: only the agent owner can register or record;
///             resolvers + owner can resolve outcomes; governor can slash
///           * Reputation incremented by configurable amount; can be slashed
contract AgentRegistry is AccessControl, Pausable {

    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");

    struct AgentInfo {
        address owner;
        bytes32 builderId;
        string  metadata;
        uint64  registeredAt;
        uint256 decisions;
        uint256 reputation;
        bool    slashed;
    }

    struct Decision {
        bytes32 agentId;
        bytes32 decisionHash;
        bytes32 outcomeHash;
        uint64  timestamp;
        uint64  resolvedAt;
        bool    resolved;
        bool    fraudulent;
    }

    mapping(bytes32 => AgentInfo)  private _agents;
    Decision[]                     private _decisions;
    mapping(bytes32 => uint256[])  private _agentDecisions;
    mapping(bytes32 => bytes32)    private _builderToAgent;

    uint16 public reputationPerResolution;

    event AgentRegistered(bytes32 indexed agentId, bytes32 indexed builderId, address indexed owner, string metadata);
    event DecisionRecorded(bytes32 indexed agentId, uint256 indexed decisionIndex, bytes32 decisionHash);
    event DecisionResolved(bytes32 indexed agentId, uint256 indexed decisionIndex, bytes32 outcomeHash, uint256 newReputation);
    event ReputationUpdated(bytes32 indexed agentId, uint256 oldScore, uint256 newScore);
    event AgentSlashed(bytes32 indexed agentId, uint256 indexed decisionIndex, string reason);
    event ReputationPerResolutionUpdated(uint16 oldValue, uint16 newValue);

    error BuilderIdAlreadyRegistered(bytes32 builderId);
    error AgentNotFound(bytes32 agentId);
    error NotAgentOwner(bytes32 agentId, address caller);
    error DecisionNotFound(uint256 index);
    error AlreadyResolved(uint256 index);
    error ZeroBuilderId();
    error AgentAlreadySlashed(bytes32 agentId);
    error MetadataTooLong(uint256 length);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RESOLVER_ROLE,      admin);
        _grantRole(GOVERNOR_ROLE,      admin);
        reputationPerResolution = 10;
    }

    // ── Admin ──────────────────────────────────────────────────────────────────

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause();   }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function setReputationPerResolution(uint16 value) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint16 old = reputationPerResolution;
        reputationPerResolution = value;
        emit ReputationPerResolutionUpdated(old, value);
    }

    // ── Agent registration ─────────────────────────────────────────────────────

    function registerAgent(bytes32 builderId, string calldata metadata)
        external
        whenNotPaused
        returns (bytes32 agentId)
    {
        if (builderId == bytes32(0)) revert ZeroBuilderId();
        if (_builderToAgent[builderId] != bytes32(0)) revert BuilderIdAlreadyRegistered(builderId);
        if (bytes(metadata).length > 1024) revert MetadataTooLong(bytes(metadata).length);

        agentId = keccak256(abi.encodePacked(builderId));
        _agents[agentId] = AgentInfo({
            owner:        msg.sender,
            builderId:    builderId,
            metadata:     metadata,
            registeredAt: uint64(block.timestamp),
            decisions:    0,
            reputation:   0,
            slashed:      false
        });
        _builderToAgent[builderId] = agentId;
        emit AgentRegistered(agentId, builderId, msg.sender, metadata);
    }

    function recordDecision(bytes32 agentId, bytes32 decisionHash)
        external
        whenNotPaused
        returns (uint256 index)
    {
        AgentInfo storage agent = _agents[agentId];
        if (agent.owner == address(0)) revert AgentNotFound(agentId);
        if (agent.owner != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        if (agent.slashed) revert AgentAlreadySlashed(agentId);

        index = _decisions.length;
        _decisions.push(Decision({
            agentId:      agentId,
            decisionHash: decisionHash,
            outcomeHash:  bytes32(0),
            timestamp:    uint64(block.timestamp),
            resolvedAt:   0,
            resolved:     false,
            fraudulent:   false
        }));
        _agentDecisions[agentId].push(index);
        agent.decisions += 1;
        emit DecisionRecorded(agentId, index, decisionHash);
    }

    function resolveDecision(uint256 index, bytes32 outcomeHash) external whenNotPaused {
        if (index >= _decisions.length) revert DecisionNotFound(index);
        Decision storage d = _decisions[index];
        if (d.resolved) revert AlreadyResolved(index);

        AgentInfo storage agent = _agents[d.agentId];
        if (agent.owner != msg.sender && !hasRole(RESOLVER_ROLE, msg.sender)) {
            revert NotAgentOwner(d.agentId, msg.sender);
        }
        if (agent.slashed) revert AgentAlreadySlashed(d.agentId);

        d.outcomeHash = outcomeHash;
        d.resolved    = true;
        d.resolvedAt  = uint64(block.timestamp);
        uint256 oldReputation = agent.reputation;
        agent.reputation     = oldReputation + reputationPerResolution;

        emit DecisionResolved(d.agentId, index, outcomeHash, agent.reputation);
        emit ReputationUpdated(d.agentId, oldReputation, agent.reputation);
    }

    function slashAgent(uint256 decisionIndex, string calldata reason)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        if (decisionIndex >= _decisions.length) revert DecisionNotFound(decisionIndex);
        Decision storage d = _decisions[decisionIndex];
        AgentInfo storage agent = _agents[d.agentId];
        if (agent.owner == address(0)) revert AgentNotFound(d.agentId);
        if (agent.slashed) revert AgentAlreadySlashed(d.agentId);

        d.fraudulent  = true;
        agent.slashed = true;
        uint256 old   = agent.reputation;
        agent.reputation = 0;

        emit AgentSlashed(d.agentId, decisionIndex, reason);
        emit ReputationUpdated(d.agentId, old, 0);
    }

    // ── Views (legacy + ERC-8004) ──────────────────────────────────────────────

    function getAgent(bytes32 agentId) external view returns (AgentInfo memory) {
        return _agents[agentId];
    }
    function getReputation(bytes32 agentId) external view returns (uint256) {
        return _agents[agentId].reputation;
    }
    function getDecisionCount() external view returns (uint256) {
        return _decisions.length;
    }
    function getDecision(uint256 index) external view returns (Decision memory) {
        if (index >= _decisions.length) revert DecisionNotFound(index);
        return _decisions[index];
    }
    function getAgentDecisions(bytes32 agentId) external view returns (uint256[] memory) {
        return _agentDecisions[agentId];
    }
    function agentIdForBuilder(bytes32 builderId) external view returns (bytes32) {
        return _builderToAgent[builderId];
    }
    function agentURI(bytes32 agentId) external view returns (string memory uri) {
        AgentInfo storage agent = _agents[agentId];
        if (agent.owner == address(0)) revert AgentNotFound(agentId);
        return agent.metadata;
    }
    function agentReputation(bytes32 agentId) external view returns (uint256) {
        return _agents[agentId].reputation;
    }
    function agentOwner(bytes32 agentId) external view returns (address) {
        return _agents[agentId].owner;
    }
    function agentDecisionCount(bytes32 agentId) external view returns (uint256) {
        return _agents[agentId].decisions;
    }
}
