# AI Hub deployment

The deployment layer is intentionally testnet-first. Mainnet deployment is disabled until the protocol passes local integration tests, testnet verification, security review, and an explicit governance decision.

## Supported initial EVM testnets

- Ethereum Sepolia — 11155111
- Base Sepolia — 84532
- Arbitrum Sepolia — 421614
- Optimism Sepolia — 11155420
- BNB Smart Chain Testnet — 97
- Avalanche Fuji — 43113
- Polygon Amoy — 80002

## Environment

Copy the required variables into a local `.env` file. Never commit private keys or RPC credentials.

```text
DEPLOYER_PRIVATE_KEY=...
AI_HUB_ADMIN_ADDRESS=...
SEPOLIA_RPC_URL=...
BASE_SEPOLIA_RPC_URL=...
ARBITRUM_SEPOLIA_RPC_URL=...
OPTIMISM_SEPOLIA_RPC_URL=...
BNB_TESTNET_RPC_URL=...
AVALANCHE_FUJI_RPC_URL=...
POLYGON_AMOY_RPC_URL=...
```

The deployment scripts should refuse to deploy when the target is not explicitly configured as a testnet.

## Expansion model

Once the EVM deployment pipeline is stable, additional networks are added through `deploy/config/networks.ts` rather than hard-coding RPC URLs inside deployment scripts.
