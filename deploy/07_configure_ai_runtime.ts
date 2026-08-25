import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { loadDeployment } from "./utils/deployment";

const target = requireEnv("AI_HUB_NETWORK");
validateDeploymentEnvironment(target);

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const connectedChainId = Number((await ethers.provider.getNetwork()).chainId);

if (connectedChainId !== config.chainId) {
  throw new Error(
    `Network mismatch: connected ${connectedChainId}, expected ${config.chainId}`,
  );
}

const admin = requireEnv("AI_HUB_ADMIN_ADDRESS");
const completionCaller = process.env.AI_COMPLETION_CALLER_ADDRESS ?? admin;
const attester = process.env.AI_COMPLETION_ATTESTER_ADDRESS ?? completionCaller;
const activityType = process.env.AI_JOB_ACTIVITY_TYPE ?? "AI_JOB_COMPLETED";

const deployment = await loadDeployment(target);

const engineAddress = deployment.contracts.AIAgentEngine;
const reporterAddress = deployment.contracts.AICompletionReporter;
const activityRegistryAddress = deployment.contracts.ActivityRegistry;

if (!engineAddress) {
  throw new Error(
    `Deployment artifact for ${target} is missing AIAgentEngine. Run 06_deploy_ai_runtime.ts first.`,
  );
}

if (!reporterAddress) {
  throw new Error(
    `Deployment artifact for ${target} is missing AICompletionReporter. Run 06_deploy_ai_runtime.ts first.`,
  );
}

if (!activityRegistryAddress) {
  throw new Error(
    `Deployment artifact for ${target} is missing ActivityRegistry. Run the core deployment first.`,
  );
}

const engine = await ethers.getContractAt("AIAgentEngine", engineAddress);
const reporter = await ethers.getContractAt(
  "AICompletionReporter",
  reporterAddress,
);
const registry = await ethers.getContractAt(
  "ActivityRegistry",
  activityRegistryAddress,
);

console.log(`Configuring AI runtime on ${config.name} (${config.chainId})`);
console.log(`Engine=${engineAddress}`);
console.log(`Reporter=${reporterAddress}`);
console.log(`Completion caller=${completionCaller}`);
console.log(`Attester=${attester}`);
console.log(`Activity type=${activityType}`);

if (!(await engine.completionReporters(reporterAddress))) {
  await (await engine.setCompletionReporter(reporterAddress, true)).wait();
  console.log("AIAgentEngine completion reporter authorized.");
} else {
  console.log("AIAgentEngine completion reporter already authorized.");
}

if (!(await reporter.completionCallers(completionCaller))) {
  await (await reporter.setCompletionCaller(completionCaller, true)).wait();
  console.log("AICompletionReporter caller authorized.");
} else {
  console.log("AICompletionReporter caller already authorized.");
}

if (!(await reporter.attesters(attester))) {
  await (await reporter.setAttester(attester, true)).wait();
  console.log("AICompletionReporter attester authorized.");
} else {
  console.log("AICompletionReporter attester already authorized.");
}

const activityTypeHash = ethers.id(activityType);
if (!(await registry.supportedActivityTypes(activityTypeHash))) {
  await (await registry.setActivityType(activityTypeHash, true)).wait();
  console.log("AI completion activity type registered.");
} else {
  console.log("AI completion activity type already registered.");
}

if (!(await registry.reporters(reporterAddress))) {
  await (await registry.setReporter(reporterAddress, true)).wait();
  console.log("ActivityRegistry reporter authorized.");
} else {
  console.log("ActivityRegistry reporter already authorized.");
}

const engineAuthorized = await engine.completionReporters(reporterAddress);
const callerAuthorized = await reporter.completionCallers(completionCaller);
const attesterAuthorized = await reporter.attesters(attester);
const activitySupported = await registry.supportedActivityTypes(activityTypeHash);
const registryAuthorized = await registry.reporters(reporterAddress);

if (!engineAuthorized) throw new Error("AIAgentEngine reporter authorization failed");
if (!callerAuthorized) throw new Error("AICompletionReporter caller authorization failed");
if (!attesterAuthorized) throw new Error("AICompletionReporter attester authorization failed");
if (!activitySupported) throw new Error("AI completion activity type is not supported");
if (!registryAuthorized) throw new Error("ActivityRegistry reporter authorization failed");

console.log("");
console.log("AI runtime authorization verified.");
console.log(`Network: ${config.name} (${config.chainId})`);
console.log(`Engine: ${engineAddress}`);
console.log(`Reporter: ${reporterAddress}`);
console.log(`Completion caller: ${completionCaller}`);
console.log(`Attester: ${attester}`);
console.log(`ActivityRegistry: ${activityRegistryAddress}`);
console.log(`Activity type: ${activityType}`);
