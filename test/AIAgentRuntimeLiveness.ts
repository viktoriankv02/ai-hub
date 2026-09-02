import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AIAgentRuntime liveness", function () {
  it("keeps heartbeat protection disabled by default", async function () {
    const [owner, user] = await ethers.getSigners();
    const runtime = await ethers.deployContract("AIAgentRuntime", [owner.address]);
    await runtime.connect(user).registerAgent("Worker", "endpoint", "metadata", "1.0.0");
    await runtime.connect(owner).setVerified(1, true);
    await runtime.connect(user).startAgent(1);

    expect(await runtime.heartbeatTimeout()).to.equal(0n);
    expect(await runtime.canExecute(1)).to.equal(true);
    expect(await runtime.heartbeatDeadline(1)).to.equal(0n);
  });

  it("disables execution after a stale heartbeat and restores it on heartbeat", async function () {
    const [owner, user] = await ethers.getSigners();
    const runtime = await ethers.deployContract("AIAgentRuntime", [owner.address]);
    await runtime.connect(user).registerAgent("Worker", "endpoint", "metadata", "1.0.0");
    await runtime.connect(owner).setVerified(1, true);
    await runtime.connect(user).startAgent(1);
    await runtime.connect(owner).setHeartbeatTimeout(60);

    const heartbeatAt = await runtime.agentHeartbeatAt(1);
    expect(await runtime.heartbeatDeadline(1)).to.equal(heartbeatAt + 60n);
    expect(await runtime.canExecute(1)).to.equal(true);

    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);
    expect(await runtime.canExecute(1)).to.equal(false);

    await runtime.connect(user).heartbeat(1);
    expect(await runtime.canExecute(1)).to.equal(true);
  });
});
