import { EVM_NETWORKS } from "./networks";

export function validateNetwork(key: string): void {
  const network = EVM_NETWORKS[key];
  if (!network) throw new Error(`Unsupported AI Hub network: ${key}`);
  if (!network.testnet && process.env.AI_HUB_ALLOW_MAINNET_DEPLOYMENT !== "true") {
    throw new Error(
      `Refusing non-testnet deployment: ${network.name}. Set AI_HUB_ALLOW_MAINNET_DEPLOYMENT=true for an explicit mainnet deployment.`,
    );
  }
}

export function validateDeploymentEnvironment(key: string): void {
  validateNetwork(key);
  const network = EVM_NETWORKS[key];
  if (!process.env[network.rpcEnv]) throw new Error(`Missing RPC variable: ${network.rpcEnv}`);
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("Missing DEPLOYER_PRIVATE_KEY");
  if (!process.env.AI_HUB_ADMIN_ADDRESS) throw new Error("Missing AI_HUB_ADMIN_ADDRESS");

  if (key === "base" && process.env.AI_HUB_ALLOW_MAINNET_DEPLOYMENT !== "true") {
    throw new Error("Base Mainnet deployment requires AI_HUB_ALLOW_MAINNET_DEPLOYMENT=true");
  }
}
