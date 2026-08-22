import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EVM_NETWORKS } from "../deploy/config/networks";

const execFileAsync = promisify(execFile);
const npmCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const targets = (process.env.AI_HUB_NETWORKS ?? Object.keys(EVM_NETWORKS).join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

for (const target of targets) {
  const config = EVM_NETWORKS[target];
  if (!config) throw new Error(`Unsupported AI Hub network: ${target}`);
  if (!config.testnet) throw new Error(`Refusing non-testnet deployment: ${config.name}`);
  if (!process.env[config.rpcEnv]) {
    throw new Error(`Missing ${config.rpcEnv} required for ${target}`);
  }
}

if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("Missing DEPLOYER_PRIVATE_KEY");
if (!process.env.AI_HUB_ADMIN_ADDRESS) throw new Error("Missing AI_HUB_ADMIN_ADDRESS");

const steps = [
  "deploy/00_deploy_core.ts",
  "deploy/03_deploy_evm_adapter.ts",
  "deploy/01_configure_core.ts",
  "deploy/02_register_chain.ts",
  "deploy/04_verify_configuration.ts",
];

console.log(`AI Hub testnet deployment targets: ${targets.join(", ")}`);
console.log("Deployment is sequential and stops on the first failure.\n");

for (const target of targets) {
  const config = EVM_NETWORKS[target];
  console.log(`\n=== ${config.name} (${config.chainId}) ===`);

  for (const step of steps) {
    console.log(`\n[${target}] ${step}`);
    const { stdout, stderr } = await execFileAsync(
      npmCommand,
      ["hardhat", "run", step, "--network", target],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AI_HUB_NETWORK: target,
        },
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  }

  console.log(`\n${config.name}: core deployment and verification completed.`);
}

console.log("\nAll requested AI Hub testnets completed successfully.");
