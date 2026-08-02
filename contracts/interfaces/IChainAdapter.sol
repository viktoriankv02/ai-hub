// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Common read/verification interface for every supported source chain.
/// @dev The adapter verifies evidence supplied by an authorized operator/oracle;
/// it does not falsely claim that one chain can directly inspect another chain's state.
interface IChainAdapter {
    function chainId() external view returns (uint256);
    function vmType() external view returns (bytes32);
    function isAvailable() external view returns (bool);
    function verifyActivity(bytes32 activityId, address user, bytes calldata proof) external view returns (bool);
}
