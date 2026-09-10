import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { assertAddress, loadDeployment, validateDeploymentRecord } from "./utils/deployment";

const target = requireEnv("AI_HUB_NETWORK");
validateDeploymentEnvironment(target);
if (target !== "base") throw new Error(`AI agent diagnostic is Base Mainnet-only; got ${target}`);

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const chainId = Number((await ethers.provider.getNetwork()).chainId);
if (chainId !== config.chainId) throw new Error(`Network mismatch: connected ${chainId}, expected ${config.chainId}`);

const deployment = await loadDeployment(target);
validateDeploymentRecord(deployment, target, config.chainId);

const runtimeAddress = assertAddress("AIAgentRuntime", deployment.contracts.AIAgentRuntime);
const [signer] = await ethers.getSigners();
const admin = await signer.getAddress();
const runtime = await ethers.getContractAt("AIAgentRuntime", runtimeAddress);

const runtimeOwner = await runtime.owner();
const nextAgentId = await runtime.nextAgentId();
const ownerAgents = await runtime.ownerAgents(admin);
const code = await ethers.provider.getCode(runtimeAddress);

console.log("");
console.log("Base Mainnet AI agent diagnostic (READ-ONLY)");
console.log(`Runtime:       ${runtimeAddress}`);
console.log(`Runtime code:  ${code === "0x" ? "MISSING" : "PRESENT"}`);
console.log(`Signer/admin:  ${admin}`);
console.log(`Runtime owner: ${runtimeOwner}`);
console.log(`Owner match:   ${runtimeOwner.toLowerCase() === admin.toLowerCase()}`);
console.log(`nextAgentId:   ${nextAgentId.toString()}`);
console.log(`Owned agents:  ${ownerAgents.length ? ownerAgents.map((id: bigint) => id.toString()).join(", ") : "none"}`);

for (const id of ownerAgents) {
  const exists = await runtime.agentExists(id);
  console.log("");
  console.log(`Agent ${id.toString()}: exists=${exists}`);
  if (!exists) continue;
  const agent = await runtime.getAgent(id);
  console.log(`  owner:       ${agent.owner}`);
  console.log(`  ownerMatch:  ${agent.owner.toLowerCase() === admin.toLowerCase()}`);
  console.log(`  verified:    ${agent.verified}`);
  console.log(`  status:      ${agent.status.toString()} (${["Inactive", "Running", "Paused", "Stopped", "Slashed"][Number(agent.status)] ?? "Unknown"})`);
  console.log(`  canExecute:  ${await runtime.canExecute(id)}`);
  console.log(`  name:        ${agent.name}`);
}

console.log("");
console.log("No state-changing transactions were sent.");
