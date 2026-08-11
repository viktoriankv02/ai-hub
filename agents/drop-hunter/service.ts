import type { PlannedAction } from "./action-planner.js";
import { DropHunterEngine, type DropHunterCycleResult, type DropHunterObserveOptions } from "./engine.js";
import { ExecutionAdapterRegistry } from "./execution-adapter.js";
import { ExecutionReceiptStore, createIdempotencyKey, receiptStatusFromExecution, type ExecutionIntent, type ExecutionReceipt } from "./execution-idempotency.js";
import { ExecutionGate, type ExecutionGateDecision, type ExecutionGateRequest, type ExecutionMode } from "./execution-gate.js";
import { runApprovedActions, type ExecutionHandler, type ExecutionRun } from "./execution-runner.js";
import { planExecutionRetry, type ExecutionRetryPolicy, type RetryDecision } from "./execution-retry.js";
import { mergeAsyncOpportunitySources, mergeOpportunitySources, type AsyncOpportunitySource, type OpportunitySource } from "./opportunity-source.js";
import { OpportunityDiscoveryRegistry, type DiscoveryBatch, type DiscoverySourceHealth } from "./discovery-registry.js";
import type { ExecutionEvent } from "./execution-memory.js";
import type { ProjectOpportunity } from "./types.js";
import { EvmTransactionMonitor, type TransactionMonitorResult } from "./transaction-monitor.js";
import type { EvmExecutionAdapter } from "./evm-execution-adapter.js";
export interface ServiceScanOptions extends DropHunterObserveOptions { profile?: Parameters<DropHunterEngine["observe"]>[2]; }
export interface GatedAction { action: PlannedAction; decision: ExecutionGateDecision; }
export interface ServiceExecutionOptions { mode: ExecutionMode; timestamp: string; chainId?: number; account?: string; payloadFingerprint?: string; approved?: boolean; walletConnected?: boolean; gasAvailable?: boolean; }
export interface IdempotentExecutionRun extends ExecutionRun { idempotencyKey: string; receipt: ExecutionReceipt; }
export interface ExecutionReceiptLookup { opportunityId:string; actionId:string; chainId?:number; account?:string; payloadFingerprint?:string; }
export class DropHunterService {
 private readonly receipts:ExecutionReceiptStore; private readonly discovery:OpportunityDiscoveryRegistry;
 constructor(private readonly sources:OpportunitySource[],private readonly engine=new DropHunterEngine(),private readonly gate=new ExecutionGate(),private readonly adapters=new ExecutionAdapterRegistry(),receipts=new ExecutionReceiptStore()){this.receipts=receipts;this.discovery=new OpportunityDiscoveryRegistry(this.sources);}
 discover():ProjectOpportunity[]{return mergeOpportunitySources(this.sources);}
 async discoverAsync(sources:Array<OpportunitySource|AsyncOpportunitySource>=this.sources){return mergeAsyncOpportunitySources(sources);}
 async discoverResilient(timestamp?:string){return this.discovery.discover(timestamp);}
 discoveryHealth(){return this.discovery.statuses();}
 enableDiscoverySource(id:string){return this.discovery.enable(id);}
 disableDiscoverySource(id:string){return this.discovery.disable(id);}
 scan(options:ServiceScanOptions):DropHunterCycleResult[]{return this.discover().map(o=>this.engine.observe(o,options,options.profile));}
 async scanAsync(options:ServiceScanOptions,sources:Array<OpportunitySource|AsyncOpportunitySource>=this.sources){const opportunities=await this.discoverAsync(sources);return opportunities.map(o=>this.engine.observe(o,options,options.profile));}
 async scanResilient(options:ServiceScanOptions,timestamp?:string){const discovery=await this.discoverResilient(timestamp);const cycles=discovery.opportunities.map(o=>this.engine.observe(o,options,options.profile));return{discovery,cycles};}
 gateActions(result:DropHunterCycleResult,mode:ExecutionMode,context:Pick<ExecutionGateRequest,"approved"|"walletConnected"|"gasAvailable">={approved:false,walletConnected:false,gasAvailable:false}){return result.actions.map(action=>({action,decision:this.gate.evaluate({actionId:action.id,risk:action.risk,automated:action.automated,requiresWallet:action.requiresWallet,requiresGas:action.requiresGas,mode,...context})}));}
 retryPlans(events:ExecutionEvent[],policy:Partial<ExecutionRetryPolicy>={}):RetryDecision[]{const latest=new Map<string,ExecutionEvent>();for(const event of events)latest.set(event.actionId,event);return[...latest.values()].map(event=>planExecutionRetry(event,events,policy));}
 async execute(result:DropHunterCycleResult,options:ServiceExecutionOptions,handlers:Record<string,ExecutionHandler>):Promise<ExecutionRun[]>{const gated=this.gateActions(result,options.mode,{approved:options.approved,walletConnected:options.walletConnected,gasAvailable:options.gasAvailable});if(options.mode==="dry-run"){const runs=await runApprovedActions(gated,handlers,{timestamp:options.timestamp,chainId:options.chainId});for(const run of runs)this.engine.recordExecution(run.event);return runs;}const executable:GatedAction[]=[];const blocked:ExecutionRun[]=[];for(const item of gated){if(!item.decision.allowed){blocked.push({action:item.action,decision:item.decision,event:{actionId:item.action.id,status:"skipped",timestamp:options.timestamp,risk:item.action.risk,chainId:options.chainId,note:item.decision.reason}});continue;}const intent:ExecutionIntent={opportunityId:result.opportunity.id,actionId:item.action.id,chainId:options.chainId??result.opportunity.chainId,account:options.account,payloadFingerprint:options.payloadFingerprint};const reservation=this.receipts.reserve(intent,options.timestamp);if(!reservation.reserved){blocked.push({action:item.action,decision:{allowed:false,requiresConfirmation:true,reason:`execution blocked by idempotency receipt: ${reservation.reason}`},event:{actionId:item.action.id,status:"skipped",timestamp:options.timestamp,risk:item.action.risk,chainId:options.chainId,note:`idempotency receipt ${reservation.receipt.status} prevents duplicate execution`}});continue;}executable.push(item);}const executed=await runApprovedActions(executable,handlers,{timestamp:options.timestamp,chainId:options.chainId});const runs=[...blocked,...executed];for(const run of executed){const intent:ExecutionIntent={opportunityId:result.opportunity.id,actionId:run.action.id,chainId:run.event.chainId??options.chainId??result.opportunity.chainId,account:options.account,payloadFingerprint:options.payloadFingerprint};const key=createIdempotencyKey(intent);const status=receiptStatusFromExecution(run.event.status,run.event.txHash);if(status==="submitted")this.receipts.markSubmitted(key,run.event.timestamp,run.event.txHash as string,run.event.note);else if(status==="confirmed")this.receipts.markConfirmed(key,run.event.timestamp,undefined,run.event.note);else this.receipts.markFailed(key,run.event.timestamp,run.event.note);}for(const run of runs)this.engine.recordExecution(run.event);return runs;}
 async executeWithAdapters(result:DropHunterCycleResult,options:ServiceExecutionOptions){const handlers:Record<string,ExecutionHandler>={};for(const action of result.actions)handlers[action.id]=planned=>this.adapters.execute(planned,{mode:options.mode,timestamp:options.timestamp,chainId:options.chainId,walletConnected:options.walletConnected,gasAvailable:options.gasAvailable});return this.execute(result,options,handlers);}
 async reconcileEvmExecution(lookup:ExecutionReceiptLookup,adapter:EvmExecutionAdapter,timestamp:string):Promise<TransactionMonitorResult>{return new EvmTransactionMonitor(this.receipts,adapter).reconcile(createIdempotencyKey(lookup),timestamp);}
 executionReceipt(lookup:ExecutionReceiptLookup){return this.receipts.find(lookup);}
 confirmExecution(lookup:ExecutionReceiptLookup,timestamp:string,txHash?:string,note?:string){return this.receipts.markConfirmed(createIdempotencyKey(lookup),timestamp,txHash,note);}
 markExecutionUnknown(lookup:ExecutionReceiptLookup,timestamp:string,note?:string){return this.receipts.markUnknown(createIdempotencyKey(lookup),timestamp,note);}
 executionAdapters(){return this.adapters;} executionReceipts(){return this.receipts;} engineState(){return this.engine;}
}
