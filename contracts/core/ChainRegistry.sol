// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AI Hub Chain Registry
/// @notice Canonical registry of supported chains and their adapter contracts.
contract ChainRegistry is Ownable {
    struct Chain {
        uint256 chainId;
        bytes32 nameHash;
        bytes32 vmType;
        address adapter;
        bool active;
    }

    mapping(uint256 => Chain) private _chains;
    mapping(address => bool) public adapterAuthorized;

    event ChainRegistered(uint256 indexed chainId, bytes32 indexed nameHash, bytes32 vmType, address adapter);
    event ChainStatusChanged(uint256 indexed chainId, bool active);
    event AdapterAuthorized(address indexed adapter, bool authorized);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerChain(
        uint256 chainId,
        bytes32 nameHash,
        bytes32 vmType,
        address adapter,
        bool active
    ) external onlyOwner {
        require(chainId != 0, "Chain: invalid ID");
        require(nameHash != bytes32(0), "Chain: empty name");
        require(vmType != bytes32(0), "Chain: empty VM");
        require(adapter != address(0), "Chain: zero adapter");
        require(_chains[chainId].chainId == 0, "Chain: already registered");
        require(adapterAuthorized[adapter], "Chain: adapter unauthorized");

        _chains[chainId] = Chain({
            chainId: chainId,
            nameHash: nameHash,
            vmType: vmType,
            adapter: adapter,
            active: active
        });

        emit ChainRegistered(chainId, nameHash, vmType, adapter);
    }

    function setAdapterAuthorized(address adapter, bool authorized) external onlyOwner {
        require(adapter != address(0), "Chain: zero adapter");
        adapterAuthorized[adapter] = authorized;
        emit AdapterAuthorized(adapter, authorized);
    }

    function setChainActive(uint256 chainId, bool active) external onlyOwner {
        require(_chains[chainId].chainId != 0, "Chain: unknown ID");
        _chains[chainId].active = active;
        emit ChainStatusChanged(chainId, active);
    }

    function getChain(uint256 chainId) external view returns (Chain memory) {
        return _chains[chainId];
    }

    function isSupported(uint256 chainId) external view returns (bool) {
        return _chains[chainId].active;
    }
}
