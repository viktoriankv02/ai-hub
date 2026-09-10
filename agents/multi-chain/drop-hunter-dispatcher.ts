import type { DropHunterCycleResult } from "../drop-hunter/engine.js";
import type { PlannedAction } from "../drop-hunter/action-planner.js";
import type { ChainConfig } from "../../config/chains.js";
import type { ChainSelectionPreferences, ChainSelectionResult } from "./chain-selector.js";
import { UniversalActionRouter } from "./router.js";
import {
  plannedActionToUniversalKind,
  toUniversalDropHunterAction,
} from "./drop-hunter-action.js";
import type { ChainExecutionContext, UniversalExecutionResult } from "./types.js";

export interface DropHunterChainSelector {
  select(
    actionKind: ReturnType<typeof plannedActionToUniversalKind>,
    preferences?: ChainSelectionPreferences,
  ): Promise<ChainSelectionResult>;
}

export interface DropHunterDispatchOptions {
  chainKey?: string;
  selection?: ChainSelectionPreferences;
  context?: Partial<Omit<ChainExecutionContext, "chainKey" | "timestamp">>;
}

export class DropHunterUniversalDispatcher {
  constructor(
    private readonly router: UniversalActionRouter,
    private readonly chains: readonly ChainConfig[],
    private readonly selector?: DropHunterChainSelector,
  ) {}

  async dispatch(
    cycle: DropHunterCycleResult,
    action: PlannedAction,
    options: DropHunterDispatchOptions = {},
  ): Promise<UniversalExecutionResult> {
    const chainKey = await this.resolveChainKey(cycle, action, options);
    if (typeof chainKey !== "string") return chainKey;

    const universalAction = toUniversalDropHunterAction(
      cycle.opportunity,
      action,
      this.chains,
      chainKey,
    );

    return this.router.execute(universalAction, options.context);
  }

  async dispatchAll(
    cycle: DropHunterCycleResult,
    actions: readonly PlannedAction[] = cycle.actions,
    options: DropHunterDispatchOptions = {},
  ): Promise<UniversalExecutionResult[]> {
    const results: UniversalExecutionResult[] = [];
    for (const action of actions) {
      results.push(await this.dispatch(cycle, action, options));
    }
    return results;
  }

  private async resolveChainKey(
    cycle: DropHunterCycleResult,
    action: PlannedAction,
    options: DropHunterDispatchOptions,
  ): Promise<string | UniversalExecutionResult> {
    if (options.chainKey) return options.chainKey;

    if (cycle.opportunity.chainId !== undefined) {
      const configured = this.chains.find((chain) => chain.chainId === cycle.opportunity.chainId);
      if (!configured) {
        return this.selectionFailure(
          cycle,
          action,
          `no configured chain matches chainId ${cycle.opportunity.chainId}`,
        );
      }
      return configured.key;
    }

    if (!this.selector) {
      return this.selectionFailure(
        cycle,
        action,
        `opportunity ${cycle.opportunity.id} does not define a chainId and no chain selector is configured`,
      );
    }

    const actionKind = plannedActionToUniversalKind(action);
    const selection = await this.selector.select(actionKind, {
      ...options.selection,
      requireWallet: options.selection?.requireWallet ?? action.requiresWallet,
      requireGas: options.selection?.requireGas ?? action.requiresGas,
    });

    if (!selection.selected) {
      return this.selectionFailure(
        cycle,
        action,
        `no executable chain candidate for ${actionKind}`,
      );
    }

    return selection.selected.chainKey;
  }

  private selectionFailure(
    cycle: DropHunterCycleResult,
    action: PlannedAction,
    note: string,
  ): UniversalExecutionResult {
    return {
      status: "failed",
      actionId: `drop-hunter:${cycle.opportunity.id}:${action.id}`,
      chainKey: "unresolved",
      timestamp: new Date().toISOString(),
      note,
    };
  }
}
