import { ethers } from "ethers";
import { EVM_NETWORKS } from "./networks";

export function validateNetwork(key: string): void {
  const network = EVM_NETWORKS[key];
  if (!network) throw new Error(`Unsupported AI Hub network: ${key}`);

  const explicitBaseMainnet =
    key === "base" && process.env.AI_HUB_ALLOW_MAINNET_DEPLOYMENT === "true";

  if (!network.testnet && !explicitBaseMainnet) {
    throw new Error(
      `Refusing non-testnet deployment: ${network.name}. Base Mainnet requires AI_HUB_ALLOW_MAINNET_DEPLOYMENT=true.`,
    );
  }
}

export function validateDeploymentEnvironment(key: string): void {
  validateNetwork(key);
  const network = EVM_NETWORKS[key];
  if (!process.env[network.rpcEnv]) throw new Error(`Missing RPC variable: ${network.rpcEnv}`);

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim() ?? "";
  if (!privateKey) throw new Error("Missing DEPLOYER_PRIVATE_KEY");
  if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be 64 hex characters, with or without the 0x prefix");
  }

  const configuredAdmin = process.env.AI_HUB_ADMIN_ADDRESS?.trim();
  if (configuredAdmin && ethers.isAddress(configuredAdmin)) {
    // The deployment scripts compare a valid configured admin to the actual signer.
    // An invalid legacy value is tolerated so it cannot block recovery; the signer remains authoritative.
  }

  if (key === "base" && process.env.AI_HUB_ALLOW_MAINNET_DEPLOYMENT !== "true") {
    throw new Error("Base Mainnet deployment requires AI_HUB_ALLOW_MAINNET_DEPLOYMENT=true");
  }
}
