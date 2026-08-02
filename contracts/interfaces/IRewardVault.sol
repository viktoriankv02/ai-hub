// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IRewardVault {
    function claimNative(bytes32 claimId, address payable recipient, uint256 amount) external;
    function claimERC20(bytes32 claimId, address token, address recipient, uint256 amount) external;
}
