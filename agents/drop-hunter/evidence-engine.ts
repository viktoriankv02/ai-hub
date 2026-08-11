import type { ExecutionStatus } from "./execution-memory.js";
export type EvidenceKind="onchain"|"github"|"deployment"|"verification"|"participation"|"reward";
export type EvidenceConfidence="low"|"medium"|"high";
export interface ActionEvidence{actionId:string;kind:EvidenceKind;status:ExecutionStatus;confidence:EvidenceConfidence;timestamp:string;chainId?:number;txHash?:string;contractAddress?:string;url?:string;note?:string;}
export interface EvidenceSummary{actionId:string;verified:boolean;confidence:EvidenceConfidence;evidenceCount:number;kinds:EvidenceKind[];txHashes:string[];}
const confidenceRank:Record<EvidenceConfidence,number>={low:1,medium:2,high:3};
function highestConfidence(values:EvidenceConfidence[]):EvidenceConfidence{return values.length===0?"low":values.reduce((best,value)=>confidenceRank[value]>confidenceRank[best]?value:best);}
function unique<T>(values:T[]):T[]{return[...new Set(values)];}
export function summarizeEvidence(actionId:string,evidence:ActionEvidence[]):EvidenceSummary{const relevant=evidence.filter(i=>i.actionId===actionId);const successful=relevant.filter(i=>i.status==="success");const verified=successful.some(i=>i.kind==="onchain"||i.kind==="deployment"||i.kind==="verification");return{actionId,verified,confidence:highestConfidence(relevant.map(i=>i.confidence)),evidenceCount:relevant.length,kinds:unique(relevant.map(i=>i.kind)),txHashes:unique(relevant.map(i=>i.txHash).filter((h):h is string=>Boolean(h)))};}
export function verifiedEvidence(evidence:ActionEvidence[]):ActionEvidence[]{return evidence.filter(i=>i.status==="success"&&(i.kind==="onchain"||i.kind==="deployment"||i.kind==="verification"));}
export function recordEvidence(evidence:ActionEvidence[],item:ActionEvidence):ActionEvidence[]{return[...evidence,{...item}];}
