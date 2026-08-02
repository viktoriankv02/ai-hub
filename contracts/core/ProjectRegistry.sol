// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AI Hub Project Registry
/// @notice Registry of protocols/projects whose activities can be tracked by AI Hub.
contract ProjectRegistry is Ownable {
    struct Project {
        bytes32 projectId;
        bytes32 nameHash;
        uint64 createdAt;
        bool active;
    }

    mapping(bytes32 => Project) private _projects;
    mapping(bytes32 => mapping(uint256 => bool)) public supportedChains;

    event ProjectCreated(bytes32 indexed projectId, bytes32 indexed nameHash);
    event ProjectStatusChanged(bytes32 indexed projectId, bool active);
    event ProjectChainSet(bytes32 indexed projectId, uint256 indexed chainId, bool supported);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function createProject(bytes32 projectId, bytes32 nameHash) external onlyOwner {
        require(projectId != bytes32(0), "Project: empty ID");
        require(nameHash != bytes32(0), "Project: empty name");
        require(_projects[projectId].projectId == bytes32(0), "Project: already exists");

        _projects[projectId] = Project({
            projectId: projectId,
            nameHash: nameHash,
            createdAt: uint64(block.timestamp),
            active: true
        });

        emit ProjectCreated(projectId, nameHash);
    }

    function setProjectActive(bytes32 projectId, bool active) external onlyOwner {
        require(_projects[projectId].projectId != bytes32(0), "Project: unknown ID");
        _projects[projectId].active = active;
        emit ProjectStatusChanged(projectId, active);
    }

    function setSupportedChain(
        bytes32 projectId,
        uint256 chainId,
        bool supported
    ) external onlyOwner {
        require(_projects[projectId].active, "Project: inactive");
        require(chainId != 0, "Project: invalid chain");
        supportedChains[projectId][chainId] = supported;
        emit ProjectChainSet(projectId, chainId, supported);
    }

    function getProject(bytes32 projectId) external view returns (Project memory) {
        return _projects[projectId];
    }
}
