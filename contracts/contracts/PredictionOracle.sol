// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable}      from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title  PredictionOracle
/// @notice Native Arc resolver for binary prediction markets (RFB 03).
///         An admin (covered by RESOLVER_ROLE) registers a question, then
///         later posts the official outcome bytes32 + a citation URI. Downstream
///         settlement contracts read `getOutcome(questionId)` and settle without
///         needing Polymarket's CTF or an external oracle.
///
/// Security:
///   * AccessControl — DEFAULT_ADMIN_ROLE, RESOLVER_ROLE
///   * Pausable — admin can freeze resolutions during a dispute
///   * Each question is resolve-once (no overwriting outcomes)
contract PredictionOracle is AccessControl, Pausable {

    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    bytes32 public constant YES = keccak256("YES");
    bytes32 public constant NO  = keccak256("NO");

    struct Prediction {
        string  question;
        string  citationUri;
        bytes32 outcome;
        uint64  registeredAt;
        uint64  resolvedAt;
        address admin;
        bool    resolved;
    }

    mapping(bytes32 => Prediction) private _predictions;
    bytes32[] private _allIds;

    event PredictionRegistered(
        bytes32 indexed questionId,
        address indexed admin,
        string  question
    );
    event PredictionResolved(
        bytes32 indexed questionId,
        bytes32 indexed outcome,
        address indexed resolver,
        string  citationUri
    );

    error QuestionAlreadyRegistered(bytes32 questionId);
    error QuestionNotFound(bytes32 questionId);
    error AlreadyResolved(bytes32 questionId);
    error InvalidOutcome();
    error EmptyQuestion();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RESOLVER_ROLE, admin);
    }

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause();   }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function registerQuestion(bytes32 questionId, string calldata question)
        external
        whenNotPaused
        onlyRole(RESOLVER_ROLE)
    {
        if (bytes(question).length == 0) revert EmptyQuestion();
        if (_predictions[questionId].registeredAt != 0) revert QuestionAlreadyRegistered(questionId);
        _predictions[questionId] = Prediction({
            question:    question,
            citationUri: "",
            outcome:     bytes32(0),
            registeredAt: uint64(block.timestamp),
            resolvedAt:  0,
            admin:       msg.sender,
            resolved:    false
        });
        _allIds.push(questionId);
        emit PredictionRegistered(questionId, msg.sender, question);
    }

    function resolveQuestion(bytes32 questionId, bytes32 outcome, string calldata citationUri)
        external
        whenNotPaused
        onlyRole(RESOLVER_ROLE)
    {
        Prediction storage p = _predictions[questionId];
        if (p.registeredAt == 0) revert QuestionNotFound(questionId);
        if (p.resolved) revert AlreadyResolved(questionId);
        if (outcome != YES && outcome != NO) revert InvalidOutcome();
        p.outcome     = outcome;
        p.citationUri = citationUri;
        p.resolvedAt  = uint64(block.timestamp);
        p.resolved    = true;
        emit PredictionResolved(questionId, outcome, msg.sender, citationUri);
    }

    function getPrediction(bytes32 questionId) external view returns (Prediction memory) {
        Prediction memory p = _predictions[questionId];
        if (p.registeredAt == 0) revert QuestionNotFound(questionId);
        return p;
    }

    /// @notice Returns (outcome, resolved). Outcome is bytes32(0) when unresolved.
    function getOutcome(bytes32 questionId) external view returns (bytes32 outcome, bool resolved) {
        Prediction storage p = _predictions[questionId];
        if (p.registeredAt == 0) revert QuestionNotFound(questionId);
        return (p.outcome, p.resolved);
    }

    function getQuestionCount() external view returns (uint256) {
        return _allIds.length;
    }

    function getQuestionIdAt(uint256 i) external view returns (bytes32) {
        require(i < _allIds.length, "out_of_bounds");
        return _allIds[i];
    }
}
