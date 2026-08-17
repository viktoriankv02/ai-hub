# AI Hub deployment manifests

The first-class deployment targets are:

1. **Base Sepolia** (`84532`) — primary development/testnet.
2. **Base Mainnet** (`8453`) — primary production network.
3. **Ink Sepolia** (`763373`) — secondary testnet for early ecosystem activity.
4. Ethereum Sepolia / other networks — secondary or experimental until explicitly promoted.

Never commit private keys, RPC credentials, or populated local `.env` files.

## Base Sepolia

From PowerShell:

```powershell
$env:AI_HUB_NETWORK="baseSepolia"
npx hardhat run deploy/08_deploy_base_ai_stack.ts --network baseSepolia
```

Or use the package command after pulling the branch:

```powershell
npm run base:deploy:testnet
```

The script deploys the canonical activity + chain registry and the AI execution stack, then configures the trust-boundary permissions. On Base Sepolia it can deploy `MockRewardToken` for development.

## Base Mainnet

Mainnet deployment intentionally refuses to create a mock reward token. Configure a real ERC-20 reward token first:

```powershell
$env:AI_HUB_NETWORK="base"
$env:AI_REWARD_TOKEN_ADDRESS="0x..."
npx hardhat run deploy/08_deploy_base_ai_stack.ts --network base
```

Do not run this until the contracts, token economics, ownership model, attester keys and deployment configuration have been reviewed.

## Storage on D:

For Windows development machines with limited C: capacity:

```powershell
.\scripts\setup-ai-hub-storage.ps1
```

This creates `D:\ai-hub-data\{logs,jobs,deployments,cache}` and sets the user-level `AI_HUB_DATA_DIR` variable. Long-running AI job state and deployment manifests then live outside the repository/system drive.
