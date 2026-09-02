import { ethers } from "ethers";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type DeploymentRecord = {
  network: string;
  chainId: number;
  deployedAt: string;
  contracts: Record<string, string>;
};

function deploymentPath(network: string): string {
  return resolve(process.cwd(), "deployments", `${network}.json`);
}

export async function saveDeployment(record: DeploymentRecord): Promise<void> {
  const path = deploymentPath(record.network);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(record, null, 2) + "\n", "utf8");
}

export async function loadDeployment(network: string): Promise<DeploymentRecord> {
  const data = await readFile(deploymentPath(network), "utf8");
  return JSON.parse(data) as DeploymentRecord;
}

export async function loadDeploymentIfExists(network: string): Promise<DeploymentRecord | undefined> {
  try {
    return await loadDeployment(network);
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

export function assertAddress(name: string, address: string): string {
  if (!ethers.isAddress(address)) throw new Error(`Invalid ${name} address: ${address}`);
  return ethers.getAddress(address);
}

export function validateDeploymentRecord(record: DeploymentRecord, network: string, chainId: number): void {
  if (record.network !== network) {
    throw new Error(`Deployment record network mismatch: ${record.network} != ${network}`);
  }
  if (record.chainId !== chainId) {
    throw new Error(`Deployment record chain mismatch: ${record.chainId} != ${chainId}`);
  }
  for (const [name, address] of Object.entries(record.contracts)) assertAddress(name, address);
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}
