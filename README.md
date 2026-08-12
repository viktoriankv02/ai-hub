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
- Persistent AI job worker scheduler with restart-safe state
- Vendor-neutral OpenAI-compatible AI provider adapter

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

### Off-chain AI job control plane

The contracts deliberately stop at the trust boundary. The off-chain layer owns execution lifecycle and can later be exposed through an API without changing the contract interfaces.

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
        +--> result hash
        |
        v
AIAgentEngine.completeJob()
        |
        v
AIJobActivityAdapter.reportCompletedJob()
```

The first implementation lives under `agents/ai-jobs/`:

- `orchestrator.ts` — lifecycle, idempotency, retry limits and overlapping-run coalescing.
- `planner.ts` — converts high-scoring Drop Hunter opportunities into executable job requests.
- `runner.ts` — drains a bounded queue batch.
- `scheduler.ts` — persistent interval worker with overlap protection and lifecycle counters.
- `json-store.ts` — local durable job store with a versioned file format.
- `json-scheduler-store.ts` — durable scheduler state store with atomic replacement writes.
- `executor.ts` — provider boundary plus deterministic dry-run executor and result hashing.
- `runtime.ts` — selects the safe dry-run executor or a configured real provider.
- `providers/openai-compatible.ts` — dependency-free adapter for OpenAI-compatible `/chat/completions` APIs.
- `service.ts` — application service boundary for queue operations.
- `http-api.ts` — local HTTP control plane.
- `store.ts` — in-memory implementation for tests.

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

The server uses the durable JSON store at `./data/ai-jobs.json`. The executor is `dry-run` by default. It can now use a real OpenAI-compatible provider without changing the HTTP API.

Optional environment variables:

```text
AI_JOB_EXECUTOR=dry-run
AI_JOB_API_HOST=127.0.0.1
AI_JOB_API_PORT=8787
AI_JOB_API_TOKEN=change-me
AI_JOB_STORE=./data/ai-jobs.json
AI_JOB_BATCH_SIZE=5
AI_JOB_MAX_ATTEMPTS=3
```

### Real AI provider

The provider layer is deliberately vendor-neutral. It uses the standard OpenAI-compatible `POST /chat/completions` contract, so the same adapter can target OpenAI, OpenRouter, Groq, Together or another compatible gateway.

Enable it explicitly:

```text
AI_JOB_EXECUTOR=openai-compatible
AI_PROVIDER_API_KEY=...
AI_PROVIDER_BASE_URL=https://api.openai.com/v1
AI_PROVIDER_MODEL=...
AI_PROVIDER_SYSTEM_PROMPT=You are an AI Hub execution agent. Follow the task exactly and do not invent facts.
AI_PROVIDER_TEMPERATURE=0
AI_PROVIDER_MAX_TOKENS=512
AI_PROVIDER_TIMEOUT_MS=120000
```

Run a direct provider smoke test:

```bash
npm run ai-jobs:provider-smoke
```

The provider output is hashed as `sha256:<hex>` by `AIProviderJobExecutor`. The result hash is the value that can later cross the off-chain/on-chain trust boundary; raw model output is not put on-chain.

Do not commit API keys. A template is provided in `.env.ai-jobs.example`.

If `AI_JOB_API_TOKEN` is set, HTTP requests must send:

```text
Authorization: Bearer <token>
```

### Persistent AI job worker

For a long-running local worker that automatically drains queued jobs:

```bash
npm run ai-jobs:worker
```

The worker defaults to a 30-second interval and persists scheduler state separately from the job queue. Configure it with:

```text
AI_JOB_WORKER_INTERVAL_MS=30000
AI_JOB_STORE=./data/ai-jobs.json
AI_JOB_SCHEDULER_STATE=./data/ai-job-scheduler.json
AI_JOB_BATCH_SIZE=5
AI_JOB_MAX_ATTEMPTS=3
```

The worker also respects `AI_JOB_EXECUTOR`. Keep `dry-run` for local development; use `openai-compatible` only when the provider credentials and model are intentionally configured.

This mirrors the useful heartbeat/coalescing pattern used by modern agent runtimes while keeping AI Hub's execution semantics tied to its on-chain job and activity pipeline.

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
