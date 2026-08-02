// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AI Hub Chain Registry
/// @notice Canonical registry of supported source chains and their adapters.
contract ChainRegistry is Ownable {
    struct Chain {
        uint256 chainId;
        bytes32 nameHash;
        bytes32 vmType;
        address adapter;
        bool active;
        bool testnet;
    }

    mapping(uint256 => Chain) private _chains;
    mapping(bytes32 => uint256) public chainIdByName;
    mapping(address => bool) public adapterAuthorized;
    uint256[] private _chainIds;

    event ChainRegistered(uint256 indexed chainId, bytes32 indexed nameHash, bytes32 vmType, address adapter, bool testnet);
    event ChainUpdated(uint256 indexed chainId, address indexed adapter, bool active);
    event ChainStatusChanged(uint256 indexed chainId, bool active);
    event AdapterAuthorized(address indexed adapter, bool authorized);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerChain(
        uint256 chainId,
        bytes32 nameHash,
        bytes32 vmType,
        address adapter,
        bool active,
        bool testnet
    ) external onlyOwner {
        require(chainId != 0, "Chain: invalid ID");
        require(nameHash != bytes32(0), "Chain: empty name");
        require(vmType != bytes32(0), "Chain: empty VM");
        require(adapter != address(0), "Chain: zero adapter");
        require(_chains[chainId].chainId == 0, "Chain: already registered");
        require(chainIdByName[nameHash] == 0, "Chain: name already used");
        require(adapterAuthorized[adapter], "Chain: adapter unauthorized");

        _chains[chainId] = Chain(chainId, nameHash, vmType, adapter, active, testnet);
        chainIdByName[nameHash] = chainId;
        _chainIds.push(chainId);
        emit ChainRegistered(chainId, nameHash, vmType, adapter, testnet);
    }

    function updateChain(uint256 chainId, address adapter, bool active) external onlyOwner {
        Chain storage chain = _chains[chainId];
        require(chain.chainId != 0, "Chain: unknown ID");
        require(adapter != address(0), "Chain: zero adapter");
        require(adapterAuthorized[adapter], "Chain: adapter unauthorized");
        chain.adapter = adapter;
        chain.active = active;
        emit ChainUpdated(chainId, adapter, active);
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
        require(_chains[chainId].chainId != 0, "Chain: unknown ID");
        return _chains[chainId];
    }

    function getChainByName(bytes32 nameHash) external view returns (Chain memory) {
        uint256 chainId = chainIdByName[nameHash];
        require(chainId != 0, "Chain: unknown name");
        return _chains[chainId];
    }

    function isSupported(uint256 chainId) external view returns (bool) {
        return _chains[chainId].active;
    }

    function chainCount() external view returns (uint256) { return _chainIds.length; }
    function chainIdAt(uint256 index) external view returns (uint256) { return _chainIds[index]; }
}
