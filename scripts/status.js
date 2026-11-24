/**
 * Prints the current state of a deployed Verdana Protocol. Read-only: needs no private key,
 * so anyone can check the Sepolia deployment.
 *
 *   npx hardhat run scripts/status.js --network sepolia
 */
const hre = require("hardhat");
const { attach } = require("./lib/deployment");

const STATUS = ["None", "Pending", "Approved", "Rejected"];

async function main() {
  const { ethers, network } = hre;
  const { token, registry, market, chainId, deployment } = await attach(hre);
  const vcc = (u) => `${ethers.formatUnits(u, 18)} VCC`;
  const eth = (w) => `${ethers.formatEther(w)} ETH`;

  console.log(`Verdana Protocol on ${network.name} (chain ${chainId}), deployed ${deployment.deployedAt}`);
  for (const [name, address] of Object.entries(deployment.contracts)) console.log(`  ${name.padEnd(20)} ${address}`);

  const farmCount = await registry.farmCount();
  console.log(`\nFarms (${farmCount})`);
  for (let i = 1n; i <= farmCount; i++) {
    const f = await registry.getFarm(i);
    console.log(`  #${i} ${f.region.padEnd(18)} ${(Number(f.areaHectaresX100) / 100).toFixed(2)} ha  farmer ${f.farmer}  net ${f.issuedKg} kg  ${f.active ? "active" : "inactive"}`);
  }

  const readingCount = await registry.readingCount();
  console.log(`\nMRV reports (${readingCount})`);
  for (let i = 1n; i <= readingCount; i++) {
    const r = await registry.getReading(i);
    console.log(`  #${i} farm #${r.farmId} ${r.period}: gross ${r.grossKg} - baseline ${r.baselineKg} -> net ${r.netKg} kg  ${STATUS[Number(r.status)]}  (submitted ${r.submittedBy.slice(0, 8)}..., reviewed ${r.reviewedBy.slice(0, 8)}...)`);
  }

  console.log("\nTotals");
  console.log(`  Net CO2e verified       : ${await registry.totalIssuedKg()} kg`);
  console.log(`  Credits in circulation  : ${vcc(await token.totalSupply())}`);
  console.log(`  Buffer pool             : ${vcc(await registry.bufferPoolBalance())}`);
  console.log(`  Retired / cancelled     : ${vcc(await token.totalRetired())} / ${vcc(await token.totalCancelled())}`);
  console.log(`  Paid by buyers          : ${eth(await market.totalVolumeWei())} (farmers ${eth(await market.totalToFarmersWei())}, programme ${eth(await market.totalToProgrammeWei())})`);
  console.log(`  Committed funding locked: ${eth(await market.totalCommittedWei())}`);
  console.log(`  Offtakes / listings / retirement certificates: ${await market.offtakeCount()} / ${await market.listingCount()} / ${await token.retirementCount()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
