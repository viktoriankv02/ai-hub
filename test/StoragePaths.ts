import { expect } from "chai";
import { aiHubDataDir, aiHubDataPath, configuredPath } from "../agents/ai-jobs/storage-paths.js";

describe("AI Hub storage paths", function () {
  const original = process.env.AI_HUB_DATA_DIR;
  const originalStore = process.env.AI_JOB_STORE;

  afterEach(function () {
    if (original === undefined) delete process.env.AI_HUB_DATA_DIR;
    else process.env.AI_HUB_DATA_DIR = original;

    if (originalStore === undefined) delete process.env.AI_JOB_STORE;
    else process.env.AI_JOB_STORE = originalStore;
  });

  it("uses an explicit data directory", function () {
    process.env.AI_HUB_DATA_DIR = "D:\\ai-hub-data";
    expect(aiHubDataDir()).to.equal("D:\\ai-hub-data");
    expect(aiHubDataPath("jobs.json")).to.equal("D:\\ai-hub-data\\jobs.json");
  });

  it("allows an explicit per-store path to override the data directory", function () {
    process.env.AI_HUB_DATA_DIR = "D:\\ai-hub-data";
    process.env.AI_JOB_STORE = "D:\\fast-ai-jobs\\jobs.json";
    expect(configuredPath("AI_JOB_STORE", "ai-jobs.json")).to.equal("D:\\fast-ai-jobs\\jobs.json");
  });
});
