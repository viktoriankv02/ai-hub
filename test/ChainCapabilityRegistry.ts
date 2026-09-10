import { expect } from "chai";
import type { ChainConfig } from "../config/chains.js";
import {
  ChainCapabilityRegistry,
  createBaselineChainCapabilityRegistry,
} from "../agents/multi-chain/chain-capabilities.js";
import type { UniversalAction } from "../agents/multi-chain/types.js";

describe("ChainCapabilityRegistry", function () {
  const chains: ChainConfig[] = [
    { key: "baseSepolia", name: "Base Sepolia", kind: "evm", enabled: true, chainId: 84532 },
    { key: "sui", name: "Sui", kind: "non-evm", enabled: false },
  ];

  const action = (kind: UniversalAction["kind"], chainKey = "baseSepolia"): UniversalAction => ({
    id: `${chainKey}:${kind}`,
    kind,
    chainKey,
    payload: {},
  });

  it("registers explicit capabilities for a known chain", function () {
    const registry = new ChainCapabilityRegistry(chains);
    registry.register({
      chainKey: "baseSepolia",
      actionKinds: new Set(["deploy-contract", "create-job"]),
    });

    expect(registry.supports("baseSepolia", "deploy-contract")).to.equal(true);
    expect(registry.supports("baseSepolia", "create-job")).to.equal(true);
    expect(registry.supports("baseSepolia", "swap")).to.equal(false);
  });

  it("rejects capability profiles for unknown chains", function () {
    const registry = new ChainCapabilityRegistry(chains);

    expect(() =>
      registry.register({ chainKey: "unknown", actionKinds: new Set(["custom"]) }),
    ).to.throw("cannot register capabilities for unknown chain: unknown");
  });

  it("blocks undeclared action kinds", function () {
    const registry = new ChainCapabilityRegistry(chains);
    registry.register({
      chainKey: "baseSepolia",
      actionKinds: new Set(["deploy-contract"]),
    });

    const result = registry.check(action("swap"));

    expect(result.supported).to.equal(false);
    expect(result.note).to.equal("action swap is not enabled for baseSepolia");
  });

  it("allows explicit replacement when a protocol capability is added", function () {
    const registry = new ChainCapabilityRegistry(chains);
    registry.register({
      chainKey: "baseSepolia",
      actionKinds: new Set(["deploy-contract"]),
    });
    registry.replace({
      chainKey: "baseSepolia",
      actionKinds: new Set(["deploy-contract", "swap"]),
    });

    expect(registry.check(action("swap")).supported).to.equal(true);
  });

  it("creates a conservative EVM baseline without inventing protocol support", function () {
    const registry = createBaselineChainCapabilityRegistry(chains);

    expect(registry.supports("baseSepolia", "deploy-contract")).to.equal(true);
    expect(registry.supports("baseSepolia", "verify-contract")).to.equal(true);
    expect(registry.supports("baseSepolia", "custom")).to.equal(true);
    expect(registry.supports("baseSepolia", "swap")).to.equal(false);
    expect(registry.supports("baseSepolia", "bridge")).to.equal(false);
    expect(registry.supports("baseSepolia", "create-job")).to.equal(false);
    expect(registry.get("sui")).to.equal(undefined);
  });
});
