# AI Completion Attestation

## Trust model

The AI job pipeline has four trust boundaries:

1. **Agent runtime** owns agent identity and execution eligibility.
2. **AI job engine** owns funded jobs, assignment, completion state and reward escrow.
3. **Off-chain attester** signs the canonical completion payload after the worker completes a job.
4. **Completion relay** submits the signed payload to `AICompletionReporter`.

The relay is intentionally not trusted with completion truth. `AICompletionReporter` recovers the signer from the signature and requires the signer to be an enabled attester. It also binds the attestation to the on-chain job's agent and task hash before calling `AIAgentEngine.completeJob()` and recording the verified activity.

## Canonical payload

```text
AI_HUB_JOB_COMPLETION_V1
jobId=<off-chain job id>
agentId=<runtime agent id>
taskHash=<bytes32 task hash represented as 0x-prefixed hex>
resultHash=<worker result identifier>
completedAt=<ISO-8601 UTC timestamp>
```

The payload is signed with the normal Ethereum `personal_sign` / `ethers.signMessage` envelope. The signature is verified twice:

- locally by the TypeScript completion sink;
- on-chain by `AICompletionReporter`.

## Idempotency

`completionId` is derived from the attestation payload and normalized attester address. The reporter stores submitted completion IDs permanently. Replaying an already submitted completion is rejected before any state-changing call.

## Security requirements

- completion relays must be explicitly allow-listed;
- attesters must be explicitly allow-listed;
- the on-chain job must already be assigned and not completed;
- signed agent ID must match the funded job's agent ID;
- signed task hash must match the funded job's task hash;
- attestation timestamp must not be in the future or older than the configured acceptance window;
- the same completion ID must never settle twice;
- the completion reporter must itself be authorized as an `AIAgentEngine` completion reporter and an `ActivityRegistry` reporter.

## Operational flow

```text
worker
  │
  ├─ executes funded job
  │
  ▼
AIJobOrchestrator
  │ completed + resultHash
  ▼
CompletionAttestation
  │ signMessage()
  ▼
EVMCompletionSink
  │ local signature validation
  ▼
AICompletionReporter
  │ recover signer + bind job + replay guard
  ├──────────────► AIAgentEngine.completeJob()
  └──────────────► ActivityRegistry.recordActivity()
```
