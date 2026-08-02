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
  return requireEnv("DEPLOYER_PRIVATE_KEY");
}

export function adminAddress(): string {
  return requireEnv("AI_HUB_ADMIN_ADDRESS");
}
