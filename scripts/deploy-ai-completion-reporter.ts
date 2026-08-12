import { network } from "hardhat";

const engineAddress = process.env.AI_AGENT_ENGINE_ADDRESS;
const activityRegistryAddress = process.env.ACTIVITY_REGISTRY_ADDRESS;

if (!engineAddress) throw new Error("AI_AGENT_ENGINE_ADDRESS is required");
if (!activityRegistryAddress) throw new Error("ACTIVITY_REGISTRY_ADDRESS is required");

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();

const Reporter = await ethers.getContractFactory("AICompletionReporter");
const reporter = await Reporter.deploy(
  deployer.address,
  engineAddress,
  activityRegistryAddress,
);
await reporter.waitForDeployment();

const address = await reporter.getAddress();
console.log("AICompletionReporter deployed");
console.log(`network=${process.env.HARDHAT_NETWORK ?? "hardhat"}`);
console.log(`deployer=${deployer.address}`);
console.log(`engine=${engineAddress}`);
console.log(`activityRegistry=${activityRegistryAddress}`);
console.log(`reporter=${address}`);
console.log("");
console.log("Next configuration:");
console.log(`AI_COMPLETION_REPORTER_ADDRESS=${address}`);
console.log("Authorize this address in AIAgentEngine.setCompletionReporter(reporter, true).");
console.log("Authorize this address in ActivityRegistry.setReporter(reporter, true).");
