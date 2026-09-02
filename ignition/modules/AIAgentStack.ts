import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the production-facing AI agent runtime, funded job engine and
 * completion-attestation reporter.
 *
 * The reward token is deliberately supplied as a deployment parameter rather
 * than deployed here. This keeps the stack usable with an existing treasury
 * token on testnets and mainnet.
 */
export default buildModule("AIAgentStack", (m) => {
  const deployer = m.getAccount(0);
  const rewardToken = m.getParameter<string>("rewardToken");

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

  m.call(activityRegistry, "setActivityType", [
    "0x0000000000000000000000000000000000000000000000000000000000000000",
    false,
  ]);
  m.call(activityRegistry, "setActivityType", [
    "0x0000000000000000000000000000000000000000000000000000000000000001",
    true,
  ]);
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
