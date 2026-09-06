import { network } from "hardhat";
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

const rewardTokenAddress = process.env.AI_REWARD_TOKEN_ADDRESS?.trim();
if (!rewardTokenAddress) {
  throw new Error("AI_REWARD_TOKEN_ADDRESS is required; deploy the production reward token first with deploy/09_deploy_reward_token.ts");
}
const rewardToken = assertAddress("AI_REWARD_TOKEN_ADDRESS", rewardTokenAddress);
if ((await ethers.provider.getCode(rewardToken)) === "0x") {
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

async function deployOrReuse(name: string, args: readonly unknown[]): Promise<string> {
  const saved = deployment.contracts[name];
  if (saved) {
    const address = assertAddress(name, saved);
    const code = await ethers.provider.getCode(address);
    if (code === "0x") throw new Error(`${name} is recorded at ${address}, but no contract code exists there`);
    const contract = await ethers.getContractAt(name, address);
    if ((await contract.owner()).toLowerCase() !== admin.toLowerCase()) {
      throw new Error(`${name} owner ${await contract.owner()} does not match admin ${admin}`);
    }
    console.log(`Reusing ${name}: ${address}`);
    return address;
  }

  const contract = await ethers.deployContract(name, args);
  const tx = contract.deploymentTransaction();
  await contract.waitForDeployment();
  const address = assertAddress(name, await contract.getAddress());
  deployment.contracts[name] = address;
  await saveDeployment({ ...deployment, deployedAt: new Date().toISOString() });
  console.log(`Deployed ${name}: ${address}`);
  if (tx) console.log(`${name} deployment tx: ${tx.hash}`);
  return address;
}

const runtimeAddress = await deployOrReuse("AIAgentRuntime", [admin]);
const engineAddress = await deployOrReuse("AIAgentEngine", [admin, runtimeAddress, rewardToken]);
const receiptRegistryAddress = await deployOrReuse("AIJobReceiptRegistry", [admin]);
const reporterAddress = await deployOrReuse(
  "AICompletionReporter",
  [admin, engineAddress, activityRegistryAddress],
);

const engine = await ethers.getContractAt("AIAgentEngine", engineAddress);
const reporter = await ethers.getContractAt("AICompletionReporter", reporterAddress);
const receiptRegistry = await ethers.getContractAt("AIJobReceiptRegistry", receiptRegistryAddress);

if (!(await engine.completionReporters(reporterAddress))) {
  await (await engine.setCompletionReporter(reporterAddress, true)).wait();
  console.log("Configured completion reporter authorization.");
}
if (!(await engine.payoutManagers(payoutManager))) {
  await (await engine.setPayoutManager(payoutManager, true)).wait();
  console.log("Configured payout manager authorization.");
}
if (!(await reporter.authorizedCallers(completionCaller))) {
  await (await reporter.setAuthorizedCaller(completionCaller, true)).wait();
  console.log("Configured completion caller authorization.");
}
if (!(await reporter.attesters(attester))) {
  await (await reporter.setAttester(attester, true)).wait();
  console.log("Configured attester authorization.");
}

const currentReceiptRegistry = await reporter.receiptRegistry();
if (currentReceiptRegistry.toLowerCase() !== receiptRegistryAddress.toLowerCase()) {
  await (await reporter.setReceiptRegistry(receiptRegistryAddress)).wait();
  console.log("Configured receipt registry.");
}
if (!(await receiptRegistry.reporters(reporterAddress))) {
  await (await receiptRegistry.setReporter(reporterAddress, true)).wait();
  console.log("Configured receipt reporter authorization.");
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
