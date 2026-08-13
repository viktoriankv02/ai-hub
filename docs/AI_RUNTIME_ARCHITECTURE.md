# AI Runtime Architecture

## Goal

AI Hub treats an AI agent execution as a first-class source of verified activity, while keeping the actual model execution off-chain.

The architecture is intentionally split into four trust domains:

1. **Discovery** — Drop Hunter finds opportunities and evidence.
2. **Execution** — the off-chain AI job runtime executes a task and produces a deterministic result hash.
3. **Attestation** — an explicitly authorized completion caller submits the result to the EVM completion adapter.
4. **Settlement / rewards** — the canonical activity and reward pipeline decides whether the activity earns points or funds.

## Canonical flow

```text
Drop Hunter
   |
   | scored opportunity
   v
AIJobPlanner
   |
   | idempotent AIJobRequest
   v
AIJobOrchestrator
   |
   | queued / running / retry / completed
   v
AIJobExecutor
   |
   | resultHash
   v
AIJobCompletionBridge
   |
   | bridgeCompletion(jobId, resultHash, metadataHash)
   v
AIJobCompletionAdapter
   |
   +----> AIAgentEngine.completeJob()
   |
   +----> ActivityReporter.submit(..., verified=true)
                 |
                 v
          ActivityRegistry
                 |
                 v
          RewardPolicyEngine
                 |
          +------+------+
          |             |
       Points        Eligibility
          |             |
          +------+------+
                 |
                 v
          Reward / Claim
```

## Why the completion adapter exists

A direct sequence of:

```text
completeJob()
recordActivity()
```

creates a dangerous partial-state boundary for external callers. The completion adapter executes both operations in one EVM transaction.

If activity recording fails, the job completion reverts too. If the activity succeeds, the job is completed in the same transaction.

The adapter also maintains a per-job `reportedJobs` guard so an attestor cannot create duplicate activity records for the same on-chain job.

## Authorization model

There are three independent permissions:

### 1. AIAgentEngine completion reporter

`AIJobCompletionAdapter` must be configured with:

```solidity
engine.setCompletionReporter(adapter, true);
```

The adapter, not the human/operator wallet, becomes the trusted completion reporter at the contract boundary.

### 2. ActivityReporter reporter

The adapter must be configured as an `ActivityReporter` reporter and enabled for the source chain:

```solidity
reporter.setReporter(adapter, true);
reporter.setSupportedChain(adapter, sourceChainId, true);
```

This keeps AI-generated activity inside the same chain registry and verification path as every other source.

### 3. Off-chain completion caller

The adapter separately exposes:

```solidity
adapter.setCompletionCaller(attestor, true);
```

This means a compromised worker does not automatically gain the right to submit attestations. The operator can rotate or revoke attestors without changing the job engine.

## Result hash policy

The off-chain executor may use provider-specific result formats such as:

- `sha256:<hex>`
- `dry-run:<hex>`
- provider-native identifiers

The EVM bridge converts arbitrary result strings into a canonical `bytes32` using Keccak-256 at the trust boundary. Already-canonical `bytes32` values are passed through unchanged.

This keeps the queue implementation provider-neutral while keeping the contract ABI deterministic.

## Idempotency

There are two layers:

### Off-chain

`AIJobOrchestrator` deduplicates by `idempotencyKey`.

Typical value:

```text
opportunity:<opportunityId>:<score>
```

### On-chain

`AIJobCompletionAdapter.reportedJobs[jobId]` prevents the same funded job from generating more than one verified activity.

The transaction itself is atomic, so a failed activity submission does not consume the `reportedJobs` flag.

## Comparison with the parallel `arc-ai-hub` project

The parallel project has useful primitives around:

- an ERC20-funded `AIAgentEngine`;
- agent runtime state;
- AI job activity bridging;
- backend HTTP control;
- chain adapters.

AI Hub adopts the useful separation but keeps the architecture stricter around the trust boundary:

- off-chain execution never directly mutates canonical activity;
- the completion adapter is the only atomic bridge;
- source-chain activity continues through `ActivityReporter` and `ChainRegistry`;
- result hashes are canonicalized before crossing into Solidity;
- reward settlement remains downstream of verified activity.

The parallel implementation is therefore a design reference, not a source of truth. AI Hub's canonical interfaces and tests remain authoritative.

## Production hardening still required

Before real funds are enabled, the following should be added:

- multi-attestor quorum or threshold signatures;
- nonce/deadline based completion attestations;
- explicit task-domain separation in the signed attestation payload;
- chain-specific finality requirements;
- maximum reward and gas policies;
- pause/emergency revoke for completion adapters;
- persistent mapping between off-chain job UUID and on-chain job ID;
- audit of every external call and authorization transition;
- production RPC failover and receipt reconciliation;
- encrypted secret management instead of `.env` private keys.
