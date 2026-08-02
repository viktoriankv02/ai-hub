// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AI Hub Points Module
/// @notice Stores protocol points earned from verified activities.
contract PointsModule is Ownable {
    mapping(address => uint256) private _points;
    mapping(address => bool) public pointWriters;
    uint256 public totalPoints;

    event PointWriterSet(address indexed writer, bool enabled);
    event PointsAwarded(address indexed user, uint256 amount, bytes32 indexed reason);
    event PointsRevoked(address indexed user, uint256 amount, bytes32 indexed reason);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyWriter() {
        require(pointWriters[msg.sender], "Points: unauthorized writer");
        _;
    }

    function setPointWriter(address writer, bool enabled) external onlyOwner {
        require(writer != address(0), "Points: zero writer");
        pointWriters[writer] = enabled;
        emit PointWriterSet(writer, enabled);
    }

    function awardPoints(
        address user,
        uint256 amount,
        bytes32 reason
    ) external onlyWriter {
        require(user != address(0), "Points: zero user");
        require(amount > 0, "Points: zero amount");
        require(reason != bytes32(0), "Points: empty reason");

        _points[user] += amount;
        totalPoints += amount;

        emit PointsAwarded(user, amount, reason);
    }

    function revokePoints(
        address user,
        uint256 amount,
        bytes32 reason
    ) external onlyOwner {
        require(user != address(0), "Points: zero user");
        require(amount > 0, "Points: zero amount");
        require(reason != bytes32(0), "Points: empty reason");
        require(_points[user] >= amount, "Points: insufficient balance");

        _points[user] -= amount;
        totalPoints -= amount;

        emit PointsRevoked(user, amount, reason);
    }

    function pointsOf(address user) external view returns (uint256) {
        return _points[user];
    }
}
