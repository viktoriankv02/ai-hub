import { network } from "hardhat";
import { JsonRpcProvider, TransactionResponse } from "ethers";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { assertAddress, loadDeployment, saveDeployment, validateDeploymentRecord } from "./utils/deployment";

const target = requireEnv("AI_HUB_NETWORK");
validateDeploymentEnvironment(target);
if (target !== "base") {
  throw new Error(`AI Hub AI job stack deployment is Base Mainnet-only; got ${target}`);
}

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const connectedChainId = Number((await ethers.provider.getNetwork()).chainId);
if (connectedChainId !== config.chainId) {
  throw new Error(
    `Network mismatch: Hardhat connected to chain ${connectedChainId}, but AI_HUB_NETWORK=${target} expects ${config.chainId}`,
  );
}

const verificationRpcUrl = process.env.BASE_VERIFICATION_RPC_URL?.trim() || "https://base.drpc.org";
const verificationProvider = new JsonRpcProvider(verificationRpcUrl, config.chainId, { staticNetwork: true });

async function getRuntimeCode(address: string): Promise<string> {
  const primaryCode = await ethers.provider.getCode(address);
  if (primaryCode !== "0x") return primaryCode;
  const fallbackCode = await verificationProvider.getCode(address);
  if (fallbackCode !== "0x") {
    console.log(`Bytecode visible through verification RPC ${verificationRpcUrl}: ${address}`);
  }
  return fallbackCode;
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

const rewardTokenInput = process.env.AI_REWARD_TOKEN_ADDRESS?.trim() || deployment.contracts.AIHubRewardToken;
if (!rewardTokenInput) {
  throw new Error(
    "AI_REWARD_TOKEN_ADDRESS is required; deploy the production reward token first with deploy/09_deploy_reward_token.ts",
  );
}
const rewardToken = assertAddress("AI_REWARD_TOKEN_ADDRESS", rewardTokenInput);
if ((await getRuntimeCode(rewardToken)) === "0x") {
  throw new Error(`AI_REWARD_TOKEN_ADDRESS has no deployed bytecode: ${rewardToken}`);
}

const completionCaller = assertAddress(
  "AI_COMPLETION_CALLER_ADDRESS",
  process.env.AI_COMPLETION_CALLER_ADDRESS?.trim() || admin,
);
const attester = assertAddress(
  "AI_COMPLETION_ATTESTER_ADDRESS",
  process.env.AI_COMPLETION_ATTESTER_ADDRESS?.trim() || completionCaller,
);
const payoutManager = assertAddress(
  "AI_PAYOUT_MANAGER_ADDRESS",
  process.env.AI_PAYOUT_MANAGER_ADDRESS?.trim() || admin,
);

const activityRegistryAddress = assertAddress("ActivityRegistry", deployment.contracts.ActivityRegistry);

async function assertGasSafety(): Promise<void> {
  const balance = await ethers.provider.getBalance(deployer);
  const minimumBalance = ethers.parseEther(process.env.AI_HUB_MIN_MAINNET_BALANCE_ETH?.trim() || "0.0001");
  console.log(`Deployer balance: ${ethers.formatEther(balance)} ETH`);
  console.log(`Minimum deployment balance: ${ethers.formatEther(minimumBalance)} ETH`);
  if (balance < minimumBalance) {
    throw new Error(
      `Insufficient Base Mainnet ETH balance: ${ethers.formatEther(balance)} ETH. ` +
        `Refusing AI job stack deployment below ${ethers.formatEther(minimumBalance)} ETH.`,
    );
  }
}

async function deployOrReuse(name: string, args: readonly unknown[]): Promise<string> {
  const saved = deployment.contracts[name];
  if (saved) {
    const address = assertAddress(name, saved);
    const code = await getRuntimeCode(address);
    if (code === "0x") throw new Error(`${name} is recorded at ${address}, but no contract code exists on primary or verification RPC`);
    const contract = await ethers.getContractAt(name, address);
    const owner = await contract.owner();
    if (owner.toLowerCase() !== admin.toLowerCase()) {
      throw new Error(`${name} owner ${owner} does not match admin ${admin}`);
    }
    console.log(`Reusing ${name}: ${address}`);
    return address;
  }

  const balanceBefore = await ethers.provider.getBalance(deployer);
  console.log(`${name}: deployer balance before deployment ${ethers.formatEther(balanceBefore)} ETH`);

  const contract = await ethers.deployContract(name, args);
  const tx = contract.deploymentTransaction();
  await contract.waitForDeployment();
  const address = assertAddress(name, await contract.getAddress());

  if (tx) {
    const receipt = await tx.wait();
    if (!receipt) throw new Error(`${name} deployment receipt was not available for ${tx.hash}`);
    if (receipt.status !== 1) throw new Error(`${name} deployment reverted: ${tx.hash}`);
    console.log(`${name} deployment tx: ${tx.hash}`);
    console.log(`${name} deployment confirmed: block ${receipt.blockNumber}, gas used ${receipt.gasUsed.toString()}`);
  }

  let code = await getRuntimeCode(address);
  for (let attempt = 1; attempt <= 6 && code === "0x"; attempt += 1) {
    console.log(`Waiting for runtime bytecode at ${address} (attempt ${attempt}/6)...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    code = await getRuntimeCode(address);
  }
  if (code === "0x") {
    throw new Error(`${name} deployment confirmed but runtime bytecode is not visible on primary or verification RPC at ${address}; preserve tx ${tx?.hash ?? "unknown"} and recover before retrying.`);
  }

  deployment.contracts[name] = address;
  await saveDeployment({ ...deployment, deployedAt: new Date().toISOString() });
  console.log(`Deployed ${name}: ${address}`);
  return address;
}

async function sendConfiguration(txPromise: Promise<TransactionResponse>, label: string): Promise<void> {
  const tx = await txPromise;
  const receipt = await tx.wait();
  if (!receipt) throw new Error(`${label} receipt was not available for ${tx.hash}`);
  if (receipt.status !== 1) throw new Error(`${label} transaction reverted: ${tx.hash}`);
  console.log(`${label}: ${tx.hash}`);
}

await assertGasSafety();
const runtimeAddress = await deployOrReuse("AIAgentRuntime", [admin]);
await assertGasSafety();
const engineAddress = await deployOrReuse("AIAgentEngine", [admin, runtimeAddress, rewardToken]);
await assertGasSafety();
const receiptRegistryAddress = await deployOrReuse("AIJobReceiptRegistry", [admin]);
await assertGasSafety();
const reporterAddress = await deployOrReuse("AICompletionReporter", [admin, engineAddress, activityRegistryAddress]);
await assertGasSafety();

const engine = await ethers.getContractAt("AIAgentEngine", engineAddress);
const reporter = await ethers.getContractAt("AICompletionReporter", reporterAddress);
const receiptRegistry = await ethers.getContractAt("AIJobReceiptRegistry", receiptRegistryAddress);
const activityRegistry = await ethers.getContractAt("ActivityRegistry", activityRegistryAddress);

if (!(await engine.completionReporters(reporterAddress))) {
  await sendConfiguration(engine.setCompletionReporter(reporterAddress, true), "Configured completion reporter authorization");
}
if (!(await engine.payoutManagers(payoutManager))) {
  await sendConfiguration(engine.setPayoutManager(payoutManager, true), "Configured payout manager authorization");
}
if (!(await reporter.authorizedCallers(completionCaller))) {
  await sendConfiguration(reporter.setAuthorizedCaller(completionCaller, true), "Configured completion caller authorization");
}
if (!(await reporter.attesters(attester))) {
  await sendConfiguration(reporter.setAttester(attester, true), "Configured attester authorization");
}
if (!(await activityRegistry.reporters(reporterAddress))) {
  await sendConfiguration(activityRegistry.setReporter(reporterAddress, true), "Configured AI completion reporter in ActivityRegistry");
}

const currentReceiptRegistry = await reporter.receiptRegistry();
if (currentReceiptRegistry.toLowerCase() !== receiptRegistryAddress.toLowerCase()) {
  await sendConfiguration(reporter.setReceiptRegistry(receiptRegistryAddress), "Configured receipt registry");
}
if (!(await receiptRegistry.reporters(reporterAddress))) {
  await sendConfiguration(receiptRegistry.setReporter(reporterAddress, true), "Configured receipt reporter authorization");
}

await saveDeployment({ ...deployment, deployedAt: new Date().toISOString() });

console.log("");
console.log(`Base AI job stack ready on ${config.name} (${config.chainId}).`);
console.log(`AIAgentRuntime:       ${runtimeAddress}`);
console.log(`AIAgentEngine:        ${engineAddress}`);
console.log(`AIJobReceiptRegistry: ${receiptRegistryAddress}`);
console.log(`AICompletionReporter: ${reporterAddress}`);
console.log(`Reward token:         ${rewardToken}`);
console.log(`Completion caller:    ${completionCaller}`);
console.log(`Attester:             ${attester}`);
console.log(`Payout manager:       ${payoutManager}`);
