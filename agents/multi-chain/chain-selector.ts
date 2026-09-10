import type { UniversalActionKind } from "./types.js";
import type { ChainRuntimeSnapshot, MultiChainRuntimeRegistry } from "./runtime-registry.js";

export interface ChainSelectionPreferences {
  preferredChainKeys?: readonly string[];
  requireWallet?: boolean;
  requireGas?: boolean;
  preferConnectedWallet?: boolean;
  preferGasAvailable?: boolean;
}

export interface ChainSelectionScore {
  chainKey: string;
  score: number;
  reasons: string[];
  snapshot: ChainRuntimeSnapshot;
}

export interface ChainSelectionResult {
  actionKind: UniversalActionKind;
  selected?: ChainSelectionScore;
  ranked: ChainSelectionScore[];
}

function preferenceRank(chainKey: string, preferred: readonly string[] | undefined): number | undefined {
  if (!preferred) return undefined;
  const index = preferred.indexOf(chainKey);
  return index === -1 ? undefined : index;
}

export class ChainSelector {
  constructor(private readonly runtime: MultiChainRuntimeRegistry) {}

  async rank(
    actionKind: UniversalActionKind,
    preferences: ChainSelectionPreferences = {},
  ): Promise<ChainSelectionScore[]> {
    const candidates = await this.runtime.candidates(actionKind);

    return candidates
      .filter((snapshot) => !preferences.requireWallet || snapshot.wallet.connected)
      .filter((snapshot) => !preferences.requireGas || snapshot.wallet.gasAvailable === true)
      .map((snapshot) => this.score(snapshot, preferences))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.chainKey.localeCompare(b.chainKey);
      });
  }

  async select(
    actionKind: UniversalActionKind,
    preferences: ChainSelectionPreferences = {},
  ): Promise<ChainSelectionResult> {
    const ranked = await this.rank(actionKind, preferences);
    return { actionKind, selected: ranked[0], ranked };
  }

  private score(
    snapshot: ChainRuntimeSnapshot,
    preferences: ChainSelectionPreferences,
  ): ChainSelectionScore {
    let score = 0;
    const reasons: string[] = [];

    if (snapshot.ready) {
      score += 50;
      reasons.push("chain-ready");
    }

    if (snapshot.executable) {
      score += 25;
      reasons.push("execution-adapter-ready");
    }

    if (snapshot.wallet.connected) {
      score += preferences.preferConnectedWallet === false ? 0 : 10;
      reasons.push("wallet-connected");
    }

    if (snapshot.wallet.gasAvailable === true) {
      score += preferences.preferGasAvailable === false ? 0 : 10;
      reasons.push("gas-available");
    }

    const preferredRank = preferenceRank(snapshot.chain.key, preferences.preferredChainKeys);
    if (preferredRank !== undefined) {
      const bonus = Math.max(1, 20 - preferredRank * 5);
      score += bonus;
      reasons.push(`preferred-chain:${preferredRank + 1}`);
    }

    if (snapshot.health?.blockNumber !== undefined) {
      score += 2;
      reasons.push("rpc-block-height-available");
    }

    if (snapshot.adapterIds.length > 1) {
      score += Math.min(3, snapshot.adapterIds.length - 1);
      reasons.push("multiple-adapters");
    }

    return {
      chainKey: snapshot.chain.key,
      score,
      reasons,
      snapshot,
    };
  }
}
