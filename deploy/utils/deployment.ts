import { ethers } from "ethers";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type DeploymentRecord = {
  network: string;
  chainId: number;
  deployedAt: string;
  contracts: Record<string, string>;
};

export async function saveDeployment(record: DeploymentRecord): Promise<void> {
  const path = resolve(process.cwd(), "deployments", `${record.network}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(record, null, 2) + "\n", "utf8");
}

export async function loadDeployment(network: string): Promise<DeploymentRecord> {
  const path = resolve(process.cwd(), "deployments", `${network}.json`);
  const data = await readFile(path, "utf8");
  return JSON.parse(data) as DeploymentRecord;
}

export function assertAddress(name: string, address: string): string {
  if (!ethers.isAddress(address)) throw new Error(`Invalid ${name} address: ${address}`);
  return ethers.getAddress(address);
}
