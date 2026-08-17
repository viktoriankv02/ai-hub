import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the production-facing AI agent runtime, funded job engine and
 * completion-attestation reporter.
 *
 * The reward token and activity type are deployment parameters so the same
 * module can be reused across testnets and mainnet without baking network-
 * specific addresses or hashes into source control.
 */
export default buildModule("AIAgentStack", (m) => {
  const deployer = m.getAccount(0);
  const rewardToken = m.getParameter<string>("rewardToken");
  const completionActivityType = m.getParameter<string>("completionActivityType");

  const runtime = m.contract("AIAgentRuntime", [deployer]);
  const engine = m.contract("AIAgentEngine", [deployer, runtime, rewardToken]);
  const activityRegistry = m.contract("ActivityRegistry", [deployer]);
  const completionReporter = m.contract("AICompletionReporter", [
    deployer,
    engine,
    activityRegistry,
  ]);

  m.call(engine, "setCompletionReporter", [completionReporter, true]);
  m.call(engine, "setPayoutManager", [deployer, true]);
  m.call(activityRegistry, "setActivityType", [completionActivityType, true]);
  m.call(activityRegistry, "setReporter", [completionReporter, true]);
  m.call(completionReporter, "setCompletionCaller", [deployer, true]);
  m.call(completionReporter, "setAttester", [deployer, true]);

  return {
    runtime,
    engine,
    activityRegistry,
    completionReporter,
  };
});
