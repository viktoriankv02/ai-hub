# AI Hub

AI Hub is a multi-chain smart-contract infrastructure project designed to provide a common application layer across EVM-compatible networks, with separate adapters for non-EVM ecosystems.

## Current architecture

- Solidity `0.8.28`
- Hardhat 3
- Ethers.js 6
- OpenZeppelin Contracts 5
- Hardhat Ignition
- Mocha + Chai tests
- Network registry and chain adapters
- Canonical activity registry
- Reward policy, eligibility, points and payout modules
- Drop Hunter discovery, scoring, execution gating and idempotency
- AI agent runtime + funded AI job pipeline

### AI agent execution pipeline

```text
AI Agent Runtime
      |
      v
AIAgentEngine -- ERC20-funded job --> completion reporter
      |
      v
AIJobActivityAdapter
      |
      v
ActivityRegistry
      |
      v
RewardPolicyEngine
      |
      v
EligibilityEngine
      |
      v
Points / Reward modules
```

The important design rule is that **AI jobs are one source of verified activity, not a separate reward system**. A completed job is converted into the same canonical activity format used by other adapters.

### AI agent contracts

- `contracts/ai/AIAgentRuntime.sol` — agent registration, verification, lifecycle state and heartbeat.
- `contracts/ai/AIAgentEngine.sol` — ERC20-funded job creation, assignment, authorized completion, payout and cancellation.
- `contracts/adapters/AIJobActivityAdapter.sol` — converts completed verified jobs into `ActivityRegistry` records and prevents duplicate reporting.

## Drop Hunter

Drop Hunter is the off-chain opportunity intelligence and execution layer. It already supports deterministic scoring, evidence, resilient discovery, execution gates, idempotency receipts, retries and EVM transaction reconciliation.

Run a normal report:

```bash
npm run drop-hunter
```

Run exactly one lightweight scan:

```bash
npm run drop-hunter:once
```

## Local development

```bash
npm install
npm run build
npm run compile
npm test
```

`npm run build` intentionally compiles production TypeScript under `tsconfig.build.json` and does not type-check tests. Hardhat remains responsible for compiling contracts and executing the test suite.

## Network strategy

The project maintains one Solidity codebase for EVM-compatible chains. RPC endpoints, private keys and deployment secrets are supplied through environment variables and must never be committed.

The initial development targets are Ethereum Sepolia and Base Sepolia. Additional networks from `config/chains.ts` will be enabled only after their current RPC, chain ID, EVM compatibility and deployment requirements are verified.
