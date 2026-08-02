// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPointsModule {
    function awardPoints(address user, uint256 amount, bytes32 reason) external;
}
