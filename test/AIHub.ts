import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AIHub", function () {
  it("registers a user", async function () {
    const [owner] = await ethers.getSigners();
    const hub = await ethers.deployContract("AIHub", [owner.address]);

    await hub.register();

    const user = await hub.getUser(owner.address);
    expect(user.registered).to.equal(true);
    expect(user.activityCount).to.equal(0n);
    expect(await hub.totalUsers()).to.equal(1n);
  });

  it("records an activity for a registered user", async function () {
    const [owner] = await ethers.getSigners();
    const hub = await ethers.deployContract("AIHub", [owner.address]);

    await hub.register();
    await hub.recordActivity(ethers.id("QUEST_COMPLETED"));

    const user = await hub.getUser(owner.address);
    expect(user.activityCount).to.equal(1n);
    expect(await hub.totalActivities()).to.equal(1n);
  });

  it("rejects activity from an unregistered user", async function () {
    const [owner] = await ethers.getSigners();
    const hub = await ethers.deployContract("AIHub", [owner.address]);

    await expect(
      hub.recordActivity(ethers.id("QUEST_COMPLETED")),
    ).to.be.revertedWith("AIHub: not registered");
  });
});
