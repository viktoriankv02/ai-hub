// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IClaimRouter {
    function claimNative(bytes32 claimId, bytes32 policyId, bytes32 activityId, address user, bool verified, uint256 amount) external;
    function claimERC20(bytes32 claimId, bytes32 policyId, bytes32 activityId, address user, bool verified, address token, uint256 amount) external;
}
