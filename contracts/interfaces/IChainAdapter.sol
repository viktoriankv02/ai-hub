// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IChainAdapter {
    function chainId() external view returns (uint256);
    function vmType() external view returns (bytes32);
    function isAvailable() external view returns (bool);
    function verifyActivity(bytes32 activityId, address user, bytes calldata proof) external view returns (bool);
}
