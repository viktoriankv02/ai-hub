// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPointsModule} from "../interfaces/IPointsModule.sol";

/// @title AI Hub Reward Engine
/// @notice Connects verified reward rules to the points ledger.
contract RewardEngine is Ownable {
    IPointsModule public immutable pointsModule;

    mapping(bytes32 => uint256) public rewardByReason;

    event RewardRuleSet(bytes32 indexed reason, uint256 points);
    event RewardGranted(address indexed user, bytes32 indexed reason, uint256 points);

    constructor(address initialOwner, address pointsModuleAddress) Ownable(initialOwner) {
        require(pointsModuleAddress != address(0), "Rewards: zero points module");
        pointsModule = IPointsModule(pointsModuleAddress);
    }

    function setReward(bytes32 reason, uint256 points) external onlyOwner {
        require(reason != bytes32(0), "Rewards: empty reason");
        require(points > 0, "Rewards: zero points");
        rewardByReason[reason] = points;
        emit RewardRuleSet(reason, points);
    }

    function grantReward(address user, bytes32 reason) external onlyOwner {
        uint256 points = rewardByReason[reason];
        require(points > 0, "Rewards: rule not configured");
        pointsModule.awardPoints(user, points, reason);
        emit RewardGranted(user, reason, points);
    }
}
