// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title AI Hub Activity Registry
/// @notice Canonical on-chain activity log shared by AI Hub modules.
contract ActivityRegistry is Ownable, Pausable {
    struct Activity {
        uint256 chainId;
        bytes32 activityType;
        bytes32 projectId;
        bytes32 metadataHash;
        uint64 timestamp;
        bool verified;
    }

    mapping(address => uint256) private _activityCount;
    mapping(address => mapping(uint256 => Activity)) private _activities;
    mapping(bytes32 => bool) public supportedActivityTypes;

    uint256 public totalActivities;

    event ActivityTypeSet(bytes32 indexed activityType, bool supported);
    event ActivityRecorded(
        uint256 indexed activityId,
        address indexed user,
        uint256 indexed chainId,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bool verified
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setActivityType(bytes32 activityType, bool supported) external onlyOwner {
        require(activityType != bytes32(0), "Activity: empty type");
        supportedActivityTypes[activityType] = supported;
        emit ActivityTypeSet(activityType, supported);
    }

    function recordActivity(
        address user,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bool verified
    ) external onlyOwner whenNotPaused returns (uint256 activityId) {
        require(user != address(0), "Activity: zero user");
        require(supportedActivityTypes[activityType], "Activity: unsupported type");

        uint256 userActivityId = _activityCount[user];
        activityId = totalActivities;

        _activities[user][userActivityId] = Activity({
            chainId: block.chainid,
            activityType: activityType,
            projectId: projectId,
            metadataHash: metadataHash,
            timestamp: uint64(block.timestamp),
            verified: verified
        });

        _activityCount[user] = userActivityId + 1;
        totalActivities = activityId + 1;

        emit ActivityRecorded(
            activityId,
            user,
            block.chainid,
            activityType,
            projectId,
            metadataHash,
            verified
        );
    }

    function activityCount(address user) external view returns (uint256) {
        return _activityCount[user];
    }

    function getActivity(address user, uint256 index) external view returns (Activity memory) {
        require(index < _activityCount[user], "Activity: invalid index");
        return _activities[user][index];
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
