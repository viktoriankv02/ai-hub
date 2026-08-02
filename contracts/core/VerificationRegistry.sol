// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AI Hub Verification Registry
/// @notice Stores verification attestations for identities and linked addresses.
contract VerificationRegistry is Ownable {
    enum Status {
        NONE,
        VERIFIED,
        REVOKED
    }

    struct Verification {
        bytes32 identityId;
        uint256 chainId;
        address account;
        bytes32 method;
        bytes32 proofHash;
        uint64 verifiedAt;
        Status status;
    }

    mapping(bytes32 => Verification) private _verifications;
    mapping(bytes32 => bytes32) public verificationByIdentityAndChain;

    event VerificationSet(
        bytes32 indexed verificationId,
        bytes32 indexed identityId,
        uint256 indexed chainId,
        address account,
        bytes32 method,
        bytes32 proofHash
    );
    event VerificationRevoked(bytes32 indexed verificationId, bytes32 indexed identityId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function verify(
        bytes32 verificationId,
        bytes32 identityId,
        uint256 chainId,
        address account,
        bytes32 method,
        bytes32 proofHash
    ) external onlyOwner {
        require(verificationId != bytes32(0), "Verification: empty ID");
        require(identityId != bytes32(0), "Verification: empty identity");
        require(chainId != 0, "Verification: invalid chain");
        require(account != address(0), "Verification: zero account");
        require(method != bytes32(0), "Verification: empty method");
        require(_verifications[verificationId].status == Status.NONE, "Verification: exists");

        bytes32 key = keccak256(abi.encode(identityId, chainId));
        require(
            verificationByIdentityAndChain[key] == bytes32(0),
            "Verification: chain already verified"
        );

        _verifications[verificationId] = Verification({
            identityId: identityId,
            chainId: chainId,
            account: account,
            method: method,
            proofHash: proofHash,
            verifiedAt: uint64(block.timestamp),
            status: Status.VERIFIED
        });

        verificationByIdentityAndChain[key] = verificationId;

        emit VerificationSet(
            verificationId,
            identityId,
            chainId,
            account,
            method,
            proofHash
        );
    }

    function revoke(bytes32 verificationId) external onlyOwner {
        Verification storage verification = _verifications[verificationId];
        require(verification.status == Status.VERIFIED, "Verification: not active");

        verification.status = Status.REVOKED;
        bytes32 key = keccak256(abi.encode(verification.identityId, verification.chainId));
        delete verificationByIdentityAndChain[key];

        emit VerificationRevoked(verificationId, verification.identityId);
    }

    function getVerification(bytes32 verificationId) external view returns (Verification memory) {
        return _verifications[verificationId];
    }

    function isVerified(bytes32 identityId, uint256 chainId) external view returns (bool) {
        bytes32 verificationId = verificationByIdentityAndChain[
            keccak256(abi.encode(identityId, chainId))
        ];
        return verificationId != bytes32(0) && _verifications[verificationId].status == Status.VERIFIED;
    }
}
