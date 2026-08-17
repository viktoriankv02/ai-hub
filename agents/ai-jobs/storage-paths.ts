import { isAbsolute, join, resolve } from "node:path";
import { platform } from "node:os";

/**
 * Local durable-state policy.
 *
 * Windows development machines can keep large/changing AI job state on D:
 * by default, avoiding pressure on the system drive. CI/Linux keeps the
 * repository-local ./data default unless AI_HUB_DATA_DIR is explicitly set.
 */
export function aiHubDataDir(): string {
  const configured = process.env.AI_HUB_DATA_DIR?.trim();
  if (configured) return resolve(configured);
  if (platform() === "win32") return "D:\\ai-hub-data";
  return resolve("./data");
}

export function aiHubDataPath(fileName: string): string {
  if (!fileName.trim()) throw new Error("fileName is required");
  return join(aiHubDataDir(), fileName);
}

export function configuredPath(envName: string, fileName: string): string {
  const configured = process.env[envName]?.trim();
  if (!configured) return aiHubDataPath(fileName);
  return isAbsolute(configured) ? configured : resolve(configured);
}
