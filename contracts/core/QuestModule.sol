// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AI Hub Quest Module
/// @notice Defines protocol quests and tracks one-time completion per user.
contract QuestModule is Ownable {
    struct Quest {
        bytes32 questId;
        bytes32 activityType;
        uint256 points;
        bool active;
    }

    mapping(bytes32 => Quest) private _quests;
    mapping(bytes32 => mapping(address => bool)) private _completed;

    event QuestCreated(
        bytes32 indexed questId,
        bytes32 indexed activityType,
        uint256 points
    );
    event QuestStatusChanged(bytes32 indexed questId, bool active);
    event QuestCompleted(address indexed user, bytes32 indexed questId, uint256 points);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function createQuest(
        bytes32 questId,
        bytes32 activityType,
        uint256 points
    ) external onlyOwner {
        require(questId != bytes32(0), "Quest: empty ID");
        require(activityType != bytes32(0), "Quest: empty activity type");
        require(points > 0, "Quest: zero points");
        require(!_quests[questId].active, "Quest: already exists");

        _quests[questId] = Quest({
            questId: questId,
            activityType: activityType,
            points: points,
            active: true
        });

        emit QuestCreated(questId, activityType, points);
    }

    function setQuestActive(bytes32 questId, bool active) external onlyOwner {
        require(_quests[questId].questId != bytes32(0), "Quest: unknown ID");
        _quests[questId].active = active;
        emit QuestStatusChanged(questId, active);
    }

    function completeQuest(bytes32 questId) external returns (uint256 points) {
        Quest memory quest = _quests[questId];
        require(quest.active, "Quest: inactive");
        require(!_completed[questId][msg.sender], "Quest: already completed");

        _completed[questId][msg.sender] = true;
        emit QuestCompleted(msg.sender, questId, quest.points);
        return quest.points;
    }

    function getQuest(bytes32 questId) external view returns (Quest memory) {
        return _quests[questId];
    }

    function hasCompleted(bytes32 questId, address user) external view returns (bool) {
        return _completed[questId][user];
    }
}
