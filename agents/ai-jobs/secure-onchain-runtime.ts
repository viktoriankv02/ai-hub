import { JsonRpcProvider, Wallet } from "ethers";
import { resolve } from "node:path";
import { EVMCompletionSink } from "./evm-completion-sink.js";
import { JsonOnchainJobBindingStore } from "./onchain-job-bindings.js";
import { OnchainJobProvisioner } from "./onchain-job-provisioner.js";
import { OnchainRewardSettler } from "./onchain-reward-settler.js";
import { SecureOnchainCompletionCoordinator } from "./secure-onchain-completion.js";
import type { CompletionPolicyOptions } from "./completion-policy.js";

export interface SecureEVMOnchainRuntimeOptions {
  rpcUrl: string;
  privateKey: string;
  assignmentPrivateKey?: string;
  payoutPrivateKey?: string;
  engineAddress: string;
  rewardTokenAddress: string;
  completionReporterAddress: string;
  bindingStorePath?: string;
  completionStorePath?: string;
  autoAssign?: boolean;
  autoSettleReward?: boolean;
  activityType?: string;
  projectId?: string;
  metadataHash?: string;
  agentIdMap?: Record<string, string>;
  completionPolicy?: CompletionPolicyOptions;
}

export interface SecureEVMOnchainRuntime {
  provider: JsonRpcProvider;
  signer: Wallet;
  assignmentSigner: Wallet;
  payoutSigner: Wallet;
  provisioner: OnchainJobProvisioner;
  coordinator: SecureOnchainCompletionCoordinator;
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

/**
 * Secure variant of createEVMOnchainRuntime. It performs local completion
 * policy validation before the completion sink spends gas and only persists a
 * successful publication.
 */
export function createSecureEVMOnchainRuntime(
  options: SecureEVMOnchainRuntimeOptions,
): SecureEVMOnchainRuntime {
  const provider = new JsonRpcProvider(required(options.rpcUrl, "rpcUrl"));
  const fundingPrivateKey = required(options.privateKey, "privateKey");
  const signer = new Wallet(fundingPrivateKey, provider);
  const assignmentSigner = new Wallet(options.assignmentPrivateKey?.trim() || fundingPrivateKey, provider);
  const payoutSigner = new Wallet(options.payoutPrivateKey?.trim() || fundingPrivateKey, provider);
  const engineAddress = required(options.engineAddress, "engineAddress");
  const rewardTokenAddress = required(options.rewardTokenAddress, "rewardTokenAddress");
  const completionReporterAddress = required(options.completionReporterAddress, "completionReporterAddress");
  const agentMap = options.agentIdMap ?? {};

  const bindings = new JsonOnchainJobBindingStore(
    resolve(options.bindingStorePath ?? "./data/onchain-job-bindings.json"),
  );

  const resolveAgentId = async (agentId: string): Promise<bigint> => {
    const mapped = agentMap[agentId] ?? agentId;
    try {
      const value = BigInt(mapped);
      if (value > 0n) return value;
    } catch {}
    throw new Error(`cannot resolve off-chain agentId '${agentId}' to a positive on-chain agent id`);
  };

  const provisioner = new OnchainJobProvisioner({
    signer,
    assignmentSigner,
    engineAddress,
    rewardTokenAddress,
    bindings,
    resolveAgentId,
    autoAssign: options.autoAssign ?? true,
  });

  const sink = new EVMCompletionSink({
    signer,
    reporterAddress: completionReporterAddress,
    activityType: options.activityType ?? "AI_JOB_COMPLETED",
    projectId: options.projectId,
    metadataHash: options.metadataHash,
    resolveOnchainJobId: (offchainJobId) => provisioner.resolveOnchainJobId(offchainJobId),
  });

  const rewardSettler = new OnchainRewardSettler(payoutSigner, engineAddress);
  const completionStorePath = options.completionStorePath
    ?? process.env.AI_JOB_COMPLETION_STORE
    ?? "./data/ai-job-completions.json";

  const coordinator = new SecureOnchainCompletionCoordinator({
    provisioner,
    sink,
    attestationSigner: signer,
    rewardSettler,
    autoSettleReward: options.autoSettleReward ?? false,
    completionStorePath: resolve(completionStorePath),
    completionPolicy: options.completionPolicy,
  });

  return { provider, signer, assignmentSigner, payoutSigner, provisioner, coordinator };
}
