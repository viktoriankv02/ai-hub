# AI Hub local validation

Recommended order:

```bash
npx hardhat compile
npx hardhat test
npx hardhat run scripts/local-smoke.ts
```

The smoke test validates the complete local path:

`ChainRegistry -> EVMChainAdapter -> ActivityReporter -> ActivityRegistry`

Before deploying to a public testnet, run the deployment/configuration scripts with a dedicated test wallet and verify the resulting addresses and permissions.
