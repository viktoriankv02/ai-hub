import { expect } from "chai";
import { EVM_NETWORKS } from "../deploy/config/networks.js";
import { chains } from "../config/chains.js";

describe("Network configuration", function () {
  it("registers Ink Sepolia as a first-priority testnet", function () {
    expect(EVM_NETWORKS.inkSepolia).to.deep.include({
      name: "Ink Sepolia",
      chainId: 763373,
      rpcEnv: "INK_SEPOLIA_RPC_URL",
      explorerEnv: "INK_SEPOLIA_EXPLORER_URL",
      testnet: true,
    });

    const ink = chains.find((chain) => chain.key === "inkSepolia");
    expect(ink).to.exist;
    expect(ink?.chainId).to.equal(763373);
    expect(ink?.enabled).to.equal(true);
  });
});
