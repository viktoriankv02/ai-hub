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
- Off-chain AI job orchestration, persistence, retry and batching
- Dependency-free local HTTP control plane for AI jobs
- Atomic AI completion -> verified activity bridge

### AI agent execution pipeline

```text
AI Agent Runtime
      |
      v
AIAgentEngine -- ERC20-funded job --> AIJobCompletionAdapter
                                      |
                                      +--> AIAgentEngine.completeJob()
                                      |
                                      +--> ActivityReporter.submit()
                                                   |
                                                   v
                                           ActivityRegistry
                                                   |
                                                   v
                                           RewardPolicyEngine
                                                   |
                                                   v
                                      Eligibility / Points / Rewards
```

The important design rule is that **AI jobs are one source of verified activity, not a separate reward system**. A completed job is converted into the same canonical activity format used by other adapters.

### AI agent contracts

- `contracts/ai/AIAgentRuntime.sol` — agent registration, verification, lifecycle state and heartbeat.
- `contracts/ai/AIAgentEngine.sol` — ERC20-funded job creation, assignment, authorized completion, payout and cancellation.
- `contracts/ai/AIJobCompletionAdapter.sol` — atomic completion bridge; it completes the on-chain job and records the verified activity in one transaction.
- `contracts/core/ActivityReporter.sol` — chain-aware reporter boundary used by the completion adapter.
- `contracts/core/ActivityRegistry.sol` — canonical verified activity storage.

### Off-chain AI job control plane

The contracts deliberately stop at the execution trust boundary. The off-chain layer owns execution lifecycle and can later be exposed through an API without changing the contract interfaces.

```text
Drop Hunter opportunity
        |
        v
AIJob planner
        |
        v
idempotent queue
        |
        v
AIJobRunner -- bounded batch --> AI agent executor
        |
        +--> retry on transient failure
        +--> durable JSON state for local development
        +--> deterministic result hash
        |
        v
AIJobCompletionBridge
        |
        v
AIJobCompletionAdapter
        |
        v
ActivityReporter -> ActivityRegistry
```

The implementation lives under `agents/ai-jobs/`:

- `orchestrator.ts` — lifecycle, idempotency, retry limits and overlapping-run coalescing.
- `planner.ts` — converts high-scoring Drop Hunter opportunities into executable job requests.
- `runner.ts` — drains a bounded queue batch.
- `json-store.ts` — local durable store with a versioned file format.
- `executor.ts` — provider boundary plus deterministic dry-run executor.
- `chain-bridge.ts` — typed Ethers.js bridge from completed off-chain jobs into the atomic on-chain completion adapter.
- `service.ts` — application service boundary for queue operations.
- `http-api.ts` — local HTTP control plane.
- `store.ts` — in-memory implementation for tests.

Detailed trust-boundary design is documented in `docs/AI_RUNTIME_ARCHITECTURE.md`.

### AI job HTTP API

Start the local control plane:

```bash
npm run ai-jobs:server
```

Default endpoint:

```text
http://127.0.0.1:8787
```

Routes:

```text
GET  /health
GET  /jobs
POST /jobs
GET  /jobs/:id
POST /jobs/:id/run
POST /jobs/:id/retry
POST /jobs/:id/cancel
POST /jobs/drain
```

The server uses the durable JSON store at `./data/ai-jobs.json` and the deterministic `DryRunAIExecutor` by default. It does **not** sign wallets or send blockchain transactions. Blockchain completion is an explicit next boundary through `AIJobCompletionBridge`.

Optional environment variables:

```text
AI_JOB_API_HOST=127.0.0.1
AI_JOB_API_PORT=8787
AI_JOB_API_TOKEN=change-me
AI_JOB_STORE=./data/ai-jobs.json
AI_JOB_BATCH_SIZE=5
AI_JOB_MAX_ATTEMPTS=3
```

If `AI_JOB_API_TOKEN` is set, requests must send:

```text
Authorization: Bearer <token>
```

The API is intentionally a control-plane boundary. A production deployment can replace the dry-run executor with a real provider adapter without changing the HTTP routes or job lifecycle model.

## Drop Hunter

Drop Hunter is the off-chain opportunity intelligence and execution layer. It supports deterministic scoring, evidence, resilient discovery, execution gates, idempotency receipts, retries and EVM transaction reconciliation.

Run a normal report:

```bash
npm run drop-hunter
```

Run exactly one lightweight scan:

```bash
npm run drop-hunter:once
```

Plan AI jobs from the current high-value opportunities without executing them:

```bash
npm run ai-jobs:plan
```

Optional environment variables:

```text
AI_AGENT_ID=1
AI_JOB_REWARD=100
AI_JOB_MIN_SCORE=70
```

The planner is intentionally **non-executing**. It creates deterministic job requests only; wallet signing and on-chain funding remain behind the explicit execution boundary.

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
