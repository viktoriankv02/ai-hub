import { expect } from "chai";
import type { PlannedAction } from "../agents/drop-hunter/action-planner.js";
import {
  EvmExecutionAdapter,
  type EvmReceiptProvider,
  type EvmSigner,
} from "../agents/drop-hunter/evm-execution-adapter.js";

const action: PlannedAction = {
  id: "record-activity",
  label: "Record a verifiable on-chain activity in AI Hub",
  risk: "low",
  requiresWallet: true,
  requiresGas: true,
  automated: true,
  completed: false,
};

function context(overrides: Partial<Parameters<EvmExecutionAdapter["execute"]>[1]> = {}) {
  return {
    mode: "execute" as const,
    timestamp: "2026-08-10T22:00:00.000Z",
    chainId: 763373,
    walletConnected: true,
    gasAvailable: true,
    ...overrides,
  };
}

describe("Drop Hunter EVM execution adapter", function () {
  it("submits a real transaction request through the injected signer", async function () {
    let request: Record<string, unknown> | undefined;
    const signer: EvmSigner = {
      async getAddress() {
        return "0x0000000000000000000000000000000000000001";
      },
      async sendTransaction(next) {
        request = next as Record<string, unknown>;
        return { hash: "0xsubmitted" };
      },
    };
    const provider: EvmReceiptProvider = {
      async getTransactionReceipt() {
        return null;
      },
    };

    const adapter = new EvmExecutionAdapter("ink-evm", signer, provider, {
      supportedActionIds: ["record-activity"],
      chainIds: [763373],
      resolveTransaction: () => ({
        to: "0x0000000000000000000000000000000000000002",
        data: "0x1234",
        value: 0n,
      }),
    });

    const result = await adapter.execute(action, context());

    expect(result.status).to.equal("success");
    expect(result.txHash).to.equal("0xsubmitted");
    expect(result.note).to.equal("transaction submitted; confirmation pending");
    expect(request).to.deep.equal({
      to: "0x0000000000000000000000000000000000000002",
      data: "0x1234",
      value: 0n,
    });
  });

  it("does not invoke the signer during dry-run", async function () {
    let invoked = false;
    const signer: EvmSigner = {
      async getAddress() {
        return "0x1";
      },
      async sendTransaction() {
        invoked = true;
        return { hash: "0xnever" };
      },
    };
    const provider: EvmReceiptProvider = {
      async getTransactionReceipt() {
        return null;
      },
    };

    const adapter = new EvmExecutionAdapter("ink-evm", signer, provider, {
      supportedActionIds: ["record-activity"],
      resolveTransaction: () => ({ to: "0x2" }),
    });

    const result = await adapter.execute(action, context({ mode: "dry-run" }));

    expect(invoked).to.equal(false);
    expect(result.status).to.equal("failed");
    expect(result.note).to.equal("execution adapters are not invoked during dry-run");
  });

  it("hard-stops on wallet, gas, and chain requirements", async function () {
    let invocations = 0;
    const signer: EvmSigner = {
      async getAddress() {
        return "0x1";
      },
      async sendTransaction() {
        invocations += 1;
        return { hash: "0xnever" };
      },
    };
    const provider: EvmReceiptProvider = {
      async getTransactionReceipt() {
        return null;
      },
    };
    const adapter = new EvmExecutionAdapter("ink-evm", signer, provider, {
      supportedActionIds: ["record-activity"],
      chainIds: [763373],
      resolveTransaction: () => ({ to: "0x2" }),
    });

    const wallet = await adapter.execute(action, context({ walletConnected: false }));
    const gas = await adapter.execute(action, context({ gasAvailable: false }));
    const chain = await adapter.execute(action, context({ chainId: 1 }));

    expect(wallet.note).to.equal("wallet connection is required");
    expect(gas.note).to.equal("gas availability is required");
    expect(chain.note).to.equal("unsupported EVM chain for adapter: 1");
    expect(invocations).to.equal(0);
  });

  it("does not execute unsupported actions", async function () {
    let invoked = false;
    const signer: EvmSigner = {
      async getAddress() {
        return "0x1";
      },
      async sendTransaction() {
        invoked = true;
        return { hash: "0xnever" };
      },
    };
    const provider: EvmReceiptProvider = {
      async getTransactionReceipt() {
        return null;
      },
    };
    const adapter = new EvmExecutionAdapter("ink-evm", signer, provider, {
      supportedActionIds: ["record-activity"],
      resolveTransaction: () => ({ to: "0x2" }),
    });

    const result = await adapter.execute(
      { ...action, id: "deploy-erc20" },
      context(),
    );

    expect(invoked).to.equal(false);
    expect(result.status).to.equal("failed");
    expect(result.note).to.equal("EVM adapter does not support action: deploy-erc20");
  });

  it("maps receipt status to confirmed, failed, and unknown", async function () {
    let receipt: { status?: number; blockNumber?: number; transactionHash?: string } | null = {
      status: 1,
      blockNumber: 42,
      transactionHash: "0xconfirmed",
    };
    const signer: EvmSigner = {
      async getAddress() {
        return "0x1";
      },
      async sendTransaction() {
        return { hash: "0xsubmitted" };
      },
    };
    const provider: EvmReceiptProvider = {
      async getTransactionReceipt() {
        return receipt;
      },
    };
    const adapter = new EvmExecutionAdapter("ink-evm", signer, provider, {
      supportedActionIds: ["record-activity"],
      resolveTransaction: () => ({ to: "0x2" }),
    });

    const confirmed = await adapter.confirm("0xconfirmed");
    expect(confirmed.status).to.equal("confirmed");
    expect(confirmed.blockNumber).to.equal(42);

    receipt = { status: 0, transactionHash: "0xfailed" };
    const failed = await adapter.confirm("0xfailed");
    expect(failed.status).to.equal("failed");

    receipt = null;
    const unknown = await adapter.confirm("0xpending");
    expect(unknown.status).to.equal("unknown");
  });

  it("returns unknown when receipt lookup itself fails", async function () {
    const signer: EvmSigner = {
      async getAddress() {
        return "0x1";
      },
      async sendTransaction() {
        return { hash: "0xsubmitted" };
      },
    };
    const provider: EvmReceiptProvider = {
      async getTransactionReceipt() {
        throw new Error("RPC unavailable");
      },
    };
    const adapter = new EvmExecutionAdapter("ink-evm", signer, provider, {
      supportedActionIds: ["record-activity"],
      resolveTransaction: () => ({ to: "0x2" }),
    });

    const result = await adapter.confirm("0xpending");

    expect(result.status).to.equal("unknown");
    expect(result.note).to.equal("RPC unavailable");
  });
});
