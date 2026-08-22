# AI Job multi-chain runtime

The AI job control plane can target more than one EVM deployment without changing the off-chain job lifecycle.

## Runtime model

```text
AIJobRequest
    |
    +-- chainTargetId (optional)
    |
AIJobOrchestrator
    |
AIJob executor
    |
completed AIJobRecord
    |
AIJobMultiChainService
    |
ChainExecutionRegistry
    +-- Base Sepolia
    +-- Ink Sepolia
    +-- Arc Testnet
    +-- Tempo Testnet
    +-- Plasma Testnet
```

A job may specify `chainTargetId`. When it does not, the configured runtime default is used.

## Environment configuration

The preferred configuration is `AI_JOB_CHAIN_TARGETS_JSON` containing an array of EVM targets. Every target needs:

- `id`
- `name`
- `family: "evm"`
- `chainId`
- `rpcUrl`
- `privateKey`
- `engineAddress`
- `rewardTokenAddress`
- `completionReporterAddress`

Optional fields include separate assignment/payout keys, binding/completion stores, `agentIdMap`, activity type, project id, metadata hash, and automatic assignment/reward settlement flags.

The runtime also supports environment prefixes for Base Sepolia, Ink Sepolia, Arc Testnet, Tempo Testnet and Plasma Testnet.

## HTTP routes

The multi-chain entrypoint adds:

- `GET /chains` — enabled targets and the default target.
- `POST /jobs/:id/chain/provision?targetId=...` — create/bind the on-chain job.
- `POST /jobs/:id/chain/complete?targetId=...` — publish the verified completion.
- `POST /jobs/:id/chain/execute?targetId=...` — provision and complete using the selected chain adapter.

If `targetId` is omitted, the job's `chainTargetId` is used first, followed by the runtime default.

## Safety boundary

The multi-chain layer does not fabricate Sui or non-EVM transactions. A chain family must have a real execution adapter before it is enabled for execution. The EVM adapter performs the actual transaction lifecycle and exposes transaction identifiers in the normalized `ChainExecutionResult`.

## Local command

The source entrypoint is `scripts/ai-job-multichain.ts`.

After dependencies are installed, run it with:

```powershell
npx tsx scripts/ai-job-multichain.ts
```

The normal `ai-jobs:server` remains the compatibility single-chain control plane.
