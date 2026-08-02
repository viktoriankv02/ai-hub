import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AIHubStack", (m) => {
  const deployer = m.getAccount(0);

  const points = m.contract("PointsModule", [deployer]);
  const rewards = m.contract("RewardEngine", [deployer, points]);
  const hub = m.contract("AIHub", [deployer]);
  const quests = m.contract("QuestModule", [deployer]);

  // RewardEngine becomes the authorized writer to the points ledger.
  m.call(points, "transferOwnership", [rewards]);

  return { hub, points, quests, rewards };
});
