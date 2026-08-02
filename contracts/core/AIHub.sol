// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title AI Hub
/// @notice Minimal multi-chain core for registering users and recording protocol activity.
/// @dev Chain-agnostic Solidity contract intended for EVM-compatible networks.
contract AIHub is Ownable, Pausable {
    struct User {
        uint64 registeredAt;
        uint64 activityCount;
        bool registered;
    }

    mapping(address => User) private _users;
    uint256 public totalUsers;
    uint256 public totalActivities;

    event UserRegistered(address indexed user, uint256 indexed chainId, uint256 timestamp);
    event ActivityRecorded(
        address indexed user,
        bytes32 indexed activityType,
        uint256 indexed chainId,
        uint256 timestamp
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function register() external whenNotPaused {
        User storage user = _users[msg.sender];
        require(!user.registered, "AIHub: already registered");

        user.registered = true;
        user.registeredAt = uint64(block.timestamp);
        totalUsers += 1;

        emit UserRegistered(msg.sender, block.chainid, block.timestamp);
    }

    function recordActivity(bytes32 activityType) external whenNotPaused {
        require(_users[msg.sender].registered, "AIHub: not registered");
        require(activityType != bytes32(0), "AIHub: empty activity type");

        _users[msg.sender].activityCount += 1;
        totalActivities += 1;

        emit ActivityRecorded(msg.sender, activityType, block.chainid, block.timestamp);
    }

    function getUser(address account) external view returns (User memory) {
        return _users[account];
    }

    function isRegistered(address account) external view returns (bool) {
        return _users[account].registered;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
