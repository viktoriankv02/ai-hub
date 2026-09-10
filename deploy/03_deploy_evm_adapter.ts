import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { validateDeploymentEnvironment } from "./config/validate";
import { assertAddress, loadDeployment, saveDeployment, validateDeploymentRecord } from "./utils/deployment";

const target = process.env.AI_HUB_NETWORK;
if (!target) {
  throw new Error(
    "Missing AI_HUB_NETWORK. Set it explicitly, for example: AI_HUB_NETWORK=inkSepolia",
  );
}

validateDeploymentEnvironment(target);

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const connectedChainId = Number((await ethers.provider.getNetwork()).chainId);

if (connectedChainId !== config.chainId) {
  throw new Error(
    `Network mismatch: Hardhat connected to chain ${connectedChainId}, but AI_HUB_NETWORK=${target} expects ${config.chainId} (${config.name})`,
  );
}

const [deployer] = await ethers.getSigners();
const deployerAddress = await deployer.getAddress();
const configuredAdmin = process.env.AI_HUB_ADMIN_ADDRESS;
const admin = configuredAdmin && ethers.isAddress(configuredAdmin)
  ? ethers.getAddress(configuredAdmin)
  : deployerAddress;

if (configuredAdmin && !ethers.isAddress(configuredAdmin)) {
  console.warn("AI_HUB_ADMIN_ADDRESS is invalid and will be ignored; using the deployer address as admin.");
}

if (admin.toLowerCase() !== deployerAddress.toLowerCase()) {
  throw new Error(
    `AI_HUB_ADMIN_ADDRESS ${admin} must match the connected deployer ${deployerAddress}`,
  );
}

const deployment = await loadDeployment(target);
validateDeploymentRecord(deployment, target, config.chainId);

let adapterAddress = deployment.contracts.EVMChainAdapter;

if (!adapterAddress) {
  const adapter = await ethers.deployContract("EVMChainAdapter", [admin, config.chainId, ethers.id("EVM")]);
  await adapter.waitForDeployment();
  adapterAddress = assertAddress("EVMChainAdapter", await adapter.getAddress());
  deployment.contracts.EVMChainAdapter = adapterAddress;
  await saveDeployment(deployment);
  console.log(`Deployed EVM adapter and persisted address: ${adapterAddress}`);
} else {
  adapterAddress = assertAddress("EVMChainAdapter", adapterAddress);
  const code = await ethers.provider.getCode(adapterAddress);
  if (code === "0x") throw new Error(`EVM adapter ${adapterAddress} has no contract code`);
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

let adapterAuthorized = await chainRegistry.adapterAuthorized(adapterAddress);
if (!adapterAuthorized) {
  const tx = await chainRegistry.setAdapterAuthorized(adapterAddress, true);
  console.log(`Authorizing EVM adapter in ChainRegistry: ${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Adapter authorization transaction failed: ${tx.hash}`);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    adapterAuthorized = await chainRegistry.adapterAuthorized(adapterAddress);
    if (adapterAuthorized) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

if (!adapterAuthorized) {
  throw new Error(`ChainRegistry did not persist adapter authorization for ${adapterAddress}`);
}

console.log(`EVM adapter authorized: ${adapterAddress}`);

const registered = await chainRegistry.isSupported(config.chainId);
if (!registered) {
  const tx = await chainRegistry.registerChain(
    config.chainId,
    ethers.id(target.toUpperCase()),
    ethers.id("EVM"),
    adapterAddress,
    true,
    config.testnet,
  );
  console.log(`Registering ${config.name} in ChainRegistry: ${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Chain registration transaction failed: ${tx.hash}`);
  }
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
});

console.log(`EVM adapter and ${config.name} registration ready.`);
