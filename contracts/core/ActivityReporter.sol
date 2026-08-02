// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IActivityRegistry} from "../interfaces/IActivityRegistry.sol";

/// @title AI Hub Activity Reporter
/// @notice Controlled adapter for protocols that need to submit verified activities.
contract ActivityReporter is Ownable {
    IActivityRegistry public immutable registry;

    mapping(address => bool) public reporters;

    event ReporterSet(address indexed reporter, bool enabled);
    event ActivitySubmitted(address indexed reporter, address indexed user, uint256 activityId);

    constructor(address initialOwner, address registryAddress) Ownable(initialOwner) {
        require(registryAddress != address(0), "Reporter: zero registry");
        registry = IActivityRegistry(registryAddress);
    }

    function setReporter(address reporter, bool enabled) external onlyOwner {
        require(reporter != address(0), "Reporter: zero reporter");
        reporters[reporter] = enabled;
        emit ReporterSet(reporter, enabled);
    }

    function submit(
        address user,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bool verified
    ) external returns (uint256 activityId) {
        require(reporters[msg.sender], "Reporter: unauthorized");

        activityId = registry.recordActivity(
            user,
            activityType,
            projectId,
            metadataHash,
            verified
        );

        emit ActivitySubmitted(msg.sender, user, activityId);
    }
}
