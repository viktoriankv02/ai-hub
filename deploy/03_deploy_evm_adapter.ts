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

let adapterAddress = deployment.contracts.EVMChainAdapter;

if (!adapterAddress) {
  const adapter = await ethers.deployContract("EVMChainAdapter", [admin, config.chainId, ethers.id("EVM")]);
  await adapter.waitForDeployment();
  adapterAddress = await adapter.getAddress();
  console.log(`Deployed EVM adapter: ${adapterAddress}`);
} else {
  const adapter = await ethers.getContractAt("EVMChainAdapter", adapterAddress);
  if ((await adapter.chainId()) !== BigInt(config.chainId)) {
    throw new Error(`Existing EVM adapter chainId mismatch: ${await adapter.chainId()}`);
  }
  if ((await adapter.owner()).toLowerCase() !== admin.toLowerCase()) {
    throw new Error("Existing EVM adapter owner mismatch");
  }
  console.log(`Reusing EVM adapter: ${adapterAddress}`);
}

const chainRegistry = await ethers.getContractAt("ChainRegistry", deployment.contracts.ChainRegistry);
if (!(await chainRegistry.authorizedAdapters(adapterAddress))) {
  await (await chainRegistry.setAdapterAuthorized(adapterAddress, true)).wait();
}

const registered = await chainRegistry.isSupported(config.chainId);
if (!registered) {
  await (
    await chainRegistry.registerChain(
      config.chainId,
      ethers.id(target.toUpperCase()),
      ethers.id("EVM"),
      adapterAddress,
      true,
      config.testnet,
    )
  ).wait();
} else {
  const chain = await chainRegistry.getChain(config.chainId);
  if (chain.adapter.toLowerCase() !== adapterAddress.toLowerCase()) {
    throw new Error("Existing chain registration points to another adapter");
  }
  if (!chain.active) throw new Error("Target chain is registered but inactive");
}

await saveDeployment({
  ...deployment,
  deployedAt: new Date().toISOString(),
  contracts: {
    ...deployment.contracts,
    EVMChainAdapter: adapterAddress,
  },
});

console.log(`EVM adapter and ${config.name} registration ready.`);
