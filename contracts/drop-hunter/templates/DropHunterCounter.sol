// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract DropHunterCounter {
    uint256 public count;

    event Incremented(address indexed caller, uint256 newValue);

    function increment() external {
        unchecked {
            count += 1;
        }
        emit Incremented(msg.sender, count);
    }
}
