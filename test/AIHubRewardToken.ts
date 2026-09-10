import { expect } from "chai";
import { network } from "hardhat";

 describe("AIHubRewardToken", function () {
  it("mints exactly the fixed supply to the treasury", async function () {
    const { ethers } = await network.connect();
    const [deployer, treasury, other] = await ethers.getSigners();
    const token = await ethers.deployContract("AIHubRewardToken", [treasury.address]);
    await token.waitForDeployment();

    expect(await token.name()).to.equal("AI Hub Reward Token");
    expect(await token.symbol()).to.equal("AIHUB");
    expect(await token.decimals()).to.equal(18);
    expect(await token.totalSupply()).to.equal(1_000_000_000n * 10n ** 18n);
    expect(await token.balanceOf(treasury.address)).to.equal(1_000_000_000n * 10n ** 18n);
    expect(await token.balanceOf(deployer.address)).to.equal(0n);
    expect(await token.balanceOf(other.address)).to.equal(0n);
  });

  it("rejects a zero treasury", async function () {
    const { ethers } = await network.connect();
    await expect(ethers.deployContract("AIHubRewardToken", [ethers.ZeroAddress])).to.be.revertedWith(
      "AIHUB: zero treasury",
    );
  });
});
