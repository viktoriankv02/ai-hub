import { expect } from "chai";
import { validateNetwork } from "../deploy/config/validate";

describe("Base Mainnet deployment gate", function () {
  const original = process.env.AI_HUB_ALLOW_MAINNET_DEPLOYMENT;

  afterEach(function () {
    if (original === undefined) delete process.env.AI_HUB_ALLOW_MAINNET_DEPLOYMENT;
    else process.env.AI_HUB_ALLOW_MAINNET_DEPLOYMENT = original;
  });

  it("refuses Base Mainnet by default", function () {
    delete process.env.AI_HUB_ALLOW_MAINNET_DEPLOYMENT;

    expect(() => validateNetwork("base")).to.throw(
      "Base Mainnet requires AI_HUB_ALLOW_MAINNET_DEPLOYMENT=true",
    );
  });

  it("allows Base Mainnet only with the explicit gate", function () {
    process.env.AI_HUB_ALLOW_MAINNET_DEPLOYMENT = "true";

    expect(() => validateNetwork("base")).not.to.throw();
  });

  it("keeps testnets available without the gate", function () {
    delete process.env.AI_HUB_ALLOW_MAINNET_DEPLOYMENT;

    expect(() => validateNetwork("baseSepolia")).not.to.throw();
  });
});
