# AI Hub deployment

The deployment layer is intentionally testnet-first. Mainnet deployment is disabled until the protocol passes local integration tests, testnet verification, security review, and an explicit governance decision.

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
AI_HUB_NETWORK=inkSepolia

SEPOLIA_RPC_URL=...
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

INK_SEPOLIA_EXPLORER_URL=https://explorer-sepolia.inkonchain.com
PLASMA_EXPLORER_URL=https://testnet.plasmascan.to
ARC_EXPLORER_URL=https://testnet.arcscan.app
TEMPO_EXPLORER_URL=https://explore.tempo.xyz
```

The deployment scripts refuse targets that are not configured as testnets.

## Deployment order

Run the steps in this order. Each step is designed to be safe to rerun against the same deployment record.

```text
00_deploy_core.ts
03_deploy_evm_adapter.ts
01_configure_core.ts
02_register_chain.ts
04_verify_configuration.ts
```

The adapter step owns `ChainRegistry` registration. Core configuration grants permissions and wires the deployed modules together. The verification step checks the resulting on-chain configuration.

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
