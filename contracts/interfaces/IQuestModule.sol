// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IQuestModule {
    function completeQuest(bytes32 questId) external returns (uint256 points);
}
