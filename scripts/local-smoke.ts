import { network } from "hardhat";

const { ethers } = await network.connect();

const [owner, reporter, user] = await ethers.getSigners();

const activityRegistry = await ethers.deployContract("ActivityRegistry", [owner.address]);
await activityRegistry.waitForDeployment();

const chainRegistry = await ethers.deployContract("ChainRegistry", [owner.address]);
await chainRegistry.waitForDeployment();

const activityReporter = await ethers.deployContract("ActivityReporter", [
  owner.address,
  activityRegistry.target,
  chainRegistry.target,
]);
await activityReporter.waitForDeployment();

const adapter = await ethers.deployContract("EVMChainAdapter", [
  owner.address,
  84532n,
  ethers.id("EVM"),
]);
await adapter.waitForDeployment();

const activityType = ethers.id("SWAP");
const projectId = ethers.id("AI_HUB_SMOKE_TEST");
const sourceActivityId = ethers.id("BASE_SEPOLIA_SMOKE_001");

await activityRegistry.setActivityType(activityType, true);
await activityRegistry.setReporter(activityReporter.target, true);
await chainRegistry.setAdapterAuthorized(adapter.target, true);
await chainRegistry.registerChain(
  84532n,
  ethers.id("BASE_SEPOLIA"),
  ethers.id("EVM"),
  adapter.target,
  true,
  true,
);
await activityReporter.setReporter(reporter.address, true);
await activityReporter.setSupportedChain(reporter.address, 84532n, true);

await adapter.setActivityVerified(sourceActivityId, user.address, true);

await activityReporter.connect(reporter).submitWithAdapter(
  user.address,
  84532n,
  sourceActivityId,
  activityType,
  projectId,
  "0x1234",
);

const count = await activityRegistry.activityCount(user.address);
if (count !== 1n) throw new Error(`Expected 1 activity, got ${count}`);

const activity = await activityRegistry.getActivity(user.address, 0);
if (activity.chainId !== 84532n) throw new Error("Unexpected chainId");
if (activity.activityType !== activityType) throw new Error("Unexpected activity type");
if (activity.projectId !== projectId) throw new Error("Unexpected project ID");
if (!activity.verified) throw new Error("Activity should be verified");

console.log("AI Hub local smoke test: PASS");
console.log(`ActivityRegistry: ${activityRegistry.target}`);
console.log(`ChainRegistry:    ${chainRegistry.target}`);
console.log(`ActivityReporter: ${activityReporter.target}`);
console.log(`EVM adapter:      ${adapter.target}`);
console.log(`User:             ${user.address}`);
