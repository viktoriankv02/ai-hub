import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { assertAddress, loadDeployment, saveDeployment, validateDeploymentRecord } from "./utils/deployment";

const target = requireEnv("AI_HUB_NETWORK");
validateDeploymentEnvironment(target);

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const connectedChainId = Number((await ethers.provider.getNetwork()).chainId);

if (connectedChainId !== config.chainId) {
  throw new Error(
    `Network mismatch: Hardhat connected to chain ${connectedChainId}, but AI_HUB_NETWORK=${target} expects ${config.chainId} (${config.name})`,
  );
}

const admin = assertAddress("AI_HUB_ADMIN_ADDRESS", requireEnv("AI_HUB_ADMIN_ADDRESS"));
const deployment = await loadDeployment(target);
validateDeploymentRecord(deployment, target, config.chainId);

const rewardTokenAddress = assertAddress(
  "AI_REWARD_TOKEN_ADDRESS",
  requireEnv("AI_REWARD_TOKEN_ADDRESS"),
);

const completionCaller = assertAddress(
  "AI_COMPLETION_CALLER_ADDRESS",
  process.env.AI_COMPLETION_CALLER_ADDRESS ?? admin,
);
const attester = assertAddress(
  "AI_COMPLETION_ATTESTER_ADDRESS",
  process.env.AI_COMPLETION_ATTESTER_ADDRESS ?? completionCaller,
);
const payoutManager = assertAddress(
  "AI_PAYOUT_MANAGER_ADDRESS",
  process.env.AI_PAYOUT_MANAGER_ADDRESS ?? admin,
);

async function deployOrReuse(name: string, args: readonly unknown[]): Promise<string> {
  const saved = deployment.contracts[name];
  if (saved) {
    const address = assertAddress(name, saved);
    const code = await ethers.provider.getCode(address);
    if (code === "0x") throw new Error(`${name} is recorded at ${address}, but no contract code exists there`);
    const contract = await ethers.getContractAt(name, address);
    if ((await contract.owner()).toLowerCase() !== admin.toLowerCase()) {
      throw new Error(`${name} owner does not match AI_HUB_ADMIN_ADDRESS`);
    }
    console.log(`Reusing ${name}: ${address}`);
    return address;
  }

  const contract = await ethers.deployContract(name, args);
  await contract.waitForDeployment();
  const address = assertAddress(name, await contract.getAddress());
  deployment.contracts[name] = address;
  await saveDeployment(deployment);
  console.log(`Deployed ${name}: ${address}`);
  return address;
}

const runtimeAddress = await deployOrReuse("AIAgentRuntime", [admin]);
const engineAddress = await deployOrReuse("AIAgentEngine", [admin, runtimeAddress, rewardTokenAddress]);
const receiptRegistryAddress = await deployOrReuse("AIJobReceiptRegistry", [admin]);
const reporterAddress = await deployOrReuse(
  "AICompletionReporter",
  [admin, engineAddress, deployment.contracts.ActivityRegistry],
);

const engine = await ethers.getContractAt("AIAgentEngine", engineAddress);
const reporter = await ethers.getContractAt("AICompletionReporter", reporterAddress);
const receiptRegistry = await ethers.getContractAt("AIJobReceiptRegistry", receiptRegistryAddress);

if (!(await engine.completionReporters(reporterAddress))) {
  await (await engine.setCompletionReporter(reporterAddress, true)).wait();
}
if (!(await engine.payoutManagers(payoutManager))) {
  await (await engine.setPayoutManager(payoutManager, true)).wait();
}
if (!(await reporter.authorizedCallers(completionCaller))) {
  await (await reporter.setAuthorizedCaller(completionCaller, true)).wait();
}
if (!(await reporter.attesters(attester))) {
  await (await reporter.setAttester(attester, true)).wait();
}

const currentReceiptRegistry = await reporter.receiptRegistry();
if (currentReceiptRegistry.toLowerCase() !== receiptRegistryAddress.toLowerCase()) {
  await (await reporter.setReceiptRegistry(receiptRegistryAddress)).wait();
}
if (!(await receiptRegistry.reporters(reporterAddress))) {
  await (await receiptRegistry.setReporter(reporterAddress, true)).wait();
}

await saveDeployment({
  ...deployment,
  deployedAt: new Date().toISOString(),
});

console.log(`Base AI job stack ready on ${config.name} (${config.chainId}).`);
console.log(`AIAgentRuntime:       ${runtimeAddress}`);
console.log(`AIAgentEngine:        ${engineAddress}`);
console.log(`AIJobReceiptRegistry: ${receiptRegistryAddress}`);
console.log(`AICompletionReporter: ${reporterAddress}`);
console.log(`Reward token:         ${rewardTokenAddress}`);
console.log(`Completion caller:    ${completionCaller}`);
console.log(`Attester:             ${attester}`);
console.log(`Payout manager:       ${payoutManager}`);
