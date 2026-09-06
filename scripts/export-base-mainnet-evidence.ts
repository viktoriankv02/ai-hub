import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadDeployment, validateDeploymentRecord } from "../deploy/utils/deployment";
import { EVM_NETWORKS } from "../deploy/config/networks";

const target = "base";
const config = EVM_NETWORKS[target];
const deployment = await loadDeployment(target);
validateDeploymentRecord(deployment, target, config.chainId);

const required = [
  "PointsModule",
  "RewardPolicyEngine",
  "EligibilityEngine",
  "ActivityRegistry",
  "VerifierRegistry",
  "ChainRegistry",
  "ActivityReporter",
  "RewardVault",
  "ClaimRouter",
  "EVMChainAdapter",
] as const;

const contracts = required.map((name) => ({
  name,
  address: deployment.contracts[name],
  explorer: `https://basescan.org/address/${deployment.contracts[name]}`,
}));

const output = [
  "# AI Hub — Base Mainnet Deployment Evidence",
  "",
  `- Network: ${config.name}`,
  `- Chain ID: ${config.chainId}`,
  `- Deployer: ${process.env.AI_HUB_ADMIN_ADDRESS ?? "configured deployer"}`,
  `- Deployment timestamp: ${deployment.deployedAt}`,
  `- Contract count: ${contracts.length}`,
  `- Explorer: https://basescan.org`,
  "",
  "## Contracts",
  "",
  ...contracts.flatMap(({ name, address, explorer }) => [
    `### ${name}`,
    `- Address: ${address}`,
    `- Explorer: ${explorer}`,
    "",
  ]),
  "## Verification command",
  "",
  "```powershell",
  `$env:AI_HUB_NETWORK="base"`,
  "npm run deployment:verify-base",
  "npm run deployment:evidence",
  "```",
  "",
  "Generated from deployments/base.json by scripts/export-base-mainnet-evidence.ts.",
  "",
].join("\n");

const outputPath = resolve(process.cwd(), "reports", "base-mainnet-deployment.md");
await mkdir(resolve(process.cwd(), "reports"), { recursive: true });
await writeFile(outputPath, output, "utf8");
console.log(`Wrote Base Mainnet evidence report: ${outputPath}`);
