import { expect } from "chai";
import { createEvmExecutionRuntime, createEvmRuntimeFromEnv } from "../agents/drop-hunter/evm-runtime.js";

const TEST_KEY = "0x0123456789012345678901234567890123456789012345678901234567890123";

describe("Drop Hunter EVM runtime", () => {
  it("refuses unknown networks", () => {
    expect(() =>
      createEvmExecutionRuntime(
        { network: "does-not-exist", privateKey: TEST_KEY },
        "evm-test",
        { supportedActionIds: [] , resolveTransaction: () => ({}) },
      ),
    ).to.throw("Unknown EVM network");
  });

  it("refuses a missing private key", () => {
    expect(() =>
      createEvmExecutionRuntime(
        { network: "baseSepolia", privateKey: "" },
        "evm-test",
        { supportedActionIds: [], resolveTransaction: () => ({}) },
      ),
    ).to.throw("private key");
  });

  it("builds a testnet runtime with the configured chain restriction", async () => {
    const runtime = createEvmExecutionRuntime(
      { network: "baseSepolia", privateKey: TEST_KEY },
      "evm-test",
      { supportedActionIds: ["verify-configuration"], resolveTransaction: () => ({}) },
    );

    expect(runtime.network.chainId).to.equal(84532);
    expect(runtime.adapter.supports({
      id: "verify-configuration",
      label: "Verify",
      risk: "low",
      requiresWallet: true,
      requiresGas: false,
      automated: true,
      completed: false,
    })).to.equal(true);
  });

  it("defaults environment execution to Base Sepolia and requires a key", () => {
    const runtime = createEvmRuntimeFromEnv(
      "evm-env",
      { supportedActionIds: [], resolveTransaction: () => ({}) },
      { DEPLOYER_PRIVATE_KEY: TEST_KEY } as NodeJS.ProcessEnv,
    );

    expect(runtime.network.key).to.equal("baseSepolia");
    expect(runtime.network.testnet).to.equal(true);
  });

  it("rejects missing environment private key before creating a wallet", () => {
    expect(() =>
      createEvmRuntimeFromEnv(
        "evm-env",
        { supportedActionIds: [], resolveTransaction: () => ({}) },
        { AI_HUB_NETWORK: "baseSepolia" },
      ),
    ).to.throw("Missing DEPLOYER_PRIVATE_KEY");
  });
});
