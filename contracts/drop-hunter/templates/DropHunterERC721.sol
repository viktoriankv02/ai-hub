// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract DropHunterERC721 is ERC721 {
    uint256 public nextTokenId;

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {}

    function mint() external returns (uint256 tokenId) {
        tokenId = nextTokenId;
        unchecked {
            nextTokenId += 1;
        }
        _safeMint(msg.sender, tokenId);
    }
}
