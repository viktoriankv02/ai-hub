// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface ICompletionEngine {
    function jobs(uint256) external view returns (uint256 id, address creator, uint256 agentId, bytes32 taskHash, uint256 reward, bool assigned, bool completed, uint256 createdAt, uint256 completedAt, bytes32 resultHash);
    function completeJob(uint256 jobId, bytes32 resultHash) external;
}

interface ICompletionActivityRegistry {
    function recordActivity(address user, uint256 chainId, bytes32 activityType, bytes32 projectId, bytes32 metadataHash, bool verified) external returns (uint256 activityId);
}

contract AICompletionReporter is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using Strings for uint256;

    string public constant ATTESTATION_VERSION = "AI_HUB_JOB_COMPLETION_V1";

    ICompletionEngine public immutable engine;
    ICompletionActivityRegistry public immutable activityRegistry;
    mapping(address => bool) public completionCallers;
    mapping(address => bool) public attesters;
    mapping(bytes32 => bool) public submittedCompletions;

    event CompletionCallerSet(address indexed caller, bool enabled);
    event AttesterSet(address indexed attester, bool enabled);
    event CompletionReported(uint256 indexed jobId, uint256 indexed agentId, address indexed user, bytes32 resultHash, bytes32 completionId, uint256 activityId, address attester);

    error UnauthorizedCaller();
    error UnauthorizedAttester();
    error InvalidJob();
    error JobAlreadyCompleted();
    error CompletionAlreadySubmitted();
    error InvalidAttestation();
    error EmptyResultHash();
    error ZeroAddress();

    constructor(address initialOwner, address engineAddress, address registryAddress) Ownable(initialOwner) {
        if (engineAddress == address(0) || registryAddress == address(0)) revert ZeroAddress();
        engine = ICompletionEngine(engineAddress);
        activityRegistry = ICompletionActivityRegistry(registryAddress);
    }

    modifier onlyCompletionCaller() {
        if (!completionCallers[msg.sender]) revert UnauthorizedCaller();
        _;
    }

    function setCompletionCaller(address caller, bool enabled) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        completionCallers[caller] = enabled;
        emit CompletionCallerSet(caller, enabled);
    }

    function setAttester(address attester, bool enabled) external onlyOwner {
        if (attester == address(0)) revert ZeroAddress();
        attesters[attester] = enabled;
        emit AttesterSet(attester, enabled);
    }

    function completionDigest(uint256 jobId, string calldata agentId, string calldata taskHash, string calldata resultHash, string calldata completedAt) public pure returns (bytes32) {
        bytes32 payloadHash = keccak256(abi.encodePacked(
            ATTESTATION_VERSION, "\n",
            "jobId=", jobId.toString(), "\n",
            "agentId=", agentId, "\n",
            "taskHash=", taskHash, "\n",
            "resultHash=", resultHash, "\n",
            "completedAt=", completedAt
        ));
        return payloadHash.toEthSignedMessageHash();
    }

    function expectedCompletionId(uint256 jobId, string calldata agentId, string calldata taskHash, string calldata resultHash, string calldata completedAt, address attester) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            ATTESTATION_VERSION, "\n",
            jobId.toString(), "\n",
            agentId, "\n",
            taskHash, "\n",
            resultHash, "\n",
            completedAt, "\n",
            Strings.toHexString(uint160(attester), 20)
        ));
    }

    function submitVerifiedCompletion(
        uint256 jobId,
        string calldata agentId,
        string calldata taskHash,
        string calldata resultHash,
        string calldata completedAt,
        bytes calldata signature,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bytes32 completionId
    ) external onlyCompletionCaller returns (uint256 activityId) {
        if (bytes(resultHash).length == 0) revert EmptyResultHash();
        if (bytes(completedAt).length == 0) revert InvalidAttestation();
        if (completionId == bytes32(0) || submittedCompletions[completionId]) revert CompletionAlreadySubmitted();

        (uint256 idValue, address creator, uint256 agentIdValue, bytes32 taskHashValue, , bool assigned, bool completed, , , ) = engine.jobs(jobId);
        if (idValue != jobId || !assigned) revert InvalidJob();
        if (completed) revert JobAlreadyCompleted();
        if (keccak256(bytes(agentId)) != keccak256(bytes(agentIdValue.toString()))) revert InvalidAttestation();
        if (_parseBytes32(taskHash) != taskHashValue) revert InvalidAttestation();

        address attester = completionDigest(jobId, agentId, taskHash, resultHash, completedAt).recover(signature);
        if (!attesters[attester]) revert UnauthorizedAttester();
        if (completionId != expectedCompletionId(jobId, agentId, taskHash, resultHash, completedAt, attester)) revert InvalidAttestation();

        bytes32 onchainResultHash = keccak256(bytes(resultHash));
        submittedCompletions[completionId] = true;
        engine.completeJob(jobId, onchainResultHash);
        activityId = activityRegistry.recordActivity(creator, block.chainid, activityType, projectId, metadataHash, true);
        emit CompletionReported(jobId, agentIdValue, creator, onchainResultHash, completionId, activityId, attester);
    }

    function _parseBytes32(string memory value) internal pure returns (bytes32 result) {
        bytes memory data = bytes(value);
        if (data.length != 66 || data[0] != "0" || (data[1] != "x" && data[1] != "X")) revert InvalidAttestation();
        for (uint256 i = 0; i < 32; i++) {
            uint8 high = _hexNibble(uint8(data[2 + i * 2]));
            uint8 low = _hexNibble(uint8(data[3 + i * 2]));
            result |= bytes32(uint256(high) << (252 - i * 8));
            result |= bytes32(uint256(low) << (248 - i * 8));
        }
    }

    function _hexNibble(uint8 value) internal pure returns (uint8) {
        if (value >= 48 && value <= 57) return value - 48;
        if (value >= 65 && value <= 70) return value - 55;
        if (value >= 97 && value <= 102) return value - 87;
        revert InvalidAttestation();
    }
}
