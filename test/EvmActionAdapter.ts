import { expect } from "chai";
import { EvmActionAdapter } from "../agents/drop-hunter/evm-action-adapter.js";
import type { PlannedAction } from "../agents/drop-hunter/action-planner.js";

const action: PlannedAction = {
  id: "swap-eth-usdc",
  label: "Execute configured swap",
  risk: "medium",
  requiresWallet: true,
  requiresGas: true,
  automated: false,
  completed: false,
};

describe("EvmActionAdapter", function () {
  it("builds an exact preview from a trusted transaction spec", function () {
    const adapter = new EvmActionAdapter({
      specs: [{
        actionId: action.id,
        kind: "swap",
        chainId: 11155111,
        to: "0x1111111111111111111111111111111111111111",
        data: "0x1234",
        value: "0",
        gasLimit: "250000",
      }],
    });

    const preview = adapter.buildPreview(action, { chainId: 11155111 });

    expect(preview.kind).to.equal("swap");
    expect(preview.chainId).to.equal(11155111);
    expect(preview.calls).to.deep.equal([{
      to: "0x1111111111111111111111111111111111111111",
      data: "0x1234",
      value: "0",
      chainId: 11155111,
    }]);
    expect(preview.gasLimit).to.equal("250000");
    expect(preview.previewHash).to.match(/^preview:[0-9a-f]{8}$/);
  });

  it("rejects a wallet context on the wrong chain", function () {
    const adapter = new EvmActionAdapter({
      specs: [{
        actionId: action.id,
        kind: "swap",
        chainId: 11155111,
        to: "0x1111111111111111111111111111111111111111",
      }],
    });

    expect(() => adapter.buildPreview(action, { chainId: 84532 }))
      .to.throw(/targets chain 11155111, but execution context is chain 84532/);
  });

  it("rejects invalid transaction targets", function () {
    expect(() => new EvmActionAdapter({
      specs: [{
        actionId: action.id,
        kind: "mint",
        chainId: 11155111,
        to: "not-an-address",
      }],
    })).to.throw(/invalid EVM target address/);
  });

  it("does not sign or submit transactions itself", async function () {
    const adapter = new EvmActionAdapter({
      specs: [{
        actionId: action.id,
        kind: "stake",
        chainId: 11155111,
        to: "0x1111111111111111111111111111111111111111",
      }],
    });

    const result = await adapter.execute(action, {
      mode: "execute",
      timestamp: "2026-09-02T00:00:00.000Z",
      chainId: 11155111,
      walletConnected: true,
      gasAvailable: true,
    });

    expect(result.status).to.equal("failed");
    expect(result.note).to.match(/transaction preview is ready/);
    expect(result.txHash).to.equal(undefined);
  });
});
