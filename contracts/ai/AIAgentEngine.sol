// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IAIAgentRuntime {
    function canExecute(uint256 agentId) external view returns (bool);
    function agentOwner(uint256 agentId) external view returns (address);
}

/// @title AIAgentEngine
/// @notice Creates, assigns and settles funded AI jobs.
/// @dev Job completion is intentionally separated from reward settlement. A trusted
///      completion reporter can attest execution; the job owner controls assignment
///      and the configured payout manager can settle the ERC20 reward.
contract AIAgentEngine is Ownable {
    using SafeERC20 for IERC20;

    struct AIJob {
        uint256 id;
        address creator;
        uint256 agentId;
        bytes32 taskHash;
        uint256 reward;
        bool assigned;
        bool completed;
        uint256 createdAt;
        uint256 completedAt;
        bytes32 resultHash;
    }

    IERC20 public immutable rewardToken;
    IAIAgentRuntime public immutable runtime;

    uint256 public nextJobId = 1;
    mapping(uint256 => AIJob) public jobs;
    mapping(address => bool) public completionReporters;
    mapping(address => bool) public payoutManagers;

    event CompletionReporterSet(address indexed reporter, bool enabled);
    event PayoutManagerSet(address indexed manager, bool enabled);
    event JobCreated(uint256 indexed jobId, address indexed creator, uint256 indexed agentId, uint256 reward, bytes32 taskHash);
    event JobAssigned(uint256 indexed jobId, uint256 indexed agentId);
    event JobCompleted(uint256 indexed jobId, address indexed reporter, bytes32 resultHash);
    event JobRewardPaid(uint256 indexed jobId, address indexed receiver, uint256 amount);
    event JobCancelled(uint256 indexed jobId, uint256 refund);

    error UnauthorizedReporter();
    error UnauthorizedPayoutManager();
    error InvalidJob();
    error JobAlreadyAssigned();
    error JobAlreadyCompleted();
    error AgentNotExecutable();

    constructor(address initialOwner, address runtimeAddress, address token) Ownable(initialOwner) {
        require(runtimeAddress != address(0), "Agent: zero runtime");
        require(token != address(0), "Agent: zero token");
        runtime = IAIAgentRuntime(runtimeAddress);
        rewardToken = IERC20(token);
    }

    modifier onlyCompletionReporter() {
        if (!completionReporters[msg.sender]) revert UnauthorizedReporter();
        _;
    }

    modifier onlyPayoutManager() {
        if (!payoutManagers[msg.sender]) revert UnauthorizedPayoutManager();
        _;
    }

    function setCompletionReporter(address reporter, bool enabled) external onlyOwner {
        require(reporter != address(0), "Agent: zero reporter");
        completionReporters[reporter] = enabled;
        emit CompletionReporterSet(reporter, enabled);
    }

    function setPayoutManager(address manager, bool enabled) external onlyOwner {
        require(manager != address(0), "Agent: zero manager");
        payoutManagers[manager] = enabled;
        emit PayoutManagerSet(manager, enabled);
    }

    function createJob(uint256 agentId, bytes32 taskHash, uint256 reward) external returns (uint256 jobId) {
        require(taskHash != bytes32(0), "Agent: empty task");
        require(reward > 0, "Agent: zero reward");
        if (!runtime.canExecute(agentId)) revert AgentNotExecutable();

        rewardToken.safeTransferFrom(msg.sender, address(this), reward);
        jobId = nextJobId++;
        jobs[jobId] = AIJob({
            id: jobId,
            creator: msg.sender,
            agentId: agentId,
            taskHash: taskHash,
            reward: reward,
            assigned: false,
            completed: false,
            createdAt: block.timestamp,
            completedAt: 0,
            resultHash: bytes32(0)
        });
        emit JobCreated(jobId, msg.sender, agentId, reward, taskHash);
    }

    function assignJob(uint256 jobId) external onlyOwner {
        AIJob storage job = jobs[jobId];
        if (job.id != jobId) revert InvalidJob();
        if (job.assigned) revert JobAlreadyAssigned();
        if (job.completed) revert JobAlreadyCompleted();
        if (!runtime.canExecute(job.agentId)) revert AgentNotExecutable();
        job.assigned = true;
        emit JobAssigned(jobId, job.agentId);
    }

    function completeJob(uint256 jobId, bytes32 resultHash) external onlyCompletionReporter {
        AIJob storage job = jobs[jobId];
        if (job.id != jobId || !job.assigned) revert InvalidJob();
        if (job.completed) revert JobAlreadyCompleted();
        require(resultHash != bytes32(0), "Agent: empty result");
        job.completed = true;
        job.completedAt = block.timestamp;
        job.resultHash = resultHash;
        emit JobCompleted(jobId, msg.sender, resultHash);
    }

    function payReward(uint256 jobId) external onlyPayoutManager returns (uint256 amount) {
        AIJob storage job = jobs[jobId];
        if (job.id != jobId || !job.completed) revert InvalidJob();
        amount = job.reward;
        require(amount > 0, "Agent: reward already paid");
        job.reward = 0;
        address receiver = runtime.agentOwner(job.agentId);
        rewardToken.safeTransfer(receiver, amount);
        emit JobRewardPaid(jobId, receiver, amount);
    }

    function cancelJob(uint256 jobId) external {
        AIJob storage job = jobs[jobId];
        if (job.id != jobId) revert InvalidJob();
        require(job.creator == msg.sender || owner() == msg.sender, "Agent: not job owner");
        require(!job.assigned && !job.completed, "Agent: job active");
        uint256 refund = job.reward;
        job.reward = 0;
        if (refund > 0) rewardToken.safeTransfer(job.creator, refund);
        emit JobCancelled(jobId, refund);
    }
}
