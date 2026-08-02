// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IChainAdapter} from "../interfaces/IChainAdapter.sol";

/// @title AI Hub Sui Adapter
/// @notice Verification endpoint for Sui activity proofs supplied by an off-chain verifier.
contract SuiChainAdapter is Ownable, IChainAdapter {
    uint256 public constant SUI_MAINNET_CHAIN_ID = 101;
    uint256 public constant SUI_TESTNET_CHAIN_ID = 102;

    uint256 private immutable _chainId;
    bool private _available;
    mapping(bytes32 => bool) public verifiedActivities;

    event AvailabilityChanged(bool available);
    event ActivityVerified(bytes32 indexed activityId, address indexed user);
    event ActivityRevoked(bytes32 indexed activityId);

    constructor(address initialOwner, uint256 chainId_) Ownable(initialOwner) {
        require(
            chainId_ == SUI_MAINNET_CHAIN_ID || chainId_ == SUI_TESTNET_CHAIN_ID,
            "SuiAdapter: unsupported chain"
        );
        _chainId = chainId_;
        _available = true;
    }

    function chainId() external view returns (uint256) {
        return _chainId;
    }

    function vmType() external pure returns (bytes32) {
        return keccak256("SUI");
    }

    function isAvailable() external view returns (bool) {
        return _available;
    }

    function setAvailable(bool available) external onlyOwner {
        _available = available;
        emit AvailabilityChanged(available);
    }

    /// @dev The proof is validated off-chain and the resulting status is recorded here.
    /// The user address is included in the event; activity IDs must be globally unique within the adapter.
    function setActivityVerified(bytes32 activityId, address user, bool verified) external onlyOwner {
        require(activityId != bytes32(0), "SuiAdapter: empty activity");
        require(user != address(0), "SuiAdapter: zero user");
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
