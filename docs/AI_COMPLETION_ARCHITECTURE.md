# AI Completion Attestation

## Trust model

The AI job pipeline has five trust boundaries:

1. **Agent runtime** owns agent identity and execution eligibility.
2. **Compute node registry** owns execution-resource identity, stake, heartbeat and node reputation.
3. **AI job engine** owns funded jobs, assignment, completion state and reward escrow.
4. **Off-chain attester** signs the canonical completion payload after the worker completes a job.
5. **Completion relay** submits the signed payload to `AICompletionReporter`.

The relay is intentionally not trusted with completion truth. `AICompletionReporter` recovers the signer from the signature and requires the signer to be an enabled attester. It also binds the attestation to the on-chain job's agent and canonical task hash before calling `AIAgentEngine.completeJob()` and recording the verified activity.

## Canonical payload

```text
AI_HUB_JOB_COMPLETION_V1
jobId=<off-chain job id>
agentId=<runtime agent id>
taskHash=<canonical bytes32 task hash represented as 0x-prefixed hex>
resultHash=<worker result identifier>
completedAt=<ISO-8601 UTC timestamp>
```

`taskHash` is canonicalized off-chain with the same rule used by the on-chain job provisioner: a 32-byte hex value is preserved; any other task identifier is converted with `ethers.id(...)`. This prevents a relay from changing the task identity between the off-chain and on-chain planes.

The payload is signed with the normal Ethereum `personal_sign` / `ethers.signMessage` envelope. The signature is verified twice:

- locally by the TypeScript completion sink;
- on-chain by `AICompletionReporter`.

## Idempotency

`completionId` is derived from the attestation payload and normalized attester address. The reporter stores submitted completion IDs permanently. Replaying an already submitted completion is rejected before any state-changing call.

## Compute node layer

`AIComputeNodeRegistry` is intentionally separate from `AIAgentRuntime`:

- an **agent** is the software identity and authorization boundary;
- a **node** is the physical/virtual execution resource;
- a node must maintain a stake and heartbeat to be schedulable;
- authorized job controllers mark nodes busy and report successful/failed jobs;
- reputation rises after successful work and falls after failures;
- stake can be slashed by governance and withdrawn only when no jobs are active.

This creates the foundation for a later scheduler that selects healthy nodes for executable agents without conflating agent identity with infrastructure capacity.

## Security requirements

- completion relays must be explicitly allow-listed;
- attesters must be explicitly allow-listed;
- the on-chain job must already be assigned and not completed;
- signed agent ID must match the funded job's agent ID;
- signed task hash must match the funded job's canonical task hash;
- the same completion ID must never settle twice;
- compute nodes must be staked and heartbeat-healthy before scheduling;
- failed compute work reduces node reputation;
- the completion reporter must itself be authorized as an `AIAgentEngine` completion reporter and an `ActivityRegistry` reporter.

## Operational flow

```text
worker
  │
  ├─ executes funded job on healthy compute node
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
