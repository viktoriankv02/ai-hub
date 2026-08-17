// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AI Hub Reward Vault
/// @notice Treasury vault for native-token and ERC-20 rewards with replay-safe
///         claims and configurable treasury risk limits.
contract RewardVault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant DAY = 1 days;

    mapping(address => bool) public rewardManagers;
    mapping(bytes32 => bool) public claimed;

    // Zero means the corresponding limit is disabled.
    uint256 public maxNativeClaim;
    uint256 public maxERC20Claim;
    uint256 public dailyNativeBudget;
    uint256 public dailyNativeSpent;
    uint256 public dailyNativeSpentAt;

    mapping(address => uint256) public erc20DailyBudget;
    mapping(address => uint256) public erc20DailySpent;
    mapping(address => uint256) public erc20DailySpentAt;

    event RewardManagerSet(address indexed manager, bool enabled);
    event NativeFunded(address indexed funder, uint256 amount);
    event ERC20Funded(address indexed funder, address indexed token, uint256 amount);
    event NativeRewardClaimed(bytes32 indexed claimId, address indexed recipient, uint256 amount);
    event ERC20RewardClaimed(bytes32 indexed claimId, address indexed token, address indexed recipient, uint256 amount);
    event EmergencyWithdrawal(address indexed token, address indexed recipient, uint256 amount);
    event RiskLimitsUpdated(uint256 maxNativeClaim, uint256 maxERC20Claim, uint256 dailyNativeBudget);
    event ERC20DailyBudgetUpdated(address indexed token, uint256 budget);

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

    function setRiskLimits(
        uint256 newMaxNativeClaim,
        uint256 newMaxERC20Claim,
        uint256 newDailyNativeBudget
    ) external onlyOwner {
        maxNativeClaim = newMaxNativeClaim;
        maxERC20Claim = newMaxERC20Claim;
        dailyNativeBudget = newDailyNativeBudget;
        emit RiskLimitsUpdated(newMaxNativeClaim, newMaxERC20Claim, newDailyNativeBudget);
    }

    function setERC20DailyBudget(address token, uint256 budget) external onlyOwner {
        require(token != address(0), "Vault: zero token");
        erc20DailyBudget[token] = budget;
        emit ERC20DailyBudgetUpdated(token, budget);
    }

    function fundERC20(address token, uint256 amount) external whenNotPaused {
        require(token != address(0), "Vault: zero token");
        require(amount > 0, "Vault: zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit ERC20Funded(msg.sender, token, amount);
    }

    function claimNative(
        bytes32 claimId,
        address payable recipient,
        uint256 amount
    ) external onlyManager whenNotPaused nonReentrant {
        _consumeClaim(claimId, recipient, amount);
        _checkNativeLimits(amount);
        require(address(this).balance >= amount, "Vault: insufficient native balance");
        _recordNativeSpend(amount);

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Vault: native transfer failed");
        emit NativeRewardClaimed(claimId, recipient, amount);
    }

    function claimERC20(
        bytes32 claimId,
        address token,
        address recipient,
        uint256 amount
    ) external onlyManager whenNotPaused nonReentrant {
        require(token != address(0), "Vault: zero token");
        _consumeClaim(claimId, recipient, amount);
        _checkERC20Limits(token, amount);
        _recordERC20Spend(token, amount);
        IERC20(token).safeTransfer(recipient, amount);
        emit ERC20RewardClaimed(claimId, token, recipient, amount);
    }

    function nativeRiskState() external view returns (uint256 spent, uint256 budget, uint256 resetAt) {
        if (dailyNativeSpentAt == 0 || block.timestamp >= dailyNativeSpentAt + DAY) {
            return (0, dailyNativeBudget, block.timestamp + DAY);
        }
        return (dailyNativeSpent, dailyNativeBudget, dailyNativeSpentAt + DAY);
    }

    function erc20RiskState(address token) external view returns (uint256 spent, uint256 budget, uint256 resetAt) {
        require(token != address(0), "Vault: zero token");
        uint256 startedAt = erc20DailySpentAt[token];
        if (startedAt == 0 || block.timestamp >= startedAt + DAY) {
            return (0, erc20DailyBudget[token], block.timestamp + DAY);
        }
        return (erc20DailySpent[token], erc20DailyBudget[token], startedAt + DAY);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

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

    function _checkNativeLimits(uint256 amount) internal view {
        if (maxNativeClaim > 0) require(amount <= maxNativeClaim, "Vault: native claim exceeds max");
        if (dailyNativeBudget > 0) {
            uint256 spent = _currentNativeSpent();
            require(spent + amount <= dailyNativeBudget, "Vault: native daily budget exceeded");
        }
    }

    function _checkERC20Limits(address token, uint256 amount) internal view {
        if (maxERC20Claim > 0) require(amount <= maxERC20Claim, "Vault: ERC20 claim exceeds max");
        uint256 budget = erc20DailyBudget[token];
        if (budget > 0) {
            uint256 spent = _currentERC20Spent(token);
            require(spent + amount <= budget, "Vault: ERC20 daily budget exceeded");
        }
    }

    function _recordNativeSpend(uint256 amount) internal {
        if (dailyNativeBudget == 0) return;
        if (dailyNativeSpentAt == 0 || block.timestamp >= dailyNativeSpentAt + DAY) {
            dailyNativeSpentAt = block.timestamp;
            dailyNativeSpent = amount;
        } else {
            dailyNativeSpent += amount;
        }
    }

    function _recordERC20Spend(address token, uint256 amount) internal {
        if (erc20DailyBudget[token] == 0) return;
        if (erc20DailySpentAt[token] == 0 || block.timestamp >= erc20DailySpentAt[token] + DAY) {
            erc20DailySpentAt[token] = block.timestamp;
            erc20DailySpent[token] = amount;
        } else {
            erc20DailySpent[token] += amount;
        }
    }

    function _currentNativeSpent() internal view returns (uint256) {
        if (dailyNativeSpentAt == 0 || block.timestamp >= dailyNativeSpentAt + DAY) return 0;
        return dailyNativeSpent;
    }

    function _currentERC20Spent(address token) internal view returns (uint256) {
        uint256 startedAt = erc20DailySpentAt[token];
        if (startedAt == 0 || block.timestamp >= startedAt + DAY) return 0;
        return erc20DailySpent[token];
    }

    function _consumeClaim(bytes32 claimId, address recipient, uint256 amount) internal {
        require(claimId != bytes32(0), "Vault: empty claim ID");
        require(recipient != address(0), "Vault: zero recipient");
        require(amount > 0, "Vault: zero amount");
        require(!claimed[claimId], "Vault: claim already used");
        claimed[claimId] = true;
    }
}
