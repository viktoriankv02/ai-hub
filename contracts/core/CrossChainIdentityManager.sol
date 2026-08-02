// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IVerificationRegistry {
    function isVerified(bytes32 identityId, uint256 chainId) external view returns (bool);
}

/// @title AI Hub Cross-Chain Identity Manager
/// @notice Resolves verified chain-specific addresses to one AI Hub identity.
contract CrossChainIdentityManager is Ownable {
    IVerificationRegistry public immutable verificationRegistry;

    mapping(bytes32 => mapping(uint256 => address)) private _verifiedAddress;

    event IdentityAddressSynced(
        bytes32 indexed identityId,
        uint256 indexed chainId,
        address indexed account
    );

    constructor(address initialOwner, address verificationRegistryAddress) Ownable(initialOwner) {
        require(verificationRegistryAddress != address(0), "IdentityManager: zero registry");
        verificationRegistry = IVerificationRegistry(verificationRegistryAddress);
    }

    function syncAddress(
        bytes32 identityId,
        uint256 chainId,
        address account
    ) external onlyOwner {
        require(identityId != bytes32(0), "IdentityManager: empty identity");
        require(chainId != 0, "IdentityManager: invalid chain");
        require(account != address(0), "IdentityManager: zero account");
        require(
            verificationRegistry.isVerified(identityId, chainId),
            "IdentityManager: not verified"
        );

        _verifiedAddress[identityId][chainId] = account;
        emit IdentityAddressSynced(identityId, chainId, account);
    }

    function resolve(bytes32 identityId, uint256 chainId) external view returns (address) {
        return _verifiedAddress[identityId][chainId];
    }

    function resolveMany(
        bytes32 identityId,
        uint256[] calldata chainIds
    ) external view returns (address[] memory accounts) {
        accounts = new address[](chainIds.length);
        for (uint256 i = 0; i < chainIds.length; i++) {
            accounts[i] = _verifiedAddress[identityId][chainIds[i]];
        }
    }
}
