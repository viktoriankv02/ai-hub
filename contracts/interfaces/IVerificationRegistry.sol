// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IVerificationRegistry {
    function isVerified(bytes32 identityId, uint256 chainId) external view returns (bool);
}
