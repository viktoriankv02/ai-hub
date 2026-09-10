// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title AI Hub Reward Token
/// @notice Fixed-supply ERC-20 used to fund AI job rewards.
/// @dev There is deliberately no public mint function. The complete initial supply is
///      minted once at deployment and assigned to the configured treasury.
contract AIHubRewardToken is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 ether;

    constructor(address treasury) ERC20("AI Hub Reward Token", "AIHUB") {
        require(treasury != address(0), "AIHUB: zero treasury");
        _mint(treasury, INITIAL_SUPPLY);
    }
}
