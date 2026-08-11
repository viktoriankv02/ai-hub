import type { ExecutionRisk, UserExecutionProfile } from "./action-planner.js";
export type ExecutionStatus = "success" | "failed" | "skipped";
export interface ExecutionEvent { actionId:string; status:ExecutionStatus; timestamp:string; risk:ExecutionRisk; chainId?:number; txHash?:string; note?:string; }
export interface LearnedExecutionProfile extends UserExecutionProfile { successfulActionIds:string[]; failedActionIds:string[]; skippedActionIds:string[]; successRate:number; observations:number; }
function unique(values:string[]):string[]{return [...new Set(values)];}
export function learnExecutionProfile(events:ExecutionEvent[]):LearnedExecutionProfile{const successful=unique(events.filter(e=>e.status==="success").map(e=>e.actionId));const failed=unique(events.filter(e=>e.status==="failed").map(e=>e.actionId));const skipped=unique(events.filter(e=>e.status==="skipped").map(e=>e.actionId));const observations=events.length;const successfulObservations=events.filter(e=>e.status==="success").length;return{completedActionIds:successful,successfulActionIds:successful,failedActionIds:failed,skippedActionIds:skipped,successRate:observations===0?0:successfulObservations/observations,observations};}
export function recordExecution(events:ExecutionEvent[],event:ExecutionEvent):ExecutionEvent[]{return[...events,{...event}];}
export function latestExecution(events:ExecutionEvent[],actionId:string):ExecutionEvent|undefined{return[...events].reverse().find(e=>e.actionId===actionId);}
