import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AIAgentRuntime", function () {
  it("exposes a complete agent view for adapters and indexers", async function () {
    const [owner, agentOwner] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("AIAgentRuntime", owner);
    const runtime = await factory.deploy(owner.address);

    await runtime.connect(agentOwner).registerAgent(
      "builder-agent",
      "https://agent.example",
      "ipfs://metadata",
      "1.0.0",
    );

    await runtime.setVerified(1, true);
    await runtime.connect(agentOwner).startAgent(1);
    await runtime.connect(agentOwner).heartbeat(1);

    const agent = await runtime.getAgent(1);

    expect(agent.id).to.equal(1n);
    expect(agent.owner).to.equal(agentOwner.address);
    expect(agent.name).to.equal("builder-agent");
    expect(agent.endpoint).to.equal("https://agent.example");
    expect(agent.metadataURI).to.equal("ipfs://metadata");
    expect(agent.version).to.equal("1.0.0");
    expect(agent.verified).to.equal(true);
    expect(agent.exists).to.equal(true);
    expect(agent.status).to.equal(1n);
    expect(await runtime.canExecute(1)).to.equal(true);
  });

  it("rejects reads for unknown agents", async function () {
    const [owner] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("AIAgentRuntime", owner);
    const runtime = await factory.deploy(owner.address);

    await expect(runtime.getAgent(999)).to.be.revertedWithCustomError(runtime, "AgentNotFound");
  });
});
