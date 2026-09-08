import type { DropHunterCycleResult } from "../drop-hunter/engine.js";
import type { PlannedAction } from "../drop-hunter/action-planner.js";
import type { ChainConfig } from "../../config/chains.js";
import { UniversalActionRouter } from "./router.js";
import { toUniversalDropHunterAction } from "./drop-hunter-action.js";
import type { ChainExecutionContext, UniversalExecutionResult } from "./types.js";

export interface DropHunterDispatchOptions {
  chainKey?: string;
  context?: Partial<Omit<ChainExecutionContext, "chainKey" | "timestamp">>;
}

export class DropHunterUniversalDispatcher {
  constructor(
    private readonly router: UniversalActionRouter,
    private readonly chains: readonly ChainConfig[],
  ) {}

  async dispatch(
    cycle: DropHunterCycleResult,
    action: PlannedAction,
    options: DropHunterDispatchOptions = {},
  ): Promise<UniversalExecutionResult> {
    const universalAction = toUniversalDropHunterAction(
      cycle.opportunity,
      action,
      this.chains,
      options.chainKey,
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
}
