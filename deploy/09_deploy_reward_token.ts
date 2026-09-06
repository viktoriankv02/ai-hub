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

async function waitForRuntimeBytecode(address: string, attempts = 12, delayMs = 2500): Promise<string> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const code = await ethers.provider.getCode(address);
    if (code !== "0x") return code;
    if (attempt < attempts) {
      console.log(`Waiting for runtime bytecode at ${address} (attempt ${attempt}/${attempts})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return "0x";
}

async function readExistingToken(address: string): Promise<boolean> {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") return false;

  const token = await ethers.getContractAt("AIHubRewardToken", address);
  try {
    const [name, symbol, totalSupply, treasuryBalance] = await Promise.all([
      token.name(),
      token.symbol(),
      token.totalSupply(),
      token.balanceOf(treasury),
    ]);

    return (
      name === "AI Hub Reward Token" &&
      symbol === "AIHUB" &&
      totalSupply === expectedTotalSupply &&
      treasuryBalance > 0n
    );
  } catch {
    return false;
  }
}

if (existing) {
  const address = assertAddress("AIHubRewardToken", existing);
  if (await readExistingToken(address)) {
    const token = await ethers.getContractAt("AIHubRewardToken", address);
    const [totalSupply, treasuryBalance] = await Promise.all([
      token.totalSupply(),
      token.balanceOf(treasury),
    ]);
    existingIsValid = true;
    console.log(`Reusing AIHubRewardToken: ${address}`);
    console.log(`Treasury: ${treasury}`);
    console.log(`Total supply: ${totalSupply.toString()}`);
    console.log(`Treasury balance: ${treasuryBalance.toString()}`);
    process.env.AI_REWARD_TOKEN_ADDRESS = address;
  } else {
    console.log(`Ignoring stale AIHubRewardToken record at ${address}.`);
  }
}

if (!existingIsValid) {
  const deployerBalance = await ethers.provider.getBalance(deployer);
  console.log(`Deployer: ${deployer}`);
  console.log(`Deployer balance: ${ethers.formatEther(deployerBalance)} ETH`);
  console.log(`Deploying AIHubRewardToken with treasury ${treasury}...`);

  const token = await ethers.deployContract("AIHubRewardToken", [treasury]);
  const address = assertAddress("AIHubRewardToken", await token.getAddress());
  const deploymentTx = token.deploymentTransaction();

  console.log(`Deployment submitted: ${address}`);
  if (deploymentTx) console.log(`Deployment tx: ${deploymentTx.hash}`);

  await token.waitForDeployment();

  if (deploymentTx) {
    const receipt = await deploymentTx.wait();
    if (!receipt) {
      throw new Error(`AIHubRewardToken deployment receipt was not available for ${deploymentTx.hash}`);
    }
    if (receipt.status !== 1) {
      throw new Error(
        `AIHubRewardToken deployment transaction reverted: ${deploymentTx.hash}. No token contract was created.`,
      );
    }
    console.log(`Deployment confirmed: block ${receipt.blockNumber}, gas used ${receipt.gasUsed.toString()}`);
  }

  const code = await waitForRuntimeBytecode(address);
  if (code === "0x") {
    throw new Error(
      `AIHubRewardToken deployment was confirmed but runtime bytecode was not visible after polling at ${address}. Check the transaction on BaseScan before attempting another deployment.`,
    );
  }

  const tokenAfterConfirmation = await ethers.getContractAt("AIHubRewardToken", address);
  const [totalSupply, treasuryBalance] = await Promise.all([
    tokenAfterConfirmation.totalSupply(),
    tokenAfterConfirmation.balanceOf(treasury),
  ]);

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
