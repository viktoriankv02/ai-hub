import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { assertAddress, loadDeployment, saveDeployment, validateDeploymentRecord } from "./utils/deployment";

const target = requireEnv("AI_HUB_NETWORK");
validateDeploymentEnvironment(target);
if (target !== "base") {
  throw new Error(`AI Hub production reward token deployment is Base Mainnet-only; got ${target}`);
}

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const connectedChainId = Number((await ethers.provider.getNetwork()).chainId);
if (connectedChainId !== config.chainId) {
  throw new Error(`Network mismatch: connected ${connectedChainId}, expected ${config.chainId}`);
}

const deployment = await loadDeployment(target);
validateDeploymentRecord(deployment, target, config.chainId);

const [signer] = await ethers.getSigners();
const deployer = await signer.getAddress();
const configuredAdmin = process.env.AI_HUB_ADMIN_ADDRESS?.trim();
const admin = configuredAdmin && ethers.isAddress(configuredAdmin)
  ? ethers.getAddress(configuredAdmin)
  : deployer;

if (admin.toLowerCase() !== deployer.toLowerCase()) {
  throw new Error(`Admin ${admin} does not match deployer ${deployer}`);
}

const configuredTreasury = process.env.AI_HUB_REWARD_TREASURY_ADDRESS?.trim();
const treasury = configuredTreasury && ethers.isAddress(configuredTreasury)
  ? ethers.getAddress(configuredTreasury)
  : admin;

const existing = deployment.contracts.AIHubRewardToken;
if (existing) {
  const address = assertAddress("AIHubRewardToken", existing);
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`AIHubRewardToken is recorded at ${address}, but has no bytecode`);

  const token = await ethers.getContractAt("AIHubRewardToken", address);
  const [name, symbol, totalSupply, treasuryBalance] = await Promise.all([
    token.name(),
    token.symbol(),
    token.totalSupply(),
    token.balanceOf(treasury),
  ]);

  if (name !== "AI Hub Reward Token") throw new Error(`Unexpected token name: ${name}`);
  if (symbol !== "AIHUB") throw new Error(`Unexpected token symbol: ${symbol}`);
  if (totalSupply !== 1_000_000_000n * 10n ** 18n) {
    throw new Error(`Unexpected AIHUB total supply: ${totalSupply}`);
  }
  if (treasuryBalance === 0n) {
    throw new Error(`AIHubRewardToken treasury balance is zero for ${treasury}`);
  }

  console.log(`Reusing AIHubRewardToken: ${address}`);
  console.log(`Treasury: ${treasury}`);
  console.log(`Total supply: ${totalSupply.toString()}`);
  process.env.AI_REWARD_TOKEN_ADDRESS = address;
} else {
  const token = await ethers.deployContract("AIHubRewardToken", [treasury]);
  await token.waitForDeployment();
  const address = assertAddress("AIHubRewardToken", await token.getAddress());
  const totalSupply = await token.totalSupply();

  if (totalSupply !== 1_000_000_000n * 10n ** 18n) {
    throw new Error(`Unexpected deployed AIHUB total supply: ${totalSupply}`);
  }

  deployment.contracts.AIHubRewardToken = address;
  await saveDeployment({ ...deployment, deployedAt: new Date().toISOString() });

  console.log(`Deployed AIHubRewardToken: ${address}`);
  console.log(`Treasury: ${treasury}`);
  console.log(`Total supply: ${totalSupply.toString()}`);
  process.env.AI_REWARD_TOKEN_ADDRESS = address;
}

console.log(`Base Mainnet reward token ready: ${config.chainId}`);
console.log("Explorer: https://basescan.org");
console.log(`Token explorer: https://basescan.org/address/${deployment.contracts.AIHubRewardToken}`);
