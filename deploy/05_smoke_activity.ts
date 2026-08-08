import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { validateDeploymentEnvironment } from "./config/validate";
import { loadDeployment } from "./utils/deployment";

const target = process.env.AI_HUB_NETWORK ?? "baseSepolia";
validateDeploymentEnvironment(target);

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const deployment = await loadDeployment(target);

const reporterAddress = process.env.AI_HUB_REPORTER_ADDRESS;
const userAddress = process.env.AI_HUB_USER_ADDRESS;

if (!reporterAddress) throw new Error("Missing AI_HUB_REPORTER_ADDRESS");
if (!userAddress) throw new Error("Missing AI_HUB_USER_ADDRESS");

const activityTypeName = process.env.AI_HUB_ACTIVITY_TYPE ?? "SWAP";
const activityType = ethers.id(activityTypeName);
const projectId = ethers.id(process.env.AI_HUB_PROJECT_ID ?? "AI_HUB_TESTNET");
const metadataHash = ethers.id(process.env.AI_HUB_TEST_TX_ID ?? `${target}-${Date.now()}`);

const reporter = await ethers.getContractAt("ActivityReporter", deployment.contracts.ActivityReporter);
const registry = await ethers.getContractAt("ActivityRegistry", deployment.contracts.ActivityRegistry);

const signer = await ethers.getSigner(reporterAddress);
const connectedReporter = reporter.connect(signer);

console.log(`Submitting smoke activity to ${config.name} (${config.chainId})`);
console.log(`Reporter: ${reporterAddress}`);
console.log(`User: ${userAddress}`);
console.log(`Activity: ${activityTypeName}`);

const tx = await connectedReporter.submit(
  userAddress,
  config.chainId,
  activityType,
  projectId,
  metadataHash,
  true,
);
await tx.wait();

const count = await registry.activityCount(userAddress);
if (count === 0n) throw new Error("Smoke activity was not recorded");

const activity = await registry.getActivity(userAddress, count - 1n);

if (!activity.verified) throw new Error("Smoke activity was not recorded as verified");
if (activity.chainId !== BigInt(config.chainId)) throw new Error("Smoke activity chainId mismatch");
if (activity.activityType !== activityType) throw new Error("Smoke activity type mismatch");

console.log(`Smoke activity confirmed. Count: ${count}`);
console.log(`Transaction: ${tx.hash}`);
