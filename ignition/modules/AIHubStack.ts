import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AIHubStack", (m) => {
  const deployer = m.getAccount(0);

  const points = m.contract("PointsModule", [deployer]);
  const rewards = m.contract("RewardEngine", [deployer, points]);
  const policyEngine = m.contract("RewardPolicyEngine", [deployer, points]);
  const hub = m.contract("AIHub", [deployer]);
  const quests = m.contract("QuestModule", [deployer]);
  const activityRegistry = m.contract("ActivityRegistry", [deployer]);
  const activityReporter = m.contract("ActivityReporter", [deployer, activityRegistry]);
  const identityRegistry = m.contract("IdentityRegistry", [deployer]);
  const projectRegistry = m.contract("ProjectRegistry", [deployer]);
  const verificationRegistry = m.contract("VerificationRegistry", [deployer]);
  const crossChainIdentity = m.contract("CrossChainIdentityManager", [
    deployer,
    verificationRegistry,
  ]);

  // The policy engine is the authorized writer for deterministic activity rewards.
  // RewardEngine remains deployed as the simpler administrative reward path.
  m.call(points, "transferOwnership", [policyEngine]);
  m.call(activityRegistry, "setActivityType", ["0x0000000000000000000000000000000000000000000000000000000000000001", true]);
  m.call(activityRegistry, "setActivityType", ["0x0000000000000000000000000000000000000000000000000000000000000002", true]);
  m.call(activityRegistry, "setActivityType", ["0x0000000000000000000000000000000000000000000000000000000000000003", true]);
  m.call(activityReporter, "setReporter", [deployer, true]);

  return {
    hub,
    points,
    quests,
    rewards,
    policyEngine,
    activityRegistry,
    activityReporter,
    identityRegistry,
    projectRegistry,
    verificationRegistry,
    crossChainIdentity,
  };
});
