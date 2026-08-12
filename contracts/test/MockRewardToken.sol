// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockRewardToken is ERC20 {
    constructor() ERC20("AI Hub Test Token", "AIHT") {
        _mint(msg.sender, 1_000_000 ether);
    }
}
