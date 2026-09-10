# AI Hub deployment

The deployment layer is testnet-first. Base Mainnet deployment is available only through an explicit deployment gate after local integration tests and testnet verification. Never commit private keys or RPC credentials.

## Supported EVM testnets

- Ink Sepolia — 763373
- Ethereum Sepolia — 11155111
- Base Sepolia — 84532
- Arbitrum Sepolia — 421614
- Optimism Sepolia — 11155420
- BNB Smart Chain Testnet — 97
- Avalanche Fuji — 43113
- Polygon Amoy — 80002
- Plasma Testnet — 9746
- Arc Testnet — 5042002
- Tempo Testnet (Moderato) — 42431

Ink Sepolia uses ETH for gas. Plasma is an EVM chain using XPL for gas. Arc Testnet uses USDC as the gas currency. Tempo has no native gas token; non-TIP-20 contract calls use pathUSD by default unless a Tempo fee token is selected.

## Environment

Copy the required variables into a local `.env` file. Never commit private keys or RPC credentials.

```text
DEPLOYER_PRIVATE_KEY=...
AI_HUB_ADMIN_ADDRESS=...
AI_HUB_NETWORK=baseSepolia
AI_HUB_ALLOW_MAINNET_DEPLOYMENT=false

SEPOLIA_RPC_URL=...
BASE_RPC_URL=...
BASE_SEPOLIA_RPC_URL=...
INK_SEPOLIA_RPC_URL=https://rpc-gel-sepolia.inkonchain.com
ARBITRUM_SEPOLIA_RPC_URL=...
OPTIMISM_SEPOLIA_RPC_URL=...
BNB_TESTNET_RPC_URL=...
AVALANCHE_FUJI_RPC_URL=...
POLYGON_AMOY_RPC_URL=...
PLASMA_RPC_URL=https://testnet-rpc.plasma.to
ARC_RPC_URL=https://rpc.testnet.arc.network
TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz

AI_REWARD_TOKEN_ADDRESS=...
AI_COMPLETION_CALLER_ADDRESS=...
AI_COMPLETION_ATTESTER_ADDRESS=...
AI_PAYOUT_MANAGER_ADDRESS=...

INK_SEPOLIA_EXPLORER_URL=https://explorer-sepolia.inkonchain.com
PLASMA_EXPLORER_URL=https://testnet.plasmascan.to
ARC_EXPLORER_URL=https://testnet.arcscan.app
TEMPO_EXPLORER_URL=https://explore.tempo.xyz
```

The default deployment posture remains testnet-only. Base Mainnet (`8453`) requires the explicit `AI_HUB_ALLOW_MAINNET_DEPLOYMENT=true` gate.

## Deployment order

Run the steps in this order. Each step is designed to be safe to rerun against the same deployment record.

```text
00_deploy_core.ts
03_deploy_evm_adapter.ts
01_configure_core.ts
04_verify_configuration.ts
```

The core step deploys nine contracts. The EVM adapter step adds the tenth contract and registers the selected chain in `ChainRegistry`. The configuration step grants the required core permissions. The verification step checks the resulting on-chain configuration.

## Example: Base Sepolia

```powershell
$env:AI_HUB_NETWORK="baseSepolia"
$env:AI_HUB_ADMIN_ADDRESS="0x..."
npx hardhat run deploy/00_deploy_core.ts --network baseSepolia
npx hardhat run deploy/03_deploy_evm_adapter.ts --network baseSepolia
npx hardhat run deploy/01_configure_core.ts --network baseSepolia
npx hardhat run deploy/04_verify_configuration.ts --network baseSepolia
```

## Example: Base Mainnet

Base Mainnet is deliberately gated. Do not set the gate until the deployer address, RPC endpoint, contract ownership expectations, reward token address, and deployment plan have been reviewed.

```powershell
$env:AI_HUB_NETWORK="base"
$env:AI_HUB_ADMIN_ADDRESS="0x..."
$env:AI_HUB_ALLOW_MAINNET_DEPLOYMENT="true"

npm run preflight
npx hardhat run deploy/00_deploy_core.ts --network base
npx hardhat run deploy/03_deploy_evm_adapter.ts --network base
npx hardhat run deploy/01_configure_core.ts --network base
npx hardhat run deploy/04_verify_configuration.ts --network base
npm run deployment:evidence
npm run deployment:verify-base
```

This flow deploys/reuses the same nine core contracts plus `EVMChainAdapter`, for a minimum of ten contracts on Base Mainnet. The scripts persist the deployment manifest and refuse to reuse an address when there is no contract code or ownership does not match the configured admin.

## Base Mainnet deployment integrity verification

