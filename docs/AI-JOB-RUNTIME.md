# AI Job Runtime

The AI job runtime has two layers:

1. **Off-chain execution** — `AIJobOrchestrator`, persistent store, runner, scheduler and provider executor.
2. **On-chain settlement** — `OnchainJobProvisioner`, `AICompletionReporter`, `ActivityRegistry` and optional `OnchainRewardSettler`.

## Lifecycle

```text
opportunity/manual request
        |
        v
AIJobOrchestrator
        |
        v
AIJobRunner / AI provider
        |
        v
completed AIJobRecord
        |
        v
OnchainJobProvisioner
  - ERC20 allowance
  - AIAgentEngine.createJob()
  - persistent offchain -> onchain binding
  - optional assignJob()
        |
        v
CompletionAttestation
  - deterministic payload
  - EVM signature
  - signature verification
        |
        v
AICompletionReporter
  - authorized caller check
  - replay protection
  - AIAgentEngine.completeJob()
  - ActivityRegistry.recordActivity()
        |
        +--------------------+
        |                    |
        v                    v
RewardPolicyEngine      AIAgentEngine.payReward()
/ Eligibility /         optional auto-settlement
Points / Reward
```

## Local commands

```powershell
npm run build
npx hardhat test
npm run ai-jobs:smoke
npm run ai-jobs:onchain-smoke
```

The on-chain smoke requires a running agent and a funded reward-token balance for the funding signer.

## Durable completion publication

The completion bridge is memory-idempotent by default. For a persistent worker/server, set:

```text
AI_JOB_COMPLETION_STORE=./data/ai-job-completions.json
```

When configured, a successful publication records the off-chain job id, transaction id and publication timestamp. After a process restart, the bridge recognizes an already-published job and does not submit it again. The attestation is reconstructed from the current completed job before returning the stored transaction id.

This is deliberately separate from the on-chain binding store:

- `AI_ONCHAIN_BINDINGS_STORE` maps an off-chain job to its funded on-chain job id.
- `AI_JOB_COMPLETION_STORE` records the publication transaction for a completed job.

## Deployment

Deploy the AI runtime after the core contracts and reward token exist:

```powershell
npm run ai-runtime:deploy
npm run ai-runtime:configure
```

Required variables:

- `AI_HUB_NETWORK`
- `AI_HUB_ADMIN_ADDRESS`
- `AI_REWARD_TOKEN_ADDRESS`
- `ACTIVITY_REGISTRY_ADDRESS`
- `AI_AGENT_ENGINE_ADDRESS`
- `AI_COMPLETION_REPORTER_ADDRESS`
- `AI_COMPLETION_CALLER_ADDRESS`

`AI_COMPLETION_CALLER_ADDRESS` is the EVM signer used by the off-chain completion runtime. It must be authorized in `AICompletionReporter`. The reporter contract must also be authorized in `AIAgentEngine`, and the reporter must be authorized in `ActivityRegistry`.

`AI_JOB_ASSIGNMENT_PRIVATE_KEY` can be separate from the funding signer because `assignJob()` is owner-only. `AI_JOB_PAYOUT_PRIVATE_KEY` can also be separate because `payReward()` is payout-manager-only.

Set `AI_JOB_AUTO_SETTLE_REWARD=true` only after the payout signer has been authorized with `AIAgentEngine.setPayoutManager(...)`.

## HTTP API

When `AI_JOB_ONCHAIN=true`, the job server exposes:

- `POST /jobs` — enqueue
- `POST /jobs/:id/run` — execute off-chain
- `POST /jobs/:id/provision-onchain` — create/bind the funded on-chain job
- `POST /jobs/:id/submit-onchain` — attest and submit completion
- `POST /jobs/:id/run-and-submit` — execute, provision and submit completion in one operation
- `POST /jobs/drain` — process a bounded batch
- `GET /jobs/:id` — inspect state
- `GET /jobs` — list jobs
- `GET /health` — health check

The on-chain binding store is persistent by default at `./data/onchain-job-bindings.json`.
