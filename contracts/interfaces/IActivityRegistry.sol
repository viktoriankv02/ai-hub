// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IActivityRegistry {
    function recordActivity(
        address user,
        uint256 chainId,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bool verified
    ) external returns (uint256 activityId);

    function supportedActivityTypes(bytes32 activityType) external view returns (bool);
}
