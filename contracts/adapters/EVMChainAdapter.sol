// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IChainAdapter} from "../interfaces/IChainAdapter.sol";

/// @title AI Hub EVM Chain Adapter
/// @notice Common adapter metadata for EVM-compatible chains. Activity verification is intentionally external.
contract EVMChainAdapter is Ownable, IChainAdapter {
    uint256 private immutable _chainId;
    bytes32 private immutable _vmType;
    bool private _available;
    mapping(bytes32 => bool) public verifiedActivities;

    event AvailabilityChanged(bool available);
    event ActivityVerified(bytes32 indexed activityId, address indexed user);
    event ActivityRevoked(bytes32 indexed activityId);

    constructor(address initialOwner, uint256 chainId_, bytes32 vmType_) Ownable(initialOwner) {
        require(chainId_ != 0, "EVMAdapter: invalid chain");
        require(vmType_ != bytes32(0), "EVMAdapter: empty VM");
        _chainId = chainId_;
        _vmType = vmType_;
        _available = true;
    }

    function chainId() external view returns (uint256) {
        return _chainId;
    }

    function vmType() external view returns (bytes32) {
        return _vmType;
    }

    function isAvailable() external view returns (bool) {
        return _available;
    }

    function setAvailable(bool available) external onlyOwner {
        _available = available;
        emit AvailabilityChanged(available);
    }

    /// @dev A trusted relayer/oracle records the result of off-chain RPC/log verification.
    /// The contract deliberately does not pretend that an EVM contract can inspect another chain's state.
    function setActivityVerified(bytes32 activityId, address user, bool verified) external onlyOwner {
        require(activityId != bytes32(0), "EVMAdapter: empty activity");
        require(user != address(0), "EVMAdapter: zero user");
        verifiedActivities[activityId] = verified;
        if (verified) emit ActivityVerified(activityId, user);
        else emit ActivityRevoked(activityId);
    }

    function verifyActivity(
        bytes32 activityId,
        address user,
        bytes calldata
    ) external view returns (bool) {
        if (!_available || activityId == bytes32(0) || user == address(0)) return false;
        return verifiedActivities[activityId];
    }
}