`npm run deployment:verify-base` performs an on-chain integrity check against `deployments/base.json`. It verifies that all ten expected contracts have bytecode, that ownership is consistent with the connected deployer, that `EVMChainAdapter` is authorized by `ChainRegistry`, that Base Mainnet is registered against the recorded adapter with `active=true` and `testnet=false`, and that the adapter and reporter point to the expected chain registry. The command prints BaseScan address links for all deployed contracts so the deployment can be reviewed publicly.

## Base AI job stack

The AI job stack adds the execution/economic layer without using the test-only reward token on Mainnet. `deploy/08_deploy_base_ai_stack.ts` requires an existing `AI_REWARD_TOKEN_ADDRESS`, then deploys/reuses `AIAgentRuntime`, `AIAgentEngine`, `AIJobReceiptRegistry`, and `AICompletionReporter`. It wires completion reporting, attestation, receipt recording and payout authorization into the deployed stack.

```powershell
$env:AI_HUB_NETWORK="base"
$env:AI_HUB_ADMIN_ADDRESS="0x..."
$env:AI_HUB_ALLOW_MAINNET_DEPLOYMENT="true"
$env:AI_REWARD_TOKEN_ADDRESS="0x..."
$env:AI_COMPLETION_CALLER_ADDRESS="0x..."
$env:AI_COMPLETION_ATTESTER_ADDRESS="0x..."
$env:AI_PAYOUT_MANAGER_ADDRESS="0x..."

npm run deployment:base-ai
npm run deployment:evidence
npm run deployment:verify-base
```

The AI stack is additive: the 10-contract builder criterion is already satisfied by the core + adapter deployment count, while the AI stack increases the Mainnet contract footprint and provides a stronger product-level on-chain deployment story.

## Evidence verification

`npm run deployment:evidence` loads `deployments/<network>.json`, validates every address, checks that bytecode exists at every recorded address, prints the deployer when a private key is configured, and requires at least ten recorded contracts. This is intended to produce a deterministic deployment evidence report rather than relying on an informal contract count.

`npm run deployment:verify-base` is the stronger Base Mainnet check because it validates the on-chain relationships and ownership assumptions in addition to the bytecode/count evidence.

## Example: Ink Sepolia

```powershell
$env:AI_HUB_NETWORK="inkSepolia"
npx hardhat run deploy/00_deploy_core.ts --network inkSepolia
npx hardhat run deploy/03_deploy_evm_adapter.ts --network inkSepolia
npx hardhat run deploy/01_configure_core.ts --network inkSepolia
npx hardhat run deploy/04_verify_configuration.ts --network inkSepolia
```

Ink's official testnet RPC is `https://rpc-gel-sepolia.inkonchain.com`, chain ID `763373`, and the testnet explorer is `https://explorer-sepolia.inkonchain.com`.

## Example: Plasma

```powershell
$env:AI_HUB_NETWORK="plasmaTestnet"
npx hardhat run deploy/00_deploy_core.ts --network plasmaTestnet
npx hardhat run deploy/03_deploy_evm_adapter.ts --network plasmaTestnet
npx hardhat run deploy/01_configure_core.ts --network plasmaTestnet
npx hardhat run deploy/02_register_chain.ts --network plasmaTestnet
npx hardhat run deploy/04_verify_configuration.ts --network plasmaTestnet
```

## Example: Arc

```powershell
$env:AI_HUB_NETWORK="arcTestnet"
npx hardhat run deploy/00_deploy_core.ts --network arcTestnet
npx hardhat run deploy/03_deploy_evm_adapter.ts --network arcTestnet
npx hardhat run deploy/01_configure_core.ts --network arcTestnet
npx hardhat run deploy/02_register_chain.ts --network arcTestnet
npx hardhat run deploy/04_verify_configuration.ts --network arcTestnet
```

Arc Testnet requires testnet USDC for gas; it does not use ETH as the gas currency.

## Example: Tempo

```powershell
$env:AI_HUB_NETWORK="tempoTestnet"
npx hardhat run deploy/00_deploy_core.ts --network tempoTestnet
npx hardhat run deploy/03_deploy_evm_adapter.ts --network tempoTestnet
npx hardhat run deploy/01_configure_core.ts --network tempoTestnet
npx hardhat run deploy/02_register_chain.ts --network tempoTestnet
npx hardhat run deploy/04_verify_configuration.ts --network tempoTestnet
```

Tempo Testnet provides test stablecoins through `tempo_fundAddress`. Standard EVM tooling is supported, but Tempo-specific transaction features such as explicit fee-token selection are better handled through the Tempo Foundry/SDK tooling.

## Reward configuration

Optional environment variables used by the existing reward configuration:

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

Additional EVM networks are added through `deploy/config/networks.ts` and `hardhat.config.ts`; RPC URLs and credentials remain environment-only.
