import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { ethers, network } from "hardhat";

/**
 * Deploys RewardPool, CosmeticNFT, and TournamentEscrow to the
 * configured Hardhat network and writes the resulting addresses to
 * `contracts/deployments/<network>.json`.
 *
 * The script is intended for local / ephemeral deployments only.
 * Production deployment to a live chain is intentionally out of
 * scope for this feature.
 */
async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const adminAddress = process.env.ADMIN_ADDRESS ?? deployer.address;
  const signerAddress = process.env.SIGNER_ADDRESS ?? deployer.address;
  const baseURI = process.env.COSMETIC_BASE_URI ?? "ipfs://placeholder/";

  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`Deploying as ${deployer.address} on ${network.name} (chainId=${chainId})`);
  console.log(`  ADMIN_ROLE  -> ${adminAddress}`);
  console.log(`  SIGNER_ROLE -> ${signerAddress}`);

  const RewardPool = await ethers.getContractFactory("RewardPool");
  const rewardPool = await RewardPool.deploy(adminAddress, signerAddress);
  await rewardPool.waitForDeployment();
  const rewardPoolAddress = await rewardPool.getAddress();
  console.log(`RewardPool        deployed at ${rewardPoolAddress}`);

  const CosmeticNFT = await ethers.getContractFactory("CosmeticNFT");
  const cosmeticNFT = await CosmeticNFT.deploy(baseURI, adminAddress);
  await cosmeticNFT.waitForDeployment();
  const cosmeticNFTAddress = await cosmeticNFT.getAddress();
  console.log(`CosmeticNFT       deployed at ${cosmeticNFTAddress}`);

  const TournamentEscrow = await ethers.getContractFactory("TournamentEscrow");
  const tournamentEscrow = await TournamentEscrow.deploy(adminAddress, signerAddress);
  await tournamentEscrow.waitForDeployment();
  const tournamentEscrowAddress = await tournamentEscrow.getAddress();
  console.log(`TournamentEscrow  deployed at ${tournamentEscrowAddress}`);

  const out = {
    network: network.name,
    chainId: Number(chainId),
    deployer: deployer.address,
    admin: adminAddress,
    signer: signerAddress,
    deployedAt: new Date().toISOString(),
    contracts: {
      RewardPool: rewardPoolAddress,
      CosmeticNFT: cosmeticNFTAddress,
      TournamentEscrow: tournamentEscrowAddress,
    },
  };

  const outputPath = join(__dirname, "..", "deployments", `${network.name}.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
