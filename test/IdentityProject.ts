import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("IdentityRegistry and ProjectRegistry", function () {
  it("creates an identity and links an EVM address", async function () {
    const [owner, user, linked] = await ethers.getSigners();
    const identity = await ethers.deployContract("IdentityRegistry", [owner.address]);
    const identityId = ethers.id("USER_001");

    await identity.connect(user).createIdentity(identityId);
    await identity.connect(user).linkAddress(84532, linked.address);

    const result = await identity.getIdentity(user.address);
    expect(result.identityId).to.equal(identityId);
    expect(result.active).to.equal(true);
    expect(await identity.identityOwner(identityId)).to.equal(user.address);
    expect(await identity.linkedAddress(user.address, 84532)).to.equal(linked.address);
  });

  it("prevents duplicate identity IDs", async function () {
    const [owner, user, other] = await ethers.getSigners();
    const identity = await ethers.deployContract("IdentityRegistry", [owner.address]);
    const identityId = ethers.id("DUPLICATE");

    await identity.connect(user).createIdentity(identityId);
    await expect(identity.connect(other).createIdentity(identityId)).to.be.revertedWith(
      "Identity: ID taken",
    );
  });

  it("registers projects and supported chains", async function () {
    const [owner] = await ethers.getSigners();
    const projects = await ethers.deployContract("ProjectRegistry", [owner.address]);
    const projectId = ethers.id("PROJECT_A");
    const nameHash = ethers.id("AI_HUB_DEMO");

    await projects.createProject(projectId, nameHash);
    await projects.setSupportedChain(projectId, 84532, true);

    const project = await projects.getProject(projectId);
    expect(project.projectId).to.equal(projectId);
    expect(project.active).to.equal(true);
    expect(await projects.supportedChains(projectId, 84532)).to.equal(true);
  });
});
