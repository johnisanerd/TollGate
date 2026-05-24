// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArcReceiptRegistry
/// @notice Minimal immutable audit trail for ArcMind Control Layer actions.
contract ArcReceiptRegistry {
    address public immutable owner;
    address public operator;

    enum FundingMode {
        AgentTreasury,
        UserWallet,
        UserStrategyVault,
        FreePublic,
        FallbackLocal
    }

    struct Receipt {
        address payer;
        bytes32 action;
        bytes32 strategyId;
        bytes32 sourceId;
        bytes32 metadataHash;
        uint256 amount;
        FundingMode fundingMode;
        bool live;
        uint64 timestamp;
    }

    Receipt[] private receipts;
    mapping(bytes32 => bool) public recorded;

    event OperatorUpdated(address indexed operator);
    event ReceiptRecorded(
        uint256 indexed receiptId,
        address indexed payer,
        bytes32 indexed action,
        FundingMode fundingMode,
        uint256 amount,
        bool live,
        bytes32 metadataHash
    );

    error NotOwner();
    error NotOperator();
    error DuplicateReceipt(bytes32 metadataHash);
    error ReceiptNotFound(uint256 id);

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

    function setOperator(address nextOperator) external onlyOwner {
        operator = nextOperator == address(0) ? owner : nextOperator;
        emit OperatorUpdated(operator);
    }

    function record(
        address payer,
        bytes32 action,
        bytes32 strategyId,
        bytes32 sourceId,
        bytes32 metadataHash,
        uint256 amount,
        FundingMode fundingMode,
        bool live
    ) external onlyOperatorOrOwner returns (uint256 receiptId) {
        if (recorded[metadataHash]) revert DuplicateReceipt(metadataHash);
        recorded[metadataHash] = true;
        receiptId = receipts.length;
        receipts.push(Receipt({
            payer: payer,
            action: action,
            strategyId: strategyId,
            sourceId: sourceId,
            metadataHash: metadataHash,
            amount: amount,
            fundingMode: fundingMode,
            live: live,
            timestamp: uint64(block.timestamp)
        }));
        emit ReceiptRecorded(receiptId, payer, action, fundingMode, amount, live, metadataHash);
    }

    function count() external view returns (uint256) {
        return receipts.length;
    }

    function get(uint256 id) external view returns (Receipt memory) {
        if (id >= receipts.length) revert ReceiptNotFound(id);
        return receipts[id];
    }
}
