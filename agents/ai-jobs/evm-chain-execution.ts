import type { AIJobRecord } from "./types.js";
import type { EVMOnchainRuntime } from "./onchain-runtime.js";
import type { AIJobChainExecutionAdapter, AIJobChainTarget } from "./chain-execution.js";

export interface EVMChainExecutionAdapterOptions {
  target: AIJobChainTarget;
  coordinator: EVMOnchainRuntime["coordinator"];
}

export class EVMChainExecutionAdapter implements AIJobChainExecutionAdapter {
  readonly target: AIJobChainTarget;

  constructor(options: EVMChainExecutionAdapterOptions) {
    this.target = options.target;
    this.coordinator = options.coordinator;
  }

  private readonly coordinator: EVMOnchainRuntime["coordinator"];

  async provision(job: AIJobRecord) {
    return this.coordinator.provision(job);
  }

  async complete(job: AIJobRecord) {
    return this.coordinator.attestAndSubmit(job);
  }

  async execute(job: AIJobRecord) {
    return this.coordinator.provisionAndSubmit(job);
  }
}
