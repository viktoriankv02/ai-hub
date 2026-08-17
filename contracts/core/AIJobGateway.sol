// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IAIJobGatewayEngine {
    function createJobFor(
        address creator,
        uint256 agentId,
        bytes32 taskHash,
        uint256 reward
    ) external returns (uint256 jobId);
}

/// @title AIJobGateway
/// @notice Simple user-facing request layer for funded AI jobs.
/// @dev The engine pulls reward tokens directly from the user, so the gateway
///      never becomes the job creator and never takes custody of user rewards.
contract AIJobGateway is Ownable {
    IAIJobGatewayEngine public jobEngine;

    struct Request {
        uint256 id;
        address user;
        uint256 agentId;
        bytes32 taskHash;
        uint256 reward;
        uint256 jobId;
        uint256 createdAt;
        bool processed;
    }

    uint256 public nextRequestId = 1;
    mapping(uint256 => Request) public requests;

    event JobEngineUpdated(address indexed engine);
    event RequestCreated(uint256 indexed requestId, address indexed user, uint256 indexed agentId, uint256 reward);
    event RequestProcessed(uint256 indexed requestId, uint256 indexed jobId);

    error InvalidEngine();
    error RequestNotFound();
    error RequestAlreadyProcessed();

    constructor(address initialOwner, address engineAddress) Ownable(initialOwner) {
        _setJobEngine(engineAddress);
    }

    function setJobEngine(address engineAddress) external onlyOwner {
        _setJobEngine(engineAddress);
    }

    function _setJobEngine(address engineAddress) internal {
        if (engineAddress == address(0)) revert InvalidEngine();
        jobEngine = IAIJobGatewayEngine(engineAddress);
        emit JobEngineUpdated(engineAddress);
    }

    function createRequest(
        uint256 agentId,
        bytes32 taskHash,
        uint256 reward
    ) external returns (uint256 requestId, uint256 jobId) {
        requestId = nextRequestId++;
        requests[requestId] = Request({
            id: requestId,
            user: msg.sender,
            agentId: agentId,
            taskHash: taskHash,
            reward: reward,
            jobId: 0,
            createdAt: block.timestamp,
            processed: false
        });

        emit RequestCreated(requestId, msg.sender, agentId, reward);

        jobId = jobEngine.createJobFor(msg.sender, agentId, taskHash, reward);
        requests[requestId].jobId = jobId;
        requests[requestId].processed = true;
        emit RequestProcessed(requestId, jobId);
    }

    function getRequest(uint256 requestId) external view returns (Request memory) {
        Request memory request = requests[requestId];
        if (request.id == 0) revert RequestNotFound();
        return request;
    }
}
