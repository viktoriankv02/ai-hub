import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("CrossChainIdentityManager", function () {
  it("resolves a verified address by identity and chain", async function () {
    const [owner, user] = await ethers.getSigners();
    const verification = await ethers.deployContract("VerificationRegistry", [owner.address]);
    const manager = await ethers.deployContract("CrossChainIdentityManager", [
      owner.address,
      verification.target,
    ]);

    const identityId = ethers.id("USER_001");
    const verificationId = ethers.id("VERIFY_BASE");
    const method = ethers.id("OWNER_SIGNATURE");
    const proof = ethers.id("PROOF_001");

    await verification.verify(
      verificationId,
      identityId,
      84532,
      user.address,
      method,
      proof,
    );

    await manager.syncAddress(identityId, 84532, user.address);

    expect(await manager.resolve(identityId, 84532)).to.equal(user.address);
    expect(await verification.isVerified(identityId, 84532)).to.equal(true);
  });

  it("does not sync an unverified address", async function () {
    const [owner, user] = await ethers.getSigners();
    const verification = await ethers.deployContract("VerificationRegistry", [owner.address]);
    const manager = await ethers.deployContract("CrossChainIdentityManager", [
      owner.address,
      verification.target,
    ]);

    await expect(
      manager.syncAddress(ethers.id("USER_002"), 42161, user.address),
    ).to.be.revertedWith("IdentityManager: not verified");
  });

  it("revokes verification and clears the active lookup", async function () {
    const [owner, user] = await ethers.getSigners();
    const verification = await ethers.deployContract("VerificationRegistry", [owner.address]);
    const manager = await ethers.deployContract("CrossChainIdentityManager", [
      owner.address,
      verification.target,
    ]);

    const identityId = ethers.id("USER_003");
    const verificationId = ethers.id("VERIFY_ARB");

    await verification.verify(
      verificationId,
      identityId,
      42161,
      user.address,
      ethers.id("SIGNATURE"),
      ethers.id("PROOF"),
    );
    await manager.syncAddress(identityId, 42161, user.address);
    expect(await manager.resolve(identityId, 42161)).to.equal(user.address);

    await verification.revoke(verificationId);
    expect(await verification.isVerified(identityId, 42161)).to.equal(false);
  });
});
