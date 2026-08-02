// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AI Hub Identity Registry
/// @notice Maps a user's AI Hub identity to verified external addresses and chains.
contract IdentityRegistry is Ownable {
    struct Identity {
        bytes32 identityId;
        uint64 createdAt;
        bool active;
    }

    mapping(address => Identity) private _identities;
    mapping(bytes32 => address) public identityOwner;
    mapping(address => mapping(uint256 => address)) public linkedAddress;
    mapping(address => mapping(uint256 => bool)) public linkedChain;

    event IdentityCreated(address indexed account, bytes32 indexed identityId);
    event IdentityStatusChanged(address indexed account, bool active);
    event AddressLinked(address indexed identity, uint256 indexed chainId, address linked);
    event AddressUnlinked(address indexed identity, uint256 indexed chainId, address linked);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function createIdentity(bytes32 identityId) external {
        require(identityId != bytes32(0), "Identity: empty ID");
        require(!_identities[msg.sender].active, "Identity: already exists");
        require(identityOwner[identityId] == address(0), "Identity: ID taken");

        _identities[msg.sender] = Identity({
            identityId: identityId,
            createdAt: uint64(block.timestamp),
            active: true
        });
        identityOwner[identityId] = msg.sender;

        emit IdentityCreated(msg.sender, identityId);
    }

    function setActive(bool active) external {
        require(_identities[msg.sender].identityId != bytes32(0), "Identity: not found");
        _identities[msg.sender].active = active;
        emit IdentityStatusChanged(msg.sender, active);
    }

    function linkAddress(uint256 chainId, address account) external {
        require(_identities[msg.sender].active, "Identity: inactive");
        require(chainId != 0, "Identity: invalid chain");
        require(account != address(0), "Identity: zero address");
        require(linkedAddress[msg.sender][chainId] == address(0), "Identity: chain linked");

        linkedAddress[msg.sender][chainId] = account;
        linkedChain[msg.sender][chainId] = true;
        emit AddressLinked(msg.sender, chainId, account);
    }

    function unlinkAddress(uint256 chainId) external {
        address linked = linkedAddress[msg.sender][chainId];
        require(linked != address(0), "Identity: no linked address");

        delete linkedAddress[msg.sender][chainId];
        linkedChain[msg.sender][chainId] = false;
        emit AddressUnlinked(msg.sender, chainId, linked);
    }

    function getIdentity(address account) external view returns (Identity memory) {
        return _identities[account];
    }
}
