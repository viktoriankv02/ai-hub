import type { ChainConfig } from "../../config/chains.js";
import type { ChainCapabilityProfile, ChainCapabilityRegistry } from "./chain-capabilities.js";
import type { ChainHealthResult, ChainHealthService } from "./chain-health.js";
import type { MultiChainExecutionAdapter, UniversalActionKind } from "./types.js";

export interface ChainRuntimeWalletState {
  connected: boolean;
  address?: string;
  gasAvailable?: boolean;
}

export interface ChainRuntimeSnapshot {
  chain: ChainConfig;
  health?: ChainHealthResult;
  capabilities?: ChainCapabilityProfile;
  adapterIds: string[];
  wallet: ChainRuntimeWalletState;
  ready: boolean;
  executable: boolean;
  blockers: string[];
}

export interface MultiChainRuntimeRegistryOptions {
  healthService?: ChainHealthService;
  capabilityRegistry?: ChainCapabilityRegistry;
}

function cloneChain(chain: ChainConfig): ChainConfig {
  return { ...chain };
}

function cloneCapabilities(profile?: ChainCapabilityProfile): ChainCapabilityProfile | undefined {
  if (!profile) return undefined;
  return { ...profile, actionKinds: new Set(profile.actionKinds) };
}

export class MultiChainRuntimeRegistry {
  private readonly adapters = new Map<string, MultiChainExecutionAdapter>();
  private readonly wallets = new Map<string, ChainRuntimeWalletState>();

  constructor(
    private readonly chains: readonly ChainConfig[],
    private readonly options: MultiChainRuntimeRegistryOptions = {},
  ) {}

  registerAdapter(adapter: MultiChainExecutionAdapter): void {
    if (!adapter.id.trim()) throw new Error("runtime adapter id cannot be empty");
    if (this.adapters.has(adapter.id)) throw new Error(`runtime adapter already registered: ${adapter.id}`);

    for (const chainKey of adapter.chainKeys) {
      if (!this.getChain(chainKey)) throw new Error(`runtime adapter ${adapter.id} references unknown chain: ${chainKey}`);
    }

    this.adapters.set(adapter.id, adapter);
  }

  unregisterAdapter(adapterId: string): boolean {
    return this.adapters.delete(adapterId);
  }

  setWalletState(chainKey: string, state: ChainRuntimeWalletState): void {
    if (!this.getChain(chainKey)) throw new Error(`unknown chain: ${chainKey}`);
    if (!state.connected && state.address) throw new Error("disconnected wallet cannot expose an address");
    if (state.connected && state.address !== undefined && !state.address.trim()) {
      throw new Error("connected wallet address cannot be empty");
    }

    this.wallets.set(chainKey, { ...state, address: state.address?.trim() });
  }

  clearWalletState(chainKey: string): boolean {
    return this.wallets.delete(chainKey);
  }

  walletState(chainKey: string): ChainRuntimeWalletState {
    return { ...(this.wallets.get(chainKey) ?? { connected: false }) };
  }

  getChain(chainKey: string): ChainConfig | undefined {
    return this.chains.find((chain) => chain.key === chainKey);
  }

  adapterIds(chainKey: string): string[] {
    return [...this.adapters.values()]
      .filter((adapter) => adapter.chainKeys.has(chainKey))
      .map((adapter) => adapter.id)
      .sort();
  }

  supports(chainKey: string, actionKind: UniversalActionKind): boolean {
    return this.options.capabilityRegistry?.supports(chainKey, actionKind) ?? false;
  }

  async snapshot(chainKey: string): Promise<ChainRuntimeSnapshot> {
    const chain = this.getChain(chainKey);
    if (!chain) throw new Error(`unknown chain: ${chainKey}`);

    const health = this.options.healthService ? await this.options.healthService.check(chainKey) : undefined;
    const capabilities = cloneCapabilities(this.options.capabilityRegistry?.get(chainKey));
    const adapterIds = this.adapterIds(chainKey);
    const wallet = this.walletState(chainKey);
    const blockers: string[] = [];

    if (!chain.enabled) blockers.push("chain-disabled");
    if (health && health.status !== "ready") blockers.push(`health:${health.status}`);
    if (this.options.healthService && !health) blockers.push("health-unavailable");
    if (this.options.capabilityRegistry && !capabilities) blockers.push("capabilities-unavailable");
    if (adapterIds.length === 0) blockers.push("execution-adapter-unavailable");

    const ready = chain.enabled && (!health || health.status === "ready");
    const executable = ready && adapterIds.length > 0 && blockers.length === 0;

    return {
      chain: cloneChain(chain),
      health,
      capabilities,
      adapterIds,
      wallet,
      ready,
      executable,
      blockers,
    };
  }

  async snapshots(): Promise<ChainRuntimeSnapshot[]> {
    return Promise.all(this.chains.map((chain) => this.snapshot(chain.key)));
  }

  async candidates(actionKind: UniversalActionKind): Promise<ChainRuntimeSnapshot[]> {
    const snapshots = await this.snapshots();
    return snapshots.filter((snapshot) =>
      snapshot.executable &&
      (this.options.capabilityRegistry ? snapshot.capabilities?.actionKinds.has(actionKind) === true : true),
    );
  }
}
