// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AI Hub Reward Vault
/// @notice Treasury vault for native-token and ERC-20 rewards with replay-safe claims.
contract RewardVault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    mapping(address => bool) public rewardManagers;
    mapping(bytes32 => bool) public claimed;

    event RewardManagerSet(address indexed manager, bool enabled);
    event NativeFunded(address indexed funder, uint256 amount);
    event ERC20Funded(address indexed funder, address indexed token, uint256 amount);
    event NativeRewardClaimed(bytes32 indexed claimId, address indexed recipient, uint256 amount);
    event ERC20RewardClaimed(bytes32 indexed claimId, address indexed token, address indexed recipient, uint256 amount);
    event EmergencyWithdrawal(address indexed token, address indexed recipient, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyManager() {
        require(rewardManagers[msg.sender], "Vault: unauthorized manager");
        _;
    }

    receive() external payable {
        emit NativeFunded(msg.sender, msg.value);
    }

    function setRewardManager(address manager, bool enabled) external onlyOwner {
        require(manager != address(0), "Vault: zero manager");
        rewardManagers[manager] = enabled;
        emit RewardManagerSet(manager, enabled);
    }

    function fundERC20(address token, uint256 amount) external whenNotPaused {
        require(token != address(0), "Vault: zero token");
        require(amount > 0, "Vault: zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit ERC20Funded(msg.sender, token, amount);
    }

    function claimNative(bytes32 claimId, address payable recipient, uint256 amount) external onlyManager whenNotPaused nonReentrant {
        _consumeClaim(claimId, recipient, amount);
        require(address(this).balance >= amount, "Vault: insufficient native balance");
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Vault: native transfer failed");
        emit NativeRewardClaimed(claimId, recipient, amount);
    }

    function claimERC20(bytes32 claimId, address token, address recipient, uint256 amount) external onlyManager whenNotPaused nonReentrant {
        require(token != address(0), "Vault: zero token");
        _consumeClaim(claimId, recipient, amount);
        IERC20(token).safeTransfer(recipient, amount);
        emit ERC20RewardClaimed(claimId, token, recipient, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function emergencyWithdrawNative(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        require(recipient != address(0), "Vault: zero recipient");
        require(address(this).balance >= amount, "Vault: insufficient native balance");
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Vault: native transfer failed");
        emit EmergencyWithdrawal(address(0), recipient, amount);
    }

    function emergencyWithdrawERC20(address token, address recipient, uint256 amount) external onlyOwner nonReentrant {
        require(token != address(0), "Vault: zero token");
        require(recipient != address(0), "Vault: zero recipient");
        IERC20(token).safeTransfer(recipient, amount);
        emit EmergencyWithdrawal(token, recipient, amount);
    }

    function _consumeClaim(bytes32 claimId, address recipient, uint256 amount) internal {
        require(claimId != bytes32(0), "Vault: empty claim ID");
        require(recipient != address(0), "Vault: zero recipient");
        require(amount > 0, "Vault: zero amount");
        require(!claimed[claimId], "Vault: claim already used");
        claimed[claimId] = true;
    }
}
