import { expect } from "chai";
import { HttpCheckInExecutor, parseHttpCheckInTargetsJson } from "../agents/drop-hunter/http-check-in-executor.js";

const context = {
  projectId: "project-a",
  projectName: "Project A",
  projectScore: 90,
  taskId: "checkin",
  taskKind: "check-in" as const,
  title: "Daily check-in",
  source: "official",
};

describe("HttpCheckInExecutor", () => {
  it("completes only a configured HTTPS target with the expected response", async () => {
    const executor = new HttpCheckInExecutor({
      targets: [{ projectId: "project-a", url: "https://project.example/check-in", successText: "ok" }],
      fetcher: async () => ({ status: 200, text: async () => "ok" }),
    });
    const result = await executor.execute(context);
    expect(result.status).to.equal("completed");
  });

  it("skips projects without an allowlisted target", async () => {
    const executor = new HttpCheckInExecutor({
      targets: [{ projectId: "another", url: "https://project.example/check-in" }],
      fetcher: async () => ({ status: 200, text: async () => "ok" }),
    });
    const result = await executor.execute(context);
    expect(result.status).to.equal("skipped");
  });

  it("rejects insecure or credential-bearing targets", () => {
    expect(() => new HttpCheckInExecutor({ targets: [{ projectId: "p", url: "http://project.example" }] })).to.throw("HTTPS");
    expect(() => new HttpCheckInExecutor({ targets: [{ projectId: "p", url: "https://user:pass@project.example" }] })).to.throw("credentials");
  });

  it("parses strict JSON configuration", () => {
    const targets = parseHttpCheckInTargetsJson('[{"projectId":"p","url":"https://project.example","method":"POST","successStatus":204}]');
    expect(targets).to.deep.equal([{ projectId: "p", url: "https://project.example", method: "POST", successStatus: 204, successText: undefined }]);
  });
});
