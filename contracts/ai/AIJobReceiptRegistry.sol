// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AIJobReceiptRegistry is Ownable {
    enum ReceiptStatus { None, Submitted, Revoked }

    struct Receipt {
        uint256 jobId;
        uint256 agentId;
        address jobCreator;
        address attester;
        bytes32 taskHash;
        bytes32 resultHash;
        bytes32 outputHash;
        bytes32 metadataHash;
        uint256 completedAt;
        uint256 recordedAt;
        ReceiptStatus status;
        bool exists;
    }

    mapping(address => bool) public reporters;
    mapping(uint256 => Receipt) private _receipts;
    mapping(bytes32 => uint256) public receiptJobId;

    event ReporterSet(address indexed reporter, bool enabled);
    event ReceiptRecorded(uint256 indexed jobId, uint256 indexed agentId, address indexed attester, bytes32 receiptHash, bytes32 resultHash, bytes32 outputHash);
    event ReceiptRevoked(uint256 indexed jobId, bytes32 receiptHash);

    error UnauthorizedReporter();
    error ReceiptAlreadyExists();
    error InvalidReceipt();
    error ReceiptNotFound();
    error ReceiptAlreadyRevoked();
    error ZeroAddress();

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyReporter() {
        if (!reporters[msg.sender]) revert UnauthorizedReporter();
        _;
    }

    function setReporter(address reporter, bool enabled) external onlyOwner {
        if (reporter == address(0)) revert ZeroAddress();
        reporters[reporter] = enabled;
        emit ReporterSet(reporter, enabled);
    }

    function recordReceipt(uint256 jobId, uint256 agentId, address jobCreator, address attester, bytes32 taskHash, bytes32 resultHash, bytes32 outputHash, bytes32 metadataHash, uint256 completedAt, bytes32 receiptHash) external onlyReporter {
        if (jobId == 0 || agentId == 0 || jobCreator == address(0) || attester == address(0)) revert InvalidReceipt();
        if (taskHash == bytes32(0) || resultHash == bytes32(0) || receiptHash == bytes32(0) || completedAt == 0) revert InvalidReceipt();
        if (_receipts[jobId].exists || receiptJobId[receiptHash] != 0) revert ReceiptAlreadyExists();

        _receipts[jobId] = Receipt({jobId: jobId, agentId: agentId, jobCreator: jobCreator, attester: attester, taskHash: taskHash, resultHash: resultHash, outputHash: outputHash, metadataHash: metadataHash, completedAt: completedAt, recordedAt: block.timestamp, status: ReceiptStatus.Submitted, exists: true});
        receiptJobId[receiptHash] = jobId;
        emit ReceiptRecorded(jobId, agentId, attester, receiptHash, resultHash, outputHash);
    }

    function revokeReceipt(uint256 jobId, bytes32 receiptHash) external onlyOwner {
        Receipt storage receipt = _receipts[jobId];
        if (!receipt.exists) revert ReceiptNotFound();
        if (receipt.status == ReceiptStatus.Revoked) revert ReceiptAlreadyRevoked();
        if (receiptJobId[receiptHash] != jobId) revert InvalidReceipt();
        receipt.status = ReceiptStatus.Revoked;
        emit ReceiptRevoked(jobId, receiptHash);
    }

    function getReceipt(uint256 jobId) external view returns (Receipt memory) {
        if (!_receipts[jobId].exists) revert ReceiptNotFound();
        return _receipts[jobId];
    }

    function hasReceipt(uint256 jobId) external view returns (bool) { return _receipts[jobId].exists; }
    function isValidReceipt(uint256 jobId) external view returns (bool) { return _receipts[jobId].exists && _receipts[jobId].status == ReceiptStatus.Submitted; }
}
