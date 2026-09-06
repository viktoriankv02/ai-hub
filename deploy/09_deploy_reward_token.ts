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

const expectedTotalSupply = 1_000_000_000n * 10n ** 18n;
const existing = deployment.contracts.AIHubRewardToken;
let existingIsValid = false;

if (existing) {
  const address = assertAddress("AIHubRewardToken", existing);
  const code = await ethers.provider.getCode(address);

  if (code !== "0x") {
    const token = await ethers.getContractAt("AIHubRewardToken", address);
    try {
      const [name, symbol, totalSupply, treasuryBalance] = await Promise.all([
        token.name(),
        token.symbol(),
        token.totalSupply(),
        token.balanceOf(treasury),
      ]);

      existingIsValid =
        name === "AI Hub Reward Token" &&
        symbol === "AIHUB" &&
        totalSupply === expectedTotalSupply &&
        treasuryBalance > 0n;

      if (existingIsValid) {
        console.log(`Reusing AIHubRewardToken: ${address}`);
        console.log(`Treasury: ${treasury}`);
        console.log(`Total supply: ${totalSupply.toString()}`);
        process.env.AI_REWARD_TOKEN_ADDRESS = address;
      } else {
        console.log(`Ignoring stale AIHubRewardToken record at ${address}: token metadata or supply does not match.`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.log(`Ignoring stale AIHubRewardToken record at ${address}: contract is not a compatible AIHUB token (${reason}).`);
    }
  } else {
    console.log(`Ignoring stale AIHubRewardToken record at ${address}: no bytecode at address.`);
  }
}

if (!existingIsValid) {
  console.log(`Deploying AIHubRewardToken with treasury ${treasury}...`);
  const token = await ethers.deployContract("AIHubRewardToken", [treasury]);
  const address = assertAddress("AIHubRewardToken", await token.getAddress());
  console.log(`Deployment submitted: ${address}`);

  await token.waitForDeployment();

  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(
      `AIHubRewardToken deployment produced no runtime bytecode at ${address}. Run npm run build and retry.`,
    );
  }

  const totalSupply = await token.totalSupply();
  const treasuryBalance = await token.balanceOf(treasury);

  if (totalSupply !== expectedTotalSupply) {
    throw new Error(`Unexpected deployed AIHUB total supply: ${totalSupply}`);
  }
  if (treasuryBalance !== expectedTotalSupply) {
    throw new Error(`Unexpected deployed AIHUB treasury balance: ${treasuryBalance}`);
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
