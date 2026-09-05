import { expect } from "chai";
import { ExecutionGate } from "../agents/drop-hunter/execution-gate.js";
import {
  fingerprintTransactionPreview,
  StaticTransactionPreviewBuilder,
} from "../agents/drop-hunter/transaction-preview.js";
import { WalletExecutionAdapter, type Eip1193Provider } from "../agents/drop-hunter/wallet-execution.js";
import type { PlannedAction } from "../agents/drop-hunter/action-planner.js";

const action: PlannedAction = {
  id: "mint-test-token",
  label: "Mint test token",
  risk: "medium",
  requiresWallet: true,
  requiresGas: true,
  automated: false,
  completed: false,
};

const wallet = "0x1111111111111111111111111111111111111111";
const target = "0x2222222222222222222222222222222222222222";
const chainId = 84532;

const decision = {
  allowed: true,
  requiresConfirmation: false,
  reason: "execution satisfies the configured policy",
};

function providerFor(options: {
  accounts?: string[];
  chainId?: string;
  sendResult?: string;
}) {
  const requests: { method: string; params?: unknown[] }[] = [];
  const provider: Eip1193Provider = {
    async request(args) {
      requests.push(args);
      if (args.method === "eth_accounts") return options.accounts ?? [wallet];
      if (args.method === "eth_chainId") return options.chainId ?? "0x14a34";
      if (args.method === "eth_sendTransaction") return options.sendResult ?? "0xtx";
      throw new Error(`unexpected provider method: ${args.method}`);
    },
  };
  return { provider, requests };
}

function previewWithCalls(calls: { to: string; data?: string; value?: string; chainId?: number }[]) {
  const base = new StaticTransactionPreviewBuilder().build(action, { chainId });
  const preview = { ...base, calls };
  return { ...preview, previewHash: fingerprintTransactionPreview(preview) };
}

describe("WalletExecutionAdapter", () => {
  it("requires the approved preview fingerprint", async () => {
    const adapter = new WalletExecutionAdapter(new ExecutionGate(), new StaticTransactionPreviewBuilder());
    const currentPreview = previewWithCalls([{ to: target, chainId }]);

    const result = await adapter.execute({
      action,
      decision,
      preview: { ...currentPreview, calls: [{ to: target, data: "0xdeadbeef", chainId }] },
      approvedPreviewHash: currentPreview.previewHash,
      walletAddress: wallet,
      provider: providerFor({}).provider,
      chainId,
    });

    expect(result.status).to.equal("failed");
    expect(result.note).to.contain("does not match");
  });

  it("blocks when the requested wallet is not the connected account", async () => {
    const adapter = new WalletExecutionAdapter(new ExecutionGate(), new StaticTransactionPreviewBuilder());
    const currentPreview = previewWithCalls([{ to: target, chainId }]);
    const { provider, requests } = providerFor({ accounts: ["0x3333333333333333333333333333333333333333"] });

    const result = await adapter.execute({
      action,
      decision,
      preview: currentPreview,
      approvedPreviewHash: currentPreview.previewHash,
      walletAddress: wallet,
      provider,
      chainId,
    });

    expect(result.status).to.equal("failed");
    expect(result.note).to.equal("wallet is not the currently connected account");
    expect(requests.map((request) => request.method)).to.deep.equal(["eth_accounts"]);
  });

  it("blocks when the provider chain differs from the execution chain", async () => {
    const adapter = new WalletExecutionAdapter(new ExecutionGate(), new StaticTransactionPreviewBuilder());
    const currentPreview = previewWithCalls([{ to: target, chainId }]);
    const { provider } = providerFor({ chainId: "0x1" });

    const result = await adapter.execute({
      action,
      decision,
      preview: currentPreview,
      approvedPreviewHash: currentPreview.previewHash,
      walletAddress: wallet,
      provider,
      chainId,
    });

    expect(result.status).to.equal("failed");
    expect(result.note).to.equal(`wallet provider is on chain 1, expected ${chainId}`);
  });

  it("blocks a preview whose call targets another chain", async () => {
    const adapter = new WalletExecutionAdapter(new ExecutionGate(), new StaticTransactionPreviewBuilder());
    const currentPreview = previewWithCalls([{ to: target, chainId: 1 }]);
    const { provider, requests } = providerFor({});

    const result = await adapter.execute({
      action,
      decision,
      preview: currentPreview,
      approvedPreviewHash: currentPreview.previewHash,
      walletAddress: wallet,
      provider,
      chainId,
    });

    expect(result.status).to.equal("failed");
    expect(result.note).to.contain("targets chain 1");
    expect(requests).to.deep.equal([]);
  });

  it("detects preview tampering even when the caller reuses the approved hash", async () => {
    const adapter = new WalletExecutionAdapter(new ExecutionGate(), new StaticTransactionPreviewBuilder());
    const approvedPreview = previewWithCalls([{ to: target, data: "0x1234", value: "1000", chainId }]);
    const tamperedPreview = {
      ...approvedPreview,
      calls: [{ to: target, data: "0x9999", value: "1000", chainId }],
    };
    const { provider, requests } = providerFor({});

    const result = await adapter.execute({
      action,
      decision,
      preview: tamperedPreview,
      approvedPreviewHash: approvedPreview.previewHash,
      walletAddress: wallet,
      provider,
      chainId,
    });

    expect(result.status).to.equal("failed");
    expect(result.note).to.contain("does not match");
    expect(requests).to.deep.equal([]);
  });

  it("sends only after account, chain and target validation", async () => {
    const adapter = new WalletExecutionAdapter(new ExecutionGate(), new StaticTransactionPreviewBuilder());
    const currentPreview = previewWithCalls([{ to: target, data: "0x1234", value: "1000", chainId }]);
    const { provider, requests } = providerFor({ sendResult: "0xapproved" });

    const result = await adapter.execute({
      action,
      decision,
      preview: currentPreview,
      approvedPreviewHash: currentPreview.previewHash,
      walletAddress: wallet,
      provider,
      chainId,
    });

    expect(result.status).to.equal("success");
    expect(result.txHash).to.equal("0xapproved");
    expect(requests.map((request) => request.method)).to.deep.equal([
      "eth_accounts",
      "eth_chainId",
      "eth_sendTransaction",
    ]);
    expect(requests[2]?.params).to.deep.equal([{
      from: wallet,
      to: target,
      data: "0x1234",
      value: "1000",
    }]);
  });
});
