import type { ChainConfig } from "../../config/chains.js";
import type { UniversalAction, UniversalActionKind } from "./types.js";

export interface ChainCapabilityProfile {
  chainKey: string;
  actionKinds: ReadonlySet<UniversalActionKind>;
  notes?: string;
}

export interface ChainCapabilityCheck {
  supported: boolean;
  chainKey: string;
  actionKind: UniversalActionKind;
  note?: string;
}

const BASELINE_EVM_ACTIONS: readonly UniversalActionKind[] = [
  "deploy-contract",
  "verify-contract",
  "custom",
];

export class ChainCapabilityRegistry {
  private readonly profiles = new Map<string, ChainCapabilityProfile>();

  constructor(private readonly chains: readonly ChainConfig[]) {}

  register(profile: ChainCapabilityProfile): void {
    if (!profile.chainKey.trim()) throw new Error("chain capability key cannot be empty");
    if (!this.chains.some((chain) => chain.key === profile.chainKey)) {
      throw new Error(`cannot register capabilities for unknown chain: ${profile.chainKey}`);
    }
    if (this.profiles.has(profile.chainKey)) {
      throw new Error(`chain capabilities already registered: ${profile.chainKey}`);
    }

    this.profiles.set(profile.chainKey, {
      ...profile,
      actionKinds: new Set(profile.actionKinds),
    });
  }

  replace(profile: ChainCapabilityProfile): void {
    if (!this.chains.some((chain) => chain.key === profile.chainKey)) {
      throw new Error(`cannot replace capabilities for unknown chain: ${profile.chainKey}`);
    }

    this.profiles.set(profile.chainKey, {
      ...profile,
      actionKinds: new Set(profile.actionKinds),
    });
  }

  unregister(chainKey: string): boolean {
    return this.profiles.delete(chainKey);
  }

  get(chainKey: string): ChainCapabilityProfile | undefined {
    const profile = this.profiles.get(chainKey);
    if (!profile) return undefined;
    return { ...profile, actionKinds: new Set(profile.actionKinds) };
  }

  list(): ChainCapabilityProfile[] {
    return [...this.profiles.values()].map((profile) => ({
      ...profile,
      actionKinds: new Set(profile.actionKinds),
    }));
  }

  supports(chainKey: string, actionKind: UniversalActionKind): boolean {
    return this.profiles.get(chainKey)?.actionKinds.has(actionKind) ?? false;
  }

  check(action: UniversalAction): ChainCapabilityCheck {
    const chain = this.chains.find((candidate) => candidate.key === action.chainKey);
    if (!chain) {
      return {
        supported: false,
        chainKey: action.chainKey,
        actionKind: action.kind,
        note: `unknown chain: ${action.chainKey}`,
      };
    }

    const profile = this.profiles.get(chain.key);
    if (!profile) {
      return {
        supported: false,
        chainKey: chain.key,
        actionKind: action.kind,
        note: `no capability profile registered for ${chain.key}`,
      };
    }

    if (!profile.actionKinds.has(action.kind)) {
      return {
        supported: false,
        chainKey: chain.key,
        actionKind: action.kind,
        note: `action ${action.kind} is not enabled for ${chain.key}`,
      };
    }

    return {
      supported: true,
      chainKey: chain.key,
      actionKind: action.kind,
      note: profile.notes,
    };
  }
}

export function createBaselineChainCapabilityRegistry(
  chains: readonly ChainConfig[],
): ChainCapabilityRegistry {
  const registry = new ChainCapabilityRegistry(chains);

  for (const chain of chains) {
    if (chain.kind !== "evm") continue;
    registry.register({
      chainKey: chain.key,
      actionKinds: new Set(BASELINE_EVM_ACTIONS),
      notes: "baseline EVM capabilities only; protocol-specific actions require explicit enablement",
    });
  }

  return registry;
}
