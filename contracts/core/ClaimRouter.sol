// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IClaimEligibility {
    function consume(bytes32 ruleId, address user, uint256 points, bool verified) external;
}

interface IClaimPolicy {
    function getPolicy(bytes32 policyId) external view returns (
        bytes32 activityType,
        uint256 chainId,
        uint256 points,
        bool verifiedOnly,
        bool active
    );

    function claim(
        bytes32 policyId,
        address user,
        bytes32 activityId,
        bytes32 activityType,
        uint256 chainId,
        bool verified
    ) external;
}

interface IClaimVault {
    function claimNative(bytes32 claimId, address payable recipient, uint256 amount) external;
    function claimERC20(bytes32 claimId, address token, address recipient, uint256 amount) external;
}

contract ClaimRouter is Ownable, Pausable {
    IClaimEligibility public immutable eligibility;
    IClaimPolicy public immutable policyEngine;
    IClaimVault public immutable rewardVault;

    mapping(bytes32 => bool) public executed;

    event NativeClaimExecuted(bytes32 indexed claimId, bytes32 indexed policyId, address indexed user, uint256 points, uint256 amount);
    event ERC20ClaimExecuted(bytes32 indexed claimId, bytes32 indexed policyId, address indexed user, address token, uint256 points, uint256 amount);

    constructor(address initialOwner, address eligibilityAddress, address policyAddress, address vaultAddress) Ownable(initialOwner) {
        require(eligibilityAddress != address(0), "Router: zero eligibility");
        require(policyAddress != address(0), "Router: zero policy");
        require(vaultAddress != address(0), "Router: zero vault");
        eligibility = IClaimEligibility(eligibilityAddress);
        policyEngine = IClaimPolicy(policyAddress);
        rewardVault = IClaimVault(vaultAddress);
    }

    function claimNative(bytes32 claimId, bytes32 policyId, bytes32 activityId, address user, bool verified, uint256 amount)
        external onlyOwner whenNotPaused
    {
        _beginClaim(claimId, user);
        (bytes32 activityType, uint256 chainId, uint256 points, bool verifiedOnly, bool active) = policyEngine.getPolicy(policyId);
        require(active, "Router: inactive policy");
        require(!verifiedOnly || verified, "Router: verification required");
        require(activityId != bytes32(0), "Router: empty activity");

        policyEngine.claim(policyId, user, activityId, activityType, chainId, verified);
        eligibility.consume(policyId, user, points, verified);
        rewardVault.claimNative(claimId, payable(user), amount);

        emit NativeClaimExecuted(claimId, policyId, user, points, amount);
    }

    function claimERC20(bytes32 claimId, bytes32 policyId, bytes32 activityId, address user, bool verified, address token, uint256 amount)
        external onlyOwner whenNotPaused
    {
        _beginClaim(claimId, user);
        (bytes32 activityType, uint256 chainId, uint256 points, bool verifiedOnly, bool active) = policyEngine.getPolicy(policyId);
        require(active, "Router: inactive policy");
        require(!verifiedOnly || verified, "Router: verification required");
        require(activityId != bytes32(0), "Router: empty activity");
        require(token != address(0), "Router: zero token");

        policyEngine.claim(policyId, user, activityId, activityType, chainId, verified);
        eligibility.consume(policyId, user, points, verified);
        rewardVault.claimERC20(claimId, token, user, amount);

        emit ERC20ClaimExecuted(claimId, policyId, user, token, points, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function _beginClaim(bytes32 claimId, address user) internal {
        require(claimId != bytes32(0), "Router: empty claim ID");
        require(user != address(0), "Router: zero user");
        require(!executed[claimId], "Router: claim already executed");
        executed[claimId] = true;
    }
}
