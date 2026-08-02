import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { loadDeployment, saveDeployment } from "./utils/deployment";

const target = process.env.AI_HUB_NETWORK ?? "sepolia";
validateDeploymentEnvironment(target);

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const admin = requireEnv("AI_HUB_ADMIN_ADDRESS");
const deployment = await loadDeployment(target);

const adapter = await ethers.deployContract("EVMChainAdapter", [admin, config.chainId, ethers.id("EVM")]);
await adapter.waitForDeployment();

const chainRegistry = await ethers.getContractAt("ChainRegistry", deployment.contracts.ChainRegistry);
await chainRegistry.setAdapterAuthorized(adapter.target, true);
await chainRegistry.registerChain(
  config.chainId,
  ethers.id(target.toUpperCase()),
  ethers.id("EVM"),
  adapter.target,
  true,
  config.testnet,
);

await saveDeployment({
  ...deployment,
  deployedAt: new Date().toISOString(),
  contracts: {
    ...deployment.contracts,
    EVMChainAdapter: adapter.target.toString(),
  },
});

console.log(`EVM adapter registered for ${config.name}: ${adapter.target}`);
