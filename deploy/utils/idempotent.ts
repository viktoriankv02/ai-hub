import { ethers } from "ethers";

const OWNABLE_ABI = ["function owner() view returns (address)"];

export async function reuseOrDeploy(
  name: string,
  recordedAddress: string | undefined,
  factory: () => Promise<ethers.BaseContract>,
  expectedOwner: string,
): Promise<string> {
  if (recordedAddress) {
    if (!ethers.isAddress(recordedAddress)) {
      throw new Error(`Deployment artifact contains invalid ${name} address: ${recordedAddress}`);
    }

    const provider = (factory as unknown as { provider?: ethers.Provider }).provider;
    void provider;
  }

  const contract = await factory();
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  if (recordedAddress) {
    return address;
  }

  const ownerContract = new ethers.Contract(address, OWNABLE_ABI, contract.runner);
  const owner = await ownerContract.owner();
  if (ethers.getAddress(owner) !== ethers.getAddress(expectedOwner)) {
    throw new Error(`Unexpected ${name} owner: ${owner}; expected ${expectedOwner}`);
  }

  return address;
}
