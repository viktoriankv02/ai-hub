# AI Hub

AI Hub is a multi-chain smart-contract infrastructure project designed to provide a common application layer across EVM-compatible networks, with separate adapters for non-EVM ecosystems.

## Current architecture

```text
Drop Hunter
    |
    v
AI Job Orchestrator -> persistent queue -> AI provider
    |
    v
completed AIJobRecord
    |
    +--> completion attestation / publication state
    |
    v
AIAgentEngine
    |
    v
AICompletionReporter
    |
    v
ActivityRegistry
    |
    v
RewardPolicyEngine -> EligibilityEngine -> Points / RewardVault
```

AI jobs remain one source of verified activity rather than a separate reward system. This follows the stronger architecture used by the parallel `arc-ai-hub` project: the job layer feeds the canonical activity/reward pipeline instead of duplicating incentives.

## AI job runtime

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
- `completion-attestation.ts` — deterministic completion payload and signed attestation.
- `completion-bridge.ts` — trust-boundary publication bridge with restart-safe replay handling.
- `completion-store.ts` — memory/JSON persistence for complete publication records and immutable transaction/attestation binding.
- `onchain-job-bindings.ts` — persistent mapping between off-chain and funded on-chain jobs.
- `onchain-job-provisioner.ts` — ERC20 funding, on-chain job creation and optional assignment.
- `onchain-completion-coordinator.ts` — provisions and publishes completed jobs.
- `onchain-reward-settler.ts` — optional payout-manager reward settlement.
- `onchain-runtime.ts` — production EVM runtime wiring for the complete pipeline.
- `multi-chain-runtime.ts` — multiple independent EVM targets with per-chain keys, contracts and durable stores.
- `multi-chain-service.ts` — chain-aware service facade.
- `multi-chain-http-api.ts` — chain-aware HTTP control plane.
- `service.ts` — application service boundary for queue operations.
- `http-api.ts` — local HTTP control plane.

### Runtime persistence

For a production-like local worker, configure both stores:

```text
AI_JOB_STORE=./data/ai-jobs.json
AI_JOB_SCHEDULER_STATE=./data/ai-job-scheduler.json
AI_ONCHAIN_BINDINGS_STORE=./data/onchain-job-bindings.json
AI_JOB_COMPLETION_STORE=./data/ai-job-completions.json
```

The queue/scheduler/on-chain binding stores preserve execution state. The completion store preserves the full signed attestation together with its transaction id and rejects attempts to rebind an already-published job to different signed data.

Inspect the current local runtime state with:

```bash
npm run ai-jobs:status
```

Verify a persisted completion after a process restart:

```bash
npm run ai-completion:verify -- <jobId>
```

The verifier checks that the stored attestation is cryptographically valid and still matches the persisted completed job before reporting it as verified.

## AI job HTTP API

Start the local control plane:

```bash
npm run ai-jobs:server
```

Default endpoint:

```text
http://127.0.0.1:8787
```

The multi-chain server adds:

```text
GET  /chains
POST /jobs/:id/chain/provision
POST /jobs/:id/chain/complete
POST /jobs/:id/chain/execute
```

`targetId` can be supplied as a query parameter. Otherwise the job's configured chain target or the runtime default is used.

The executor remains `dry-run` by default. Real provider execution and on-chain execution are explicit configuration choices.

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

The provider output is hashed as `sha256:<hex>` by `AIProviderJobExecutor`. Raw model output does not enter the on-chain activity record.

Do not commit API keys. A template is provided in `.env.ai-jobs.example`.

If `AI_JOB_API_TOKEN` is set, HTTP requests must send:

```text
Authorization: Bearer <token>
```

## On-chain AI runtime

The on-chain runtime uses:

```text
AI provider
   -> completed job
   -> signed completion attestation
   -> funded AIAgentEngine job
   -> AICompletionReporter
   -> ActivityRegistry
   -> existing reward pipeline
```

Useful commands:

```bash
npm run ai-runtime:deploy
npm run ai-runtime:configure
npm run ai-jobs:onchain-smoke
```

Keep `AI_JOB_AUTO_SETTLE_REWARD=false` until the payout manager is explicitly configured. The default remains conservative: local execution does not spend tokens or send blockchain transactions.

### Completion attestation security

The reporter does not trust a caller merely because the caller can reach the contract. It requires both:

1. an enabled completion caller/relayer;
2. a valid signature from an enabled attester.

The signed `agentId` is additionally checked against the funded on-chain job's actual agent id. This prevents an authorized attester from signing a completion for a different agent identity while still targeting the correct funded job.

Completion ids are deterministic and include the attestation signer, while the durable publication store binds the first successful transaction id to the exact signed payload. A restart therefore cannot silently replace the attestation associated with an already published job.

### On-chain risk controls

`AIAgentRuntime` supports an optional heartbeat liveness guard. `heartbeatTimeout=0` disables it; when configured, a verified running agent becomes non-executable after its heartbeat expires until the owner sends another heartbeat.

`AIAgentEngine` supports optional owner-configured safeguards:

```text
maxJobReward
completionTimeout
maxOpenJobsPerCreator
```

All three default to `0`, meaning disabled. When enabled they limit funded job exposure, bound the lifetime of an executable job and prevent one creator from filling the engine with unlimited open jobs.

Expired assigned jobs can be cancelled permissionlessly with the creator's funds refunded, instead of remaining locked forever if an agent or reporter disappears.

`RewardVault` additionally supports:

```text
maxNativeClaim
maxERC20Claim
dailyNativeBudget
per-token ERC20 daily budgets
```

These are also disabled by default. The limits are enforced before a reward transfer, while replay protection remains independent through `claimId`.
