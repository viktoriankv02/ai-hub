import { expect } from "chai";
import { EVM_NETWORKS, PRIMARY_NETWORK_KEYS } from "../deploy/config/networks.js";

describe("Primary network configuration", function () {
  it("keeps Base Sepolia and Base mainnet as first-priority networks", function () {
    expect(EVM_NETWORKS.base.chainId).to.equal(8453);
    expect(EVM_NETWORKS.baseSepolia.chainId).to.equal(84532);
    expect(EVM_NETWORKS.base.priority).to.equal(1);
    expect(EVM_NETWORKS.baseSepolia.priority).to.equal(1);
    expect(EVM_NETWORKS.base.role).to.equal("primary");
    expect(EVM_NETWORKS.baseSepolia.role).to.equal("primary");
  });

  it("keeps Ink Sepolia as the other first-priority development network", function () {
    expect(PRIMARY_NETWORK_KEYS).to.deep.equal(["baseSepolia", "base", "inkSepolia"]);
    expect(EVM_NETWORKS.inkSepolia.chainId).to.equal(763373);
    expect(EVM_NETWORKS.inkSepolia.priority).to.equal(1);
  });
});
