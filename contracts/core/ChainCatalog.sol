// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AI Hub Chain Catalog
/// @notice Human-readable metadata for the initial multi-chain rollout.
contract ChainCatalog is Ownable {
    struct Entry {
        string name;
        uint256 chainId;
        bytes32 vmType;
        bytes32 adapterType;
        bool enabled;
    }

    mapping(uint256 => Entry) private _entries;

    event ChainConfigured(uint256 indexed chainId, string name, bytes32 vmType, bytes32 adapterType, bool enabled);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function configure(
        string calldata name,
        uint256 chainId,
        bytes32 vmType,
        bytes32 adapterType,
        bool enabled
    ) external onlyOwner {
        require(bytes(name).length > 0, "Catalog: empty name");
        require(chainId != 0, "Catalog: invalid chain");
        require(vmType != bytes32(0), "Catalog: empty VM");
        require(adapterType != bytes32(0), "Catalog: empty adapter");

        _entries[chainId] = Entry(name, chainId, vmType, adapterType, enabled);
        emit ChainConfigured(chainId, name, vmType, adapterType, enabled);
    }

    function get(uint256 chainId) external view returns (Entry memory) {
        return _entries[chainId];
    }

    function isEnabled(uint256 chainId) external view returns (bool) {
        return _entries[chainId].enabled;
    }
}
