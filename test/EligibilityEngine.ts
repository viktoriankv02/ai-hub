import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("EligibilityEngine", function () {
  it("enforces initialization, verification and claim limits", async function () {
    const [owner, user] = await ethers.getSigners();
    const engine = await ethers.deployContract("EligibilityEngine", [owner.address]);
    const ruleId = ethers.id("BASE_SWAP");

    await engine.setRule(ruleId, 0, 0, 1, 100, true, true);

    let result = await engine.canConsume(ruleId, user.address, 50n, true);
    expect(result[0]).to.equal(false);
    expect(result[1]).to.equal(ethers.encodeBytes32String("NOT_INITIALIZED"));

    await engine.initialize(ruleId, user.address);

    result = await engine.canConsume(ruleId, user.address, 50n, false);
    expect(result[0]).to.equal(false);
    expect(result[1]).to.equal(ethers.encodeBytes32String("VERIFICATION_REQUIRED"));

    result = await engine.canConsume(ruleId, user.address, 50n, true);
    expect(result[0]).to.equal(true);

    await engine.consume(ruleId, user.address, 50n, true);

    result = await engine.canConsume(ruleId, user.address, 50n, true);
    expect(result[0]).to.equal(false);
    expect(result[1]).to.equal(ethers.encodeBytes32String("CLAIM_LIMIT"));
  });

  it("enforces cooldown and block status", async function () {
    const [owner, user] = await ethers.getSigners();
    const engine = await ethers.deployContract("EligibilityEngine", [owner.address]);
    const ruleId = ethers.id("BRIDGE");

    await engine.setRule(ruleId, 0, 3600, 10, 1000, false, true);
    await engine.initialize(ruleId, user.address);
    await engine.consume(ruleId, user.address, 100, false);

    let result = await engine.canConsume(ruleId, user.address, 100n, false);
    expect(result[0]).to.equal(false);
    expect(result[1]).to.equal(ethers.encodeBytes32String("COOLDOWN"));

    await engine.setBlocked(user.address, true);
    result = await engine.canConsume(ruleId, user.address, 100n, false);
    expect(result[0]).to.equal(false);
    expect(result[1]).to.equal(ethers.encodeBytes32String("BLOCKED"));
  });
});
