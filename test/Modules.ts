import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AI Hub modules", function () {
  async function deploy() {
    const [owner, user] = await ethers.getSigners();
    const points = await ethers.deployContract("PointsModule", [owner.address]);
    const rewards = await ethers.deployContract("RewardEngine", [owner.address, points.target]);
    const quests = await ethers.deployContract("QuestModule", [owner.address]);
    return { owner, user, points, rewards, quests };
  }

  it("awards and revokes points", async function () {
    const { owner, user, points } = await deploy();
    const reason = ethers.id("QUEST_COMPLETED");

    await points.awardPoints(user.address, 100n, reason);
    expect(await points.pointsOf(user.address)).to.equal(100n);

    await points.revokePoints(user.address, 25n, reason);
    expect(await points.pointsOf(user.address)).to.equal(75n);
    expect(await points.totalPoints()).to.equal(75n);
    expect(await points.owner()).to.equal(owner.address);
  });

  it("uses reward rules to credit the points ledger", async function () {
    const { owner, user, points, rewards } = await deploy();
    const reason = ethers.id("TESTNET_ACTIVITY");

    await points.transferOwnership(rewards.target);
    await rewards.setReward(reason, 50n);
    await rewards.grantReward(user.address, reason);

    expect(await points.pointsOf(user.address)).to.equal(50n);
    expect(await points.owner()).to.equal(rewards.target);
    expect(await rewards.owner()).to.equal(owner.address);
  });

  it("creates and completes a one-time quest", async function () {
    const { user, quests } = await deploy();
    const questId = ethers.id("FIRST_QUEST");
    const activity = ethers.id("SWAP");

    await quests.createQuest(questId, activity, 25n);

    const connected = quests.connect(user);
    expect(await connected.completeQuest(questId)).to.not.be.undefined;
    expect(await quests.hasCompleted(questId, user.address)).to.equal(true);

    await expect(connected.completeQuest(questId)).to.be.revertedWith(
      "Quest: already completed",
    );
  });
});
