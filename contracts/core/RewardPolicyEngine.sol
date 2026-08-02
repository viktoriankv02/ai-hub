// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPointsModule} from "../interfaces/IPointsModule.sol";

/// @title AI Hub Reward Policy Engine
/// @notice Applies deterministic reward policies to unique verified activities.
contract RewardPolicyEngine is Ownable {
    struct Policy {
        bytes32 activityType;
        uint256 chainId;
        uint256 points;
        bool verifiedOnly;
        bool active;
    }

    IPointsModule public immutable pointsModule;

    mapping(bytes32 => Policy) private _policies;
    mapping(bytes32 => mapping(address => bool)) public claimed;

    event PolicySet(
        bytes32 indexed policyId,
        bytes32 indexed activityType,
        uint256 indexed chainId,
        uint256 points,
        bool verifiedOnly,
        bool active
    );
    event RewardClaimed(
        bytes32 indexed policyId,
        address indexed user,
        bytes32 indexed activityId,
        uint256 points
    );

    constructor(address initialOwner, address pointsModuleAddress) Ownable(initialOwner) {
        require(pointsModuleAddress != address(0), "Policy: zero points module");
        pointsModule = IPointsModule(pointsModuleAddress);
    }

    function setPolicy(
        bytes32 policyId,
        bytes32 activityType,
        uint256 chainId,
        uint256 points,
        bool verifiedOnly,
        bool active
    ) external onlyOwner {
        require(policyId != bytes32(0), "Policy: empty ID");
        require(activityType != bytes32(0), "Policy: empty activity");
        require(chainId != 0, "Policy: invalid chain");
        require(points > 0, "Policy: zero points");

        _policies[policyId] = Policy({
            activityType: activityType,
            chainId: chainId,
            points: points,
            verifiedOnly: verifiedOnly,
            active: active
        });

        emit PolicySet(policyId, activityType, chainId, points, verifiedOnly, active);
    }

    function setPolicyActive(bytes32 policyId, bool active) external onlyOwner {
        require(_policies[policyId].activityType != bytes32(0), "Policy: unknown ID");
        _policies[policyId].active = active;
        emit PolicySet(
            policyId,
            _policies[policyId].activityType,
            _policies[policyId].chainId,
            _policies[policyId].points,
            _policies[policyId].verifiedOnly,
            active
        );
    }

    function claim(
        bytes32 policyId,
        address user,
        bytes32 activityId,
        bytes32 activityType,
        uint256 chainId,
        bool verified
    ) external onlyOwner {
        Policy memory policy = _policies[policyId];
        require(policy.active, "Policy: inactive");
        require(user != address(0), "Policy: zero user");
        require(activityId != bytes32(0), "Policy: empty activity ID");
        require(activityType == policy.activityType, "Policy: activity mismatch");
        require(chainId == policy.chainId, "Policy: chain mismatch");
        require(!policy.verifiedOnly || verified, "Policy: verification required");
        require(!claimed[policyId][user], "Policy: already claimed");

        claimed[policyId][user] = true;
        pointsModule.awardPoints(user, policy.points, policyId);
        emit RewardClaimed(policyId, user, activityId, policy.points);
    }

    function getPolicy(bytes32 policyId) external view returns (Policy memory) {
        return _policies[policyId];
    }
}
