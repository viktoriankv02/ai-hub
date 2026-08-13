# AI provider runtime

The provider runtime is the execution boundary between queued AI jobs and external AI providers.

## Rules

- Providers are explicitly registered by stable id and version.
- Disabled providers cannot execute jobs.
- A job is executed at most once per runtime instance.
- Provider output is canonicalized into a result hash by the executor.
- Provider execution remains separate from on-chain completion attestation.
