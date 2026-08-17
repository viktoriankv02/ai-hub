import { EVM_NETWORKS } from "./networks";

export function validateNetwork(key: string, allowMainnet = false): void {
  const network = EVM_NETWORKS[key];
  if (!network) throw new Error(`Unsupported AI Hub network: ${key}`);
  if (!allowMainnet && !network.testnet) throw new Error(`Refusing non-testnet deployment: ${network.name}`);
}

export function validateDeploymentEnvironment(key: string, options: { allowMainnet?: boolean } = {}): void {
  validateNetwork(key, options.allowMainnet === true);
  const network = EVM_NETWORKS[key];
  if (!process.env[network.rpcEnv]) throw new Error(`Missing RPC variable: ${network.rpcEnv}`);
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("Missing DEPLOYER_PRIVATE_KEY");
  if (!process.env.AI_HUB_ADMIN_ADDRESS) throw new Error("Missing AI_HUB_ADMIN_ADDRESS");

  if (!network.testnet && process.env.AI_HUB_MAINNET_DEPLOY_CONFIRM !== "DEPLOY") {
    throw new Error("Mainnet deployment requires AI_HUB_MAINNET_DEPLOY_CONFIRM=DEPLOY");
  }
}
