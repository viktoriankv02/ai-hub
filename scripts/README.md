# AI Hub validation

## Local validation

Recommended order:

```bash
npx hardhat compile
npx hardhat test
npx hardhat run scripts/local-smoke.ts
```

The local smoke test validates:

`ChainRegistry -> EVMChainAdapter -> ActivityReporter -> ActivityRegistry`

## Public testnet validation

After deployment, run the real end-to-end smoke test against the selected testnet:

```powershell
$env:AI_HUB_NETWORK="baseSepolia"
npx hardhat run scripts/testnet-smoke.ts --network baseSepolia
```

The testnet smoke test creates a unique policy/activity/claim, records a verified activity through the EVM adapter, awards points, and executes a native reward through `ClaimRouter` and `RewardVault`.

The smoke test uses the deployer/admin as the trusted verifier and reporter by default. Set `AI_HUB_SMOKE_USER_ADDRESS` if the reward recipient should be another address.

Use a dedicated test wallet and fund its testnet balance before running the public testnet flow.
