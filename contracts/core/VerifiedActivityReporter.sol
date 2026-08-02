// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IActivityRegistry} from "../interfaces/IActivityRegistry.sol";

interface IVerifierRegistry {
    function canRecord(address verifier, uint256 chainId) external view returns (bool);
    function canRevoke(address verifier, uint256 chainId) external view returns (bool);
}

/// @title AI Hub Verified Activity Reporter
/// @notice Gateway between authorized off-chain verifiers and ActivityRegistry.
contract VerifiedActivityReporter is Ownable {
    IVerifierRegistry public immutable verifierRegistry;
    IActivityRegistry public immutable activityRegistry;

    event ActivitySubmitted(address indexed verifier, address indexed user, uint256 indexed chainId);

    constructor(address initialOwner, address verifierRegistry_, address activityRegistry_) Ownable(initialOwner) {
        require(verifierRegistry_ != address(0), "Reporter: zero verifier registry");
        require(activityRegistry_ != address(0), "Reporter: zero activity registry");
        verifierRegistry = IVerifierRegistry(verifierRegistry_);
        activityRegistry = IActivityRegistry(activityRegistry_);
    }

    function submit(
        address user,
        uint256 chainId,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash
    ) external {
        require(verifierRegistry.canRecord(msg.sender, chainId), "Reporter: unauthorized verifier");
        activityRegistry.recordActivity(user, activityType, projectId, metadataHash, true);
        emit ActivitySubmitted(msg.sender, user, chainId);
    }
}
