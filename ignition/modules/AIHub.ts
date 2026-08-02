import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AIHubModule", (m) => {
  const deployer = m.getAccount(0);
  const hub = m.contract("AIHub", [deployer]);

  return { hub };
});
