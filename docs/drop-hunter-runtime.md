# Drop Hunter runtime

The Drop Hunter execution path is now split into explicit layers:

1. **Discovery** — static and HTTP opportunity sources feed `OpportunityDiscoveryRegistry`.
2. **Scoring** — `OpportunityScorer` ranks opportunities without inventing reward evidence.
3. **Planning** — `action-planner.ts` converts ranked opportunities into bounded actions.
4. **Gate** — `execution-gate.ts` blocks unsafe, unauthorized, wallet-less or gas-less execution.
5. **Idempotency** — `execution-idempotency.ts` prevents duplicate submissions and allows failed intents to retry.
6. **Execution** — `execution-runner.ts` invokes only approved handlers.
7. **EVM** — `evm-execution-adapter.ts` submits transactions and separately confirms receipts.
8. **Reconciliation** — `transaction-monitor.ts` reconciles submitted/unknown transactions.
9. **Persistence** — scheduler state and execution receipts survive process restarts.
10. **Scheduler** — `scheduler.ts` performs resilient periodic discovery and maintains lifecycle state.

## Local commands

```powershell
npm run build
npm run drop-hunter:once
npm run drop-hunter
npm run drop-hunter:daemon
```

`npm run build` checks production TypeScript (`agents`, `config`, `ignition`) without test files. `npm run build:all` remains available for the stricter full repository check.

## Runtime persistence

By default the daemon writes:

- `.data/drop-hunter/scheduler.json`
- `.data/drop-hunter/executions.json`

Override them with:

```powershell
$env:DROP_HUNTER_STATE_FILE = "D:\ai-hub\.data\drop-hunter\scheduler.json"
$env:DROP_HUNTER_EXECUTION_FILE = "D:\ai-hub\.data\drop-hunter\executions.json"
$env:DROP_HUNTER_INTERVAL_MS = "60000"
```

The one-shot report writes `.data/drop-hunter/latest.json` unless `DROP_HUNTER_REPORT_FILE` is set.

## Execution safety

The runtime deliberately does **not** auto-execute the priority catalog. Discovery and planning are separated from execution. Real EVM execution requires an explicit `EvmExecutionAdapter` and a connected signer. A transaction hash is treated as submitted, not confirmed, until receipt reconciliation succeeds.
