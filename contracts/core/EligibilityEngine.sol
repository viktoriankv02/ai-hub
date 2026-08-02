// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AI Hub Eligibility Engine
/// @notice Deterministic anti-abuse and reward eligibility rules.
contract EligibilityEngine is Ownable {
    struct Rule {
        uint64 minIdentityAge;
        uint64 cooldown;
        uint32 maxClaims;
        uint256 maxPointsPerPeriod;
        bool requireVerified;
        bool active;
    }

    struct UserState {
        uint64 firstSeenAt;
        uint64 lastClaimAt;
        uint32 claims;
        uint256 periodStart;
        uint256 periodPoints;
    }

    mapping(bytes32 => Rule) private _rules;
    mapping(bytes32 => mapping(address => UserState)) private _states;
    mapping(address => bool) public blocked;

    event RuleSet(bytes32 indexed ruleId, uint64 minIdentityAge, uint64 cooldown, uint32 maxClaims, uint256 maxPointsPerPeriod, bool requireVerified, bool active);
    event UserBlocked(address indexed user, bool blocked);
    event EligibilityInitialized(bytes32 indexed ruleId, address indexed user, uint256 timestamp);
    event RewardConsumed(bytes32 indexed ruleId, address indexed user, uint256 points, uint256 timestamp);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setRule(
        bytes32 ruleId,
        uint64 minIdentityAge,
        uint64 cooldown,
        uint32 maxClaims,
        uint256 maxPointsPerPeriod,
        bool requireVerified,
        bool active
    ) external onlyOwner {
        require(ruleId != bytes32(0), "Eligibility: empty ID");
        require(maxClaims > 0, "Eligibility: zero claims");
        require(maxPointsPerPeriod > 0, "Eligibility: zero period cap");

        _rules[ruleId] = Rule({
            minIdentityAge: minIdentityAge,
            cooldown: cooldown,
            maxClaims: maxClaims,
            maxPointsPerPeriod: maxPointsPerPeriod,
            requireVerified: requireVerified,
            active: active
        });

        emit RuleSet(ruleId, minIdentityAge, cooldown, maxClaims, maxPointsPerPeriod, requireVerified, active);
    }

    function setBlocked(address user, bool isBlocked) external onlyOwner {
        require(user != address(0), "Eligibility: zero user");
        blocked[user] = isBlocked;
        emit UserBlocked(user, isBlocked);
    }

    function initialize(bytes32 ruleId, address user) external onlyOwner {
        require(_rules[ruleId].active, "Eligibility: inactive rule");
        require(user != address(0), "Eligibility: zero user");
        UserState storage state = _states[ruleId][user];
        if (state.firstSeenAt == 0) {
            state.firstSeenAt = uint64(block.timestamp);
            state.periodStart = block.timestamp;
            emit EligibilityInitialized(ruleId, user, block.timestamp);
        }
    }

    function canConsume(
        bytes32 ruleId,
        address user,
        uint256 points,
        bool verified
    ) external view returns (bool eligible, bytes32 reason) {
        Rule memory rule = _rules[ruleId];
        UserState memory state = _states[ruleId][user];

        if (!rule.active) return (false, "INACTIVE_RULE");
        if (blocked[user]) return (false, "BLOCKED");
        if (points == 0 || points > rule.maxPointsPerPeriod) return (false, "INVALID_POINTS");
        if (state.firstSeenAt == 0) return (false, "NOT_INITIALIZED");
        if (block.timestamp < uint256(state.firstSeenAt) + rule.minIdentityAge) return (false, "IDENTITY_TOO_NEW");
        if (state.claims >= rule.maxClaims) return (false, "CLAIM_LIMIT");
        if (rule.cooldown > 0 && state.lastClaimAt > 0 && block.timestamp < uint256(state.lastClaimAt) + rule.cooldown) return (false, "COOLDOWN");
        if (rule.requireVerified && !verified) return (false, "VERIFICATION_REQUIRED");

        uint256 currentPeriodPoints = state.periodPoints;
        if (block.timestamp >= state.periodStart + 30 days) currentPeriodPoints = 0;
        if (currentPeriodPoints + points > rule.maxPointsPerPeriod) return (false, "PERIOD_CAP");

        return (true, bytes32(0));
    }

    function consume(
        bytes32 ruleId,
        address user,
        uint256 points,
        bool verified
    ) external onlyOwner {
        (bool eligible, bytes32 reason) = this.canConsume(ruleId, user, points, verified);
        require(eligible, string.concat("Eligibility: ", _reasonText(reason)));

        UserState storage state = _states[ruleId][user];
        if (block.timestamp >= state.periodStart + 30 days) {
            state.periodStart = block.timestamp;
            state.periodPoints = 0;
        }

        state.lastClaimAt = uint64(block.timestamp);
        state.claims += 1;
        state.periodPoints += points;

        emit RewardConsumed(ruleId, user, points, block.timestamp);
    }

    function getRule(bytes32 ruleId) external view returns (Rule memory) {
        return _rules[ruleId];
    }

    function getUserState(bytes32 ruleId, address user) external view returns (UserState memory) {
        return _states[ruleId][user];
    }

    function _reasonText(bytes32 reason) internal pure returns (string memory) {
        if (reason == bytes32("INACTIVE_RULE")) return "inactive rule";
        if (reason == bytes32("BLOCKED")) return "blocked";
        if (reason == bytes32("INVALID_POINTS")) return "invalid points";
        if (reason == bytes32("NOT_INITIALIZED")) return "not initialized";
        if (reason == bytes32("IDENTITY_TOO_NEW")) return "identity too new";
        if (reason == bytes32("CLAIM_LIMIT")) return "claim limit";
        if (reason == bytes32("COOLDOWN")) return "cooldown";
        if (reason == bytes32("VERIFICATION_REQUIRED")) return "verification required";
        if (reason == bytes32("PERIOD_CAP")) return "period cap";
        return "not eligible";
    }
}
