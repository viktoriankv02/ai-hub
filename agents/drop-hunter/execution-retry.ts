import type { ExecutionRisk } from "./action-planner.js";
import type { ExecutionEvent } from "./execution-memory.js";
export type RetryReason="transient-network"|"rate-limit"|"temporary-provider"|"unknown-failure"|"not-retryable";
export interface ExecutionRetryPolicy{maxAttempts:number;baseDelayMs:number;maxDelayMs:number;maxRisk:ExecutionRisk;}
export interface RetryDecision{actionId:string;retryable:boolean;attempt:number;delayMs:number;reason:RetryReason;}
const DEFAULT_POLICY={maxAttempts:2,baseDelayMs:1000,maxDelayMs:30000,maxRisk:"low" as ExecutionRisk};
const riskRank=(r:ExecutionRisk)=>r==="low"?0:r==="medium"?1:2;
function classify(note?:string):RetryReason{const v=(note??"").toLowerCase();if(/rate.?limit|too many requests|429/.test(v))return"rate-limit";if(/timeout|timed out|network|connection reset|socket|econn|fetch failed|rpc unavailable/.test(v))return"transient-network";if(/temporar|service unavailable|provider unavailable|503|502|504/.test(v))return"temporary-provider";return"unknown-failure";}
function backoff(attempt:number,p:ExecutionRetryPolicy){return Math.min(p.baseDelayMs*2**Math.max(0,attempt-1),p.maxDelayMs);}
export function planExecutionRetry(event:ExecutionEvent,history:ExecutionEvent[]=[],policy:Partial<ExecutionRetryPolicy>={}):RetryDecision{const effective={...DEFAULT_POLICY,...policy};const attempts=history.filter(i=>i.actionId===event.actionId).length;const attempt=Math.max(1,attempts);const reason=classify(event.note);if(event.status!=="failed"||riskRank(event.risk)>riskRank(effective.maxRisk)||event.txHash)return{actionId:event.actionId,retryable:false,attempt,delayMs:0,reason:"not-retryable"};if(reason==="unknown-failure"||attempt>=effective.maxAttempts)return{actionId:event.actionId,retryable:false,attempt,delayMs:0,reason:reason==="unknown-failure"?reason:"not-retryable"};return{actionId:event.actionId,retryable:true,attempt:attempt+1,delayMs:backoff(attempt,effective),reason};}
