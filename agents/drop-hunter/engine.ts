import type { ProjectOpportunity, ScoredOpportunity } from "./types.js";
import { planOpportunity, type PlannedAction, type UserExecutionProfile } from "./action-planner.js";
import { recordExecutionEvent, type ExecutionEvent } from "./execution-memory.js";
import { recordEvidence, type EvidenceRecord } from "./evidence-engine.js";
import { observeOpportunity, type OpportunityObservation } from "./opportunity-monitor.js";

export interface DropHunterEngineState {
  opportunity: ScoredOpportunity;
  observations: OpportunityObservation[];
  executionEvents: ExecutionEvent[];
  evidence: EvidenceRecord[];
  actions: PlannedAction[];
}

export interface EngineExecutionResult {
  state: DropHunterEngineState;
  event: ExecutionEvent;
  evidence?: EvidenceRecord;
}

export interface EngineObservationInput {
  observedAt: number;
  rewardConfirmed?: boolean;
  rewardEvidence?: string;
  confidence?: number;
  notes?: string;
}

export function createEngineState(
  opportunity: ScoredOpportunity,
  profile: UserExecutionProfile = {},
): DropHunterEngineState {
  return {
    opportunity,
    observations: [],
    executionEvents: [],
    evidence: [],
    actions: planOpportunity(opportunity, profile),
  };
}

export function observeEngine(
  state: DropHunterEngineState,
  input: EngineObservationInput,
): DropHunterEngineState {
  const result = observeOpportunity(state.opportunity, input);
  return {
    ...state,
    opportunity: result.opportunity,
    observations: [...state.observations, result.observation],
  };
}

export function refreshPlan(
  state: DropHunterEngineState,
  profile: UserExecutionProfile = {},
): DropHunterEngineState {
  return { ...state, actions: planOpportunity(state.opportunity, profile) };
}

export function executeAction(
  state: DropHunterEngineState,
  actionId: string,
  outcome: ExecutionEvent["outcome"],
  executedAt: number,
): EngineExecutionResult {
  const event = recordExecutionEvent({ actionId, outcome, executedAt });
  const executionEvents = [...state.executionEvents, event];
  const actions = state.actions.map((action) =>
    action.id === actionId && outcome === "success"
      ? { ...action, completed: true }
      : action,
  );

  return {
    state: { ...state, executionEvents, actions },
    event,
  };
}

export function applyOnChainEvidence(
  state: DropHunterEngineState,
  actionId: string,
  verified: boolean,
  recordedAt: number,
  txHash?: string,
): DropHunterEngineState {
  const evidence = recordEvidence({
    actionId,
    status: verified ? "on-chain-proof" : "unverified",
    verified,
    recordedAt,
    txHash,
  });
  return { ...state, evidence: [...state.evidence, evidence] };
}

export function runObservation(
  opportunity: ScoredOpportunity | ProjectOpportunity,
  input: EngineObservationInput,
  profile: UserExecutionProfile = {},
): DropHunterEngineState {
  const scored = "score" in opportunity
    ? opportunity
    : ({ ...opportunity, score: 0 } as ScoredOpportunity);
  return refreshPlan(observeEngine(createEngineState(scored, profile), input), profile);
}
