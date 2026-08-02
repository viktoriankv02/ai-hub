// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IIdentityRegistry {
    function getIdentity(address account) external view returns (
        bytes32 identityId,
        uint64 createdAt,
        bool active
    );

    function identityOwner(bytes32 identityId) external view returns (address);
}
