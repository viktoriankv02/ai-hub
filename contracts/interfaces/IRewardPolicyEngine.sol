// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IRewardPolicyEngine {
    function claim(
        bytes32 policyId,
        address user,
        bytes32 activityId,
        bytes32 activityType,
        uint256 chainId,
        bool verified
    ) external;
}
