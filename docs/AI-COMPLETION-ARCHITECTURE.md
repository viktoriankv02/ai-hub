# AI completion trust boundary

AI job completion is treated as an external claim. It becomes a verified on-chain activity only after cryptographic attestation and replay protection.

```text
AI provider -> completed AI job -> signed attestation -> completion bridge
                                      |                         |
                                      v                         v
                               attester policy             EVM reporter
                                                                |
                                                                +-> job completion
                                                                +-> verified activity
                                                                       |
                                                                       v
                                                              reward policy pipeline
```

## Invariants

1. Only completed jobs can be attested.
2. The attestation binds job id, agent id, task hash, result hash and completion time.
3. The relayer is not the trust root; the Solidity reporter recovers and authorizes the attester.
4. Completion ids are deterministic and replay-safe.
5. The on-chain task hash must match the attested task hash.
6. A job crosses the completion boundary once.
7. Activity is recorded only after job completion is accepted.
8. Provider execution remains separate from reward policy.
9. Off-chain publication is durable and retryable.
10. The same reward pipeline can consume AI jobs and future chain/activity adapters.

## Components

- `AIAgentRuntime`: agent identity and lifecycle.
- `AIAgentEngine`: funded job creation, assignment and completion.
- `AIJobOrchestrator`: off-chain lifecycle, idempotency and retries.
- `AIJobExecutor`: provider execution abstraction.
- `CompletionAttestation`: canonical signed completion statement.
- `CompletionBridge`: durable publication and retry state.
- `EVMCompletionSink`: EVM transport and pre-flight verification.
- `AICompletionReporter`: on-chain attestation verification and activity emission.
- `ActivityRegistry`: canonical verified activity ledger.
- `RewardPolicyEngine`: points/reward policy.
