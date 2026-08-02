// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AI Hub Verifier Registry
/// @notice Controls which off-chain reporters may submit verified activity.
contract VerifierRegistry is Ownable {
    struct Verifier {
        bool active;
        uint256 permissions;
    }

    uint256 public constant RECORD_ACTIVITY = 1 << 0;
    uint256 public constant REVOKE_ACTIVITY = 1 << 1;

    mapping(address => Verifier) private _verifiers;
    mapping(address => mapping(uint256 => bool)) public supportedChains;

    event VerifierSet(address indexed verifier, bool active, uint256 permissions);
    event VerifierChainSet(address indexed verifier, uint256 indexed chainId, bool supported);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setVerifier(address verifier, bool active, uint256 permissions) external onlyOwner {
        require(verifier != address(0), "Verifier: zero address");
        _verifiers[verifier] = Verifier(active, permissions);
        emit VerifierSet(verifier, active, permissions);
    }

    function setSupportedChain(address verifier, uint256 chainId, bool supported) external onlyOwner {
        require(_verifiers[verifier].active, "Verifier: inactive");
        require(chainId != 0, "Verifier: invalid chain");
        supportedChains[verifier][chainId] = supported;
        emit VerifierChainSet(verifier, chainId, supported);
    }

    function canRecord(address verifier, uint256 chainId) external view returns (bool) {
        Verifier memory v = _verifiers[verifier];
        return v.active && (v.permissions & RECORD_ACTIVITY) != 0 && supportedChains[verifier][chainId];
    }

    function canRevoke(address verifier, uint256 chainId) external view returns (bool) {
        Verifier memory v = _verifiers[verifier];
        return v.active && (v.permissions & REVOKE_ACTIVITY) != 0 && supportedChains[verifier][chainId];
    }

    function getVerifier(address verifier) external view returns (Verifier memory) {
        return _verifiers[verifier];
    }
}
