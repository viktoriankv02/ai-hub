// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IEligibilityEngine {
    function initialize(bytes32 ruleId, address user) external;
    function consume(bytes32 ruleId, address user, uint256 points, bool verified) external;
    function canConsume(bytes32 ruleId, address user, uint256 points, bool verified) external view returns (bool eligible, bytes32 reason);
}
