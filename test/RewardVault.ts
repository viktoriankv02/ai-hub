import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("RewardVault", function () {
  it("funds and pays native rewards once", async function () {
    const [owner, manager, user] = await ethers.getSigners();
    const vault = await ethers.deployContract("RewardVault", [owner.address]);
    await vault.setRewardManager(manager.address, true);
    await owner.sendTransaction({ to: vault.target, value: ethers.parseEther("1") });
    const claimId = ethers.id("NATIVE_001");
    const before = await ethers.provider.getBalance(user.address);
    await vault.connect(manager).claimNative(claimId, user.address, ethers.parseEther("0.1"));
    const after = await ethers.provider.getBalance(user.address);
    expect(after - before).to.equal(ethers.parseEther("0.1"));
    expect(await vault.claimed(claimId)).to.equal(true);
    await expect(vault.connect(manager).claimNative(claimId, user.address, ethers.parseEther("0.1"))).to.be.revertedWith("Vault: claim already used");
  });

  it("rejects unauthorized managers", async function () {
    const [owner, user] = await ethers.getSigners();
    const vault = await ethers.deployContract("RewardVault", [owner.address]);
    const claimId = ethers.id("UNAUTHORIZED");
    await expect(vault.connect(user).claimNative(claimId, user.address, 1n)).to.be.revertedWith("Vault: unauthorized manager");
  });

  it("supports ERC20 funding and claims", async function () {
    const [owner, manager, user] = await ethers.getSigners();
    const vault = await ethers.deployContract("RewardVault", [owner.address]);
    const token = await ethers.deployContract("MockERC20", [owner.address, "AI Hub Reward", "AHR", 1000000n]);
    await vault.setRewardManager(manager.address, true);
    await token.approve(vault.target, 1000n);
    await vault.fundERC20(token.target, 1000n);
    await vault.connect(manager).claimERC20(ethers.id("ERC20_001"), token.target, user.address, 250n);
    expect(await token.balanceOf(user.address)).to.equal(250n);
  });
});
