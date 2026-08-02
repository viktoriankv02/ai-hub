# AI Hub

AI Hub is a multi-chain smart-contract infrastructure project designed to provide a common application layer across EVM-compatible networks, with separate adapters for non-EVM ecosystems.

## Current architecture

- Solidity `0.8.28`
- Hardhat 3
- Ethers.js
- OpenZeppelin Contracts 5
- Hardhat Ignition
- Mocha + Chai tests
- Network registry for the target chains
- Sui marked as a separate Move implementation/adapter

## Core contract

`contracts/core/AIHub.sol` currently provides:

- user registration;
- on-chain activity recording;
- activity counters;
- chain ID in emitted events;
- owner-controlled pause/unpause.

This is intentionally the first minimal foundation. Reward, quest, referral, bridge and payment modules will be added incrementally after the core interface is stable.

## Network strategy

The project maintains one Solidity codebase for EVM-compatible chains. RPC endpoints, private keys and deployment secrets are supplied through environment variables and must never be committed.

The initial development targets are Ethereum Sepolia and Base Sepolia. Additional networks from `config/chains.ts` will be enabled only after their current RPC, chain ID, EVM compatibility and deployment requirements are verified.

## Local development

```bash
npm install
npm run compile
npm test
```

For deployment, set `DEPLOYER_PRIVATE_KEY` and the appropriate RPC environment variable, then use Hardhat Ignition with the selected network.
