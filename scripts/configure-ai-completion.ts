import { network } from "hardhat";

const engineAddress = process.env.AI_AGENT_ENGINE_ADDRESS;
const reporterAddress = process.env.AI_COMPLETION_REPORTER_ADDRESS;
const callerAddress = process.env.AI_COMPLETION_CALLER_ADDRESS;

if (!engineAddress) throw new Error("AI_AGENT_ENGINE_ADDRESS is required");
if (!reporterAddress) throw new Error("AI_COMPLETION_REPORTER_ADDRESS is required");
if (!callerAddress) throw new Error("AI_COMPLETION_CALLER_ADDRESS is required");

const { ethers } = await network.connect();
const engine = await ethers.getContractAt("AIAgentEngine", engineAddress);
const reporter = await ethers.getContractAt("AICompletionReporter", reporterAddress);

await (await engine.setCompletionReporter(reporterAddress, true)).wait();
await (await reporter.setCompletionCaller(callerAddress, true)).wait();

console.log("AI completion authorization configured");
console.log(`engine=${engineAddress}`);
console.log(`reporter=${reporterAddress}`);
console.log(`caller=${callerAddress}`);
