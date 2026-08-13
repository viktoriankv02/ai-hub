import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AIJobReceiptRegistry", function () {
  async function deploy() {
    const [owner, reporter, attacker, creator, attester] = await ethers.getSigners();
    const registry = await ethers.deployContract("AIJobReceiptRegistry", [await owner.getAddress()]);
    await registry.waitForDeployment();
    await (await registry.connect(owner).setReporter(await reporter.getAddress(), true)).wait();
    return { owner, reporter, attacker, creator, attester, registry };
  }

  async function record(registry: any, reporter: any, creator: any, attester: any, jobId = 1n, receiptHash = ethers.id("RECEIPT_1")) {
    return registry.connect(reporter).recordReceipt(
      jobId,
      7n,
      await creator.getAddress(),
      await attester.getAddress(),
      ethers.id("TASK_1"),
      ethers.id("RESULT_1"),
      ethers.id("OUTPUT_1"),
      ethers.id("META_1"),
      1000n,
      receiptHash,
    );
  }

  it("records and exposes a valid receipt", async function () {
    const { reporter, creator, attester, registry } = await deploy();
    await (await record(registry, reporter, creator, attester)).wait();

    expect(await registry.hasReceipt(1n)).to.equal(true);
    expect(await registry.isValidReceipt(1n)).to.equal(true);
    expect(await registry.receiptJobId(ethers.id("RECEIPT_1"))).to.equal(1n);

    const receipt = await registry.getReceipt(1n);
    expect(receipt.jobId).to.equal(1n);
    expect(receipt.agentId).to.equal(7n);
    expect(receipt.jobCreator).to.equal(await creator.getAddress());
    expect(receipt.attester).to.equal(await attester.getAddress());
    expect(receipt.resultHash).to.equal(ethers.id("RESULT_1"));
    expect(receipt.status).to.equal(1n);
    expect(receipt.exists).to.equal(true);
  });

  it("rejects an unauthorized reporter", async function () {
    const { attacker, creator, attester, registry } = await deploy();
    await expect(
      record(registry, attacker, creator, attester),
    ).to.be.revertedWithCustomError(registry, "UnauthorizedReporter");
  });

  it("prevents duplicate jobs and receipt hashes", async function () {
    const { reporter, creator, attester, registry } = await deploy();
    await (await record(registry, reporter, creator, attester)).wait();

    await expect(
      record(registry, reporter, creator, attester, 1n, ethers.id("RECEIPT_2")),
    ).to.be.revertedWithCustomError(registry, "ReceiptAlreadyExists");

    await expect(
      record(registry, reporter, creator, attester, 2n, ethers.id("RECEIPT_1")),
    ).to.be.revertedWithCustomError(registry, "ReceiptAlreadyExists");
  });

  it("can revoke a receipt without deleting the audit record", async function () {
    const { owner, reporter, creator, attester, registry } = await deploy();
    const receiptHash = ethers.id("RECEIPT_REVOKE");
    await (await record(registry, reporter, creator, attester, 9n, receiptHash)).wait();

    await (await registry.connect(owner).revokeReceipt(9n, receiptHash)).wait();

    expect(await registry.hasReceipt(9n)).to.equal(true);
    expect(await registry.isValidReceipt(9n)).to.equal(false);
    expect((await registry.getReceipt(9n)).status).to.equal(2n);
  });

  it("rejects malformed receipts", async function () {
    const { reporter, creator, attester, registry } = await deploy();
    await expect(
      registry.connect(reporter).recordReceipt(
        0n,
        7n,
        await creator.getAddress(),
        await attester.getAddress(),
        ethers.id("TASK"),
        ethers.id("RESULT"),
        ethers.id("OUTPUT"),
        ethers.id("META"),
        1000n,
        ethers.id("RECEIPT"),
      ),
    ).to.be.revertedWithCustomError(registry, "InvalidReceipt");
  });
});
