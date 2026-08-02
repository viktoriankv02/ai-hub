import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("ChainRegistry", function () {
  it("rejects an unauthorized adapter and registers an authorized chain", async function () {
    const [owner, adapter] = await ethers.getSigners();
    const registry = await ethers.deployContract("ChainRegistry", [owner.address]);
    const nameHash = ethers.id("BASE_SEPOLIA");
    const vmType = ethers.id("EVM");

    await expect(
      registry.registerChain(84532n, nameHash, vmType, adapter.address, true, true),
    ).to.be.revertedWith("Chain: adapter unauthorized");

    await registry.setAdapterAuthorized(adapter.address, true);
    await registry.registerChain(84532n, nameHash, vmType, adapter.address, true, true);

    const chain = await registry.getChain(84532n);
    expect(chain.chainId).to.equal(84532n);
    expect(chain.nameHash).to.equal(nameHash);
    expect(chain.vmType).to.equal(vmType);
    expect(chain.adapter).to.equal(adapter.address);
    expect(chain.active).to.equal(true);
    expect(chain.testnet).to.equal(true);
    expect(await registry.chainCount()).to.equal(1n);
  });

  it("supports lookup by name and controlled deactivation", async function () {
    const [owner, adapter] = await ethers.getSigners();
    const registry = await ethers.deployContract("ChainRegistry", [owner.address]);
    const nameHash = ethers.id("SEPOLIA");

    await registry.setAdapterAuthorized(adapter.address, true);
    await registry.registerChain(11155111n, nameHash, ethers.id("EVM"), adapter.address, true, true);

    expect((await registry.getChainByName(nameHash)).chainId).to.equal(11155111n);
    expect(await registry.isSupported(11155111n)).to.equal(true);

    await registry.setChainActive(11155111n, false);
    expect(await registry.isSupported(11155111n)).to.equal(false);
  });
});
