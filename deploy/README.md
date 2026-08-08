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
AI_HUB_NETWORK=baseSepolia
SEPOLIA_RPC_URL=...
BASE_SEPOLIA_RPC_URL=...
ARBITRUM_SEPOLIA_RPC_URL=...
OPTIMISM_SEPOLIA_RPC_URL=...
BNB_TESTNET_RPC_URL=...
AVALANCHE_FUJI_RPC_URL=...
POLYGON_AMOY_RPC_URL=...
```

The deployment scripts refuse targets that are not configured as testnets.

## Deployment order

Run the steps in this order. Each step is designed to be safe to rerun against the same deployment record.

```text
00_deploy_core.ts
03_deploy_evm_adapter.ts
01_configure_core.ts
02_register_chain.ts
05_configure_rewards.ts
04_verify_configuration.ts
```

The adapter step owns `ChainRegistry` registration. Core configuration only grants permissions. Reward configuration creates or updates the configured policy while keeping `RewardPolicyEngine` and `EligibilityEngine` owned by the admin; `ClaimRouter` receives an explicit claim-executor permission instead of taking ownership.

Example:

```powershell
$env:AI_HUB_NETWORK="baseSepolia"
npx hardhat run deploy/00_deploy_core.ts --network baseSepolia
npx hardhat run deploy/03_deploy_evm_adapter.ts --network baseSepolia
npx hardhat run deploy/01_configure_core.ts --network baseSepolia
npx hardhat run deploy/02_register_chain.ts --network baseSepolia
npx hardhat run deploy/05_configure_rewards.ts --network baseSepolia
npx hardhat run deploy/04_verify_configuration.ts --network baseSepolia
```

## Reward configuration

Optional environment variables:

```text
AI_HUB_REWARD_ACTIVITY=SWAP
AI_HUB_POLICY_NAME=BASESEPOLIA_SWAP_REWARD
AI_HUB_REWARD_POINTS=100
AI_HUB_MAX_CLAIMS=1
AI_HUB_MAX_POINTS_PER_PERIOD=1000
AI_HUB_MIN_IDENTITY_AGE=0
AI_HUB_REWARD_COOLDOWN=0
```

## Expansion model

Once the EVM deployment pipeline is stable, additional networks are added through `deploy/config/networks.ts` rather than hard-coding RPC URLs inside deployment scripts.
