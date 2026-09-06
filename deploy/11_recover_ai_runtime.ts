import { JsonRpcProvider } from "ethers";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { assertAddress, loadDeployment, saveDeployment, validateDeploymentRecord } from "./utils/deployment";

const target = requireEnv("AI_HUB_NETWORK");
validateDeploymentEnvironment(target);
if (target !== "base") {
  throw new Error(`AI Hub AI runtime recovery is Base Mainnet-only; got ${target}`);
}

const config = EVM_NETWORKS[target];
const txHash = requireEnv("AI_HUB_RECOVERY_TX");
const rpcUrl = process.env.BASE_VERIFICATION_RPC_URL?.trim() || "https://base.drpc.org";
const provider = new JsonRpcProvider(rpcUrl, config.chainId, { staticNetwork: true });

const deployment = await loadDeployment(target);
validateDeploymentRecord(deployment, target, config.chainId);

const receipt = await provider.getTransactionReceipt(txHash);
if (!receipt) throw new Error(`Recovery transaction not found yet: ${txHash}`);
if (receipt.status !== 1) throw new Error(`Recovery transaction reverted: ${txHash}`);
if (!receipt.contractAddress) throw new Error(`Recovery transaction is not a contract creation: ${txHash}`);

const address = assertAddress("AIAgentRuntime", receipt.contractAddress);
const code = await provider.getCode(address);
if (code === "0x") throw new Error(`No runtime bytecode visible at ${address} via ${rpcUrl}`);

const runtime = {
  address,
  transactionHash: txHash,
  blockNumber: receipt.blockNumber,
  gasUsed: receipt.gasUsed.toString(),
};

deployment.contracts.AIAgentRuntime = address;
await saveDeployment({ ...deployment, deployedAt: new Date().toISOString() });

console.log("AIAgentRuntime recovery succeeded.");
console.log(`Address:       ${runtime.address}`);
console.log(`Deployment tx: ${runtime.transactionHash}`);
console.log(`Block:         ${runtime.blockNumber}`);
console.log(`Gas used:      ${runtime.gasUsed}`);
console.log(`RPC:           ${rpcUrl}`);
console.log(`Manifest:      deployments/${target}.json`);
