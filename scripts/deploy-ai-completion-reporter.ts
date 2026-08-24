import { network } from "hardhat";
import { EVM_NETWORKS } from "../deploy/config/networks";
import { requireEnv } from "../deploy/config/env";
import { validateDeploymentEnvironment } from "../deploy/config/validate";
import { loadDeployment, saveDeployment } from "../deploy/utils/deployment";

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

const deployment = await loadDeployment(target);
const engineAddress = deployment.contracts.AIAgentEngine;
const activityRegistryAddress = deployment.contracts.ActivityRegistry;

if (!engineAddress) {
  throw new Error(
    `Deployment artifact for ${target} is missing AIAgentEngine. Run deploy/06_deploy_ai_runtime.ts first.`,
  );
}

if (!activityRegistryAddress) {
  throw new Error(
    `Deployment artifact for ${target} is missing ActivityRegistry. Run the core deployment first.`,
  );
}

const engine = await ethers.getContractAt("AIAgentEngine", engineAddress);
const registry = await ethers.getContractAt(
  "ActivityRegistry",
  activityRegistryAddress,
);

let reporterAddress = deployment.contracts.AICompletionReporter;

if (reporterAddress) {
  const reporter = await ethers.getContractAt(
    "AICompletionReporter",
    reporterAddress,
  );

  if ((await reporter.engine()).toLowerCase() !== engineAddress.toLowerCase()) {
    throw new Error("Existing AICompletionReporter engine mismatch");
  }

  if (
    (await reporter.activityRegistry()).toLowerCase() !==
    activityRegistryAddress.toLowerCase()
  ) {
    throw new Error("Existing AICompletionReporter ActivityRegistry mismatch");
  }

  console.log(`Reusing AICompletionReporter: ${reporterAddress}`);
} else {
  const admin = requireEnv("AI_HUB_ADMIN_ADDRESS");
  const reporter = await ethers.deployContract("AICompletionReporter", [
    admin,
    engineAddress,
    activityRegistryAddress,
  ]);
  await reporter.waitForDeployment();
  reporterAddress = await reporter.getAddress();

  await saveDeployment({
    ...deployment,
    deployedAt: new Date().toISOString(),
    contracts: {
      ...deployment.contracts,
      AICompletionReporter: reporterAddress,
    },
  });

  console.log(`AICompletionReporter deployed: ${reporterAddress}`);
}

if (!(await engine.completionReporters(reporterAddress))) {
  await (await engine.setCompletionReporter(reporterAddress, true)).wait();
  console.log("AIAgentEngine completion reporter authorized.");
}

if (!(await registry.reporters(reporterAddress))) {
  await (await registry.setReporter(reporterAddress, true)).wait();
  console.log("ActivityRegistry reporter authorized.");
}

if (!(await engine.completionReporters(reporterAddress))) {
  throw new Error("AICompletionReporter is not authorized in AIAgentEngine");
}

if (!(await registry.reporters(reporterAddress))) {
  throw new Error("AICompletionReporter is not authorized in ActivityRegistry");
}

console.log("");
console.log("AI Completion Reporter deployment verified.");
console.log(`Network: ${config.name} (${config.chainId})`);
console.log(`Reporter: ${reporterAddress}`);
console.log(`Engine: ${engineAddress}`);
console.log(`ActivityRegistry: ${activityRegistryAddress}`);
