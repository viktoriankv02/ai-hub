# AI Hub Agents

The agent layer is designed to help a user discover and execute legitimate blockchain builder/tester opportunities.

Agents are not intended to simulate users, bypass eligibility rules, or farm rewards through fake activity. They should operate with explicit user authorization and produce verifiable developer/tester work: deployments, contract interactions, integrations, testnet verification, bug reports, and ecosystem contributions.

## Initial responsibilities

- discover candidate networks and builder programs;
- score opportunities using transparent signals;
- generate a concrete action plan;
- execute only explicitly authorized actions through network-specific adapters;
- record evidence such as transaction hashes, contract addresses, repositories, and deployment metadata;
- learn from completed actions and outcomes without fabricating activity.

Ink is a first-priority target because its current builder programs explicitly value live products, measurable ecosystem activity, and AI/agent infrastructure.

## AI provider boundary

AI jobs are executed through an explicit provider boundary. The queue does not depend directly on an AI vendor SDK: `OpenAICompatibleProvider` speaks the common `/chat/completions` protocol and can target compatible gateways by changing `AI_PROVIDER_BASE_URL`.

The provider layer is deliberately outside the on-chain trust boundary:

```text
AIJobRecord
   |
AIProviderJobExecutor
   |
AIProvider
   |
OpenAI-compatible gateway
   |
plain text output
   |
SHA-256 result hash
   |
completion attestation / ActivityRegistry
```

The default executor is still `dry-run`. Real provider execution must be explicitly enabled with `AI_JOB_EXECUTOR=openai-compatible` and a configured API key/model.

Transient HTTP failures are retried with bounded exponential backoff. Non-transient provider errors are surfaced immediately. Provider output is hashed before it can be used by downstream verification or reward logic.
