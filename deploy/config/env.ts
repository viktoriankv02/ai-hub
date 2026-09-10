import "dotenv/config";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export function deployerPrivateKey(): string {
  const key = requireEnv("DEPLOYER_PRIVATE_KEY").trim();
  if (/^[0-9a-fA-F]{64}$/.test(key)) return `0x${key}`;
  if (/^0x[0-9a-fA-F]{64}$/.test(key)) return key;
  throw new Error("DEPLOYER_PRIVATE_KEY must be 64 hex characters, with or without the 0x prefix");
}

export function adminAddress(): string | undefined {
  return optionalEnv("AI_HUB_ADMIN_ADDRESS");
}
