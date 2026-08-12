import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";

const target = requireEnv("AI_HUB_NETWORK");
validateDeploymentEnvironment(target);
const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const connectedChainId = Number((await ethers.provider.getNetwork()).chainId);
if (connectedChainId !== config.chainId) throw new Error(`Network mismatch: connected ${connectedChainId}, expected ${config.chainId}`);

const engineAddress = requireEnv("AI_AGENT_ENGINE_ADDRESS");
const reporterAddress = requireEnv("AI_COMPLETION_REPORTER_ADDRESS");
const completionCaller = requireEnv("AI_COMPLETION_CALLER_ADDRESS");
const activityRegistryAddress = requireEnv("ACTIVITY_REGISTRY_ADDRESS");
const activityType = process.env.AI_JOB_ACTIVITY_TYPE ?? "AI_JOB_COMPLETED";

const engine = await ethers.getContractAt("AIAgentEngine", engineAddress);
const reporter = await ethers.getContractAt("AICompletionReporter", reporterAddress);
const registry = await ethers.getContractAt("ActivityRegistry", activityRegistryAddress);

console.log(`Authorizing reporter ${reporterAddress} in AIAgentEngine`);
await (await engine.setCompletionReporter(reporterAddress, true)).wait();

console.log(`Authorizing completion caller ${completionCaller} in AICompletionReporter`);
await (await reporter.setCompletionCaller(completionCaller, true)).wait();

console.log(`Authorizing reporter ${reporterAddress} in ActivityRegistry`);
await (await registry.setActivityType(ethers.id(activityType), true)).wait();
await (await registry.setReporter(reporterAddress, true)).wait();

console.log("AI runtime authorization configured.");
console.log(`Network: ${config.name} (${config.chainId})`);
console.log(`Engine: ${engineAddress}`);
console.log(`Reporter: ${reporterAddress}`);
console.log(`Completion caller: ${completionCaller}`);
console.log(`ActivityRegistry: ${activityRegistryAddress}`);
console.log(`Activity type: ${activityType}`);
