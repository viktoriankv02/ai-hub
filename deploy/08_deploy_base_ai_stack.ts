import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { validateDeploymentEnvironment } from "./config/validate";
import { saveDeployment } from "./utils/deployment";

const target = process.env.AI_HUB_NETWORK?.trim() || "baseSepolia";
validateDeploymentEnvironment(target);
const config = EVM_NETWORKS[target];
if (!config) throw new Error(`Unknown AI_HUB_NETWORK: ${target}`);

const { ethers } = await network.connect();
const connectedChainId = Number((await ethers.provider.getNetwork()).chainId);
if (connectedChainId !== config.chainId) throw new Error(`Network mismatch: connected ${connectedChainId}, expected ${config.chainId}`);

const [deployer] = await ethers.getSigners();
const admin = process.env.AI_HUB_ADMIN_ADDRESS?.trim() || deployer.address;
const activityType = ethers.id(process.env.AI_JOB_ACTIVITY_TYPE || "AI_JOB_COMPLETED");
const projectId = ethers.id(process.env.AI_JOB_PROJECT_ID || "AI_HUB_JOB_PIPELINE");
const vmType = ethers.id("EVM");
const chainName = ethers.id(config.name);
const deployMockToken = target !== "base" && (process.env.AI_DEPLOY_TEST_REWARD_TOKEN ?? "true") !== "false";
const configuredRewardToken = process.env.AI_REWARD_TOKEN_ADDRESS?.trim();

if (target === "base" && !configuredRewardToken) throw new Error("Base mainnet requires AI_REWARD_TOKEN_ADDRESS");

console.log(`AI Hub stack: ${config.name} (${config.chainId})`);
console.log(`Admin: ${admin}`);

const token = deployMockToken
  ? await ethers.deployContract("MockRewardToken")
  : await ethers.getContractAt("IERC20", configuredRewardToken!);
if (deployMockToken) await token.waitForDeployment();
const rewardToken = await token.getAddress();

const activityRegistry = await ethers.deployContract("ActivityRegistry", [admin]);
await activityRegistry.waitForDeployment();
const chainRegistry = await ethers.deployContract("ChainRegistry", [admin]);
await chainRegistry.waitForDeployment();
const adapter = await ethers.deployContract("EVMChainAdapter", [admin, config.chainId, vmType]);
await adapter.waitForDeployment();
const activityReporter = await ethers.deployContract("ActivityReporter", [admin, await activityRegistry.getAddress(), await chainRegistry.getAddress()]);
await activityReporter.waitForDeployment();
const runtime = await ethers.deployContract("AIAgentRuntime", [admin]);
await runtime.waitForDeployment();
const engine = await ethers.deployContract("AIAgentEngine", [admin, await runtime.getAddress(), rewardToken]);
await engine.waitForDeployment();
const completionReporter = await ethers.deployContract("AICompletionReporter", [admin, await engine.getAddress(), await activityRegistry.getAddress()]);
await completionReporter.waitForDeployment();
const jobAdapter = await ethers.deployContract("AIJobActivityAdapter", [admin, await engine.getAddress(), await runtime.getAddress(), await activityRegistry.getAddress(), config.chainId, activityType, projectId]);
await jobAdapter.waitForDeployment();

const activityRegistryAddress = await activityRegistry.getAddress();
const chainRegistryAddress = await chainRegistry.getAddress();
const adapterAddress = await adapter.getAddress();
const activityReporterAddress = await activityReporter.getAddress();
const runtimeAddress = await runtime.getAddress();
const engineAddress = await engine.getAddress();
const completionReporterAddress = await completionReporter.getAddress();
const jobAdapterAddress = await jobAdapter.getAddress();

console.log("Configuring trust boundaries...");
await (await activityRegistry.setActivityType(activityType, true)).wait();
await (await activityRegistry.setReporter(activityReporterAddress, true)).wait();
await (await activityRegistry.setReporter(completionReporterAddress, true)).wait();
await (await activityRegistry.setReporter(jobAdapterAddress, true)).wait();
await (await chainRegistry.setAdapterAuthorized(adapterAddress, true)).wait();
await (await chainRegistry.registerChain(config.chainId, chainName, vmType, adapterAddress, true, config.testnet)).wait();
await (await activityReporter.setReporter(deployer.address, true)).wait();
await (await activityReporter.setSupportedChain(deployer.address, config.chainId, true)).wait();
await (await engine.setCompletionReporter(completionReporterAddress, true)).wait();
await (await engine.setCompletionReporter(deployer.address, true)).wait();
await (await engine.setPayoutManager(admin, true)).wait();
await (await jobAdapter.setReporter(deployer.address, true)).wait();

const deployment = {
  network: target,
  chainId: config.chainId,
  deployedAt: new Date().toISOString(),
  contracts: {
    RewardToken: rewardToken,
    ActivityRegistry: activityRegistryAddress,
    ChainRegistry: chainRegistryAddress,
    EVMChainAdapter: adapterAddress,
    ActivityReporter: activityReporterAddress,
    AIAgentRuntime: runtimeAddress,
    AIAgentEngine: engineAddress,
    AICompletionReporter: completionReporterAddress,
    AIJobActivityAdapter: jobAdapterAddress,
  },
};

await saveDeployment(deployment);
console.log(JSON.stringify(deployment, null, 2));
console.log("Deployment complete.");
