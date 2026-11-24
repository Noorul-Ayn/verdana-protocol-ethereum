/**
 * Deploys Verdana Protocol and wires the contracts together.
 *
 *   1. VerdanaCarbonCredit (ERC-20 "VCC", 1 VCC = 1 tonne CO2e)
 *   2. VerdanaRegistry     (farms, readings, two-verifier approval, minting)
 *   3. VerdanaMarketplace  (committed funding + open market, 80/20 benefit sharing)
 *   4. Grants roles: registry -> MINTER_ROLE on the token; deployer -> registrar + verifier A;
 *      demo persona -> verifier B
 *   5. Approves the demo carbon-accounting methodology (10% leakage deduction)
 *   6. Exports the ABIs and addresses to frontend/src/contracts/ for the dApp.
 *
 * Local:   npx hardhat node   then   npx hardhat run scripts/deploy.js --network localhost
 * Sepolia: npx hardhat vars set SEPOLIA_PRIVATE_KEY   then   npx hardhat run scripts/deploy.js --network sepolia
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { getPersonas, LOCAL_NETWORKS } = require("./lib/personas");
const { FRONTEND_DEPLOYMENTS } = require("./lib/deployment");

// Plausibility cap: 5,000 kg CO2e per hectare per quarter (= 20 t/ha/year), generous for
// agroforestry, so honest readings pass and inflated ones are rejected.
const MAX_KG_PER_HECTARE_PER_QUARTER = 5000;
// 10% of every issuance is held in the permanence buffer pool.
const BUFFER_BPS = 1000;
// 80% of every sale goes to the farmer, 20% to the programme fund (the contract enforces >= 70%).
const FARMER_SHARE_BPS = 8000;
// Demo methodology. A real programme would use a recognised, peer-reviewed methodology.
const METHODOLOGY = { code: "VDN-AGF-01", name: "VDN-AGF-01 Agroforestry biomass growth (demo methodology)", leakageBps: 1000 };
const EXPLORERS = { 11155111: "https://sepolia.etherscan.io" };

async function main() {
  const { ethers, network } = hre;
  const p = await getPersonas(hre);
  const { deployer } = p;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const confirmations = LOCAL_NETWORKS.includes(network.name) ? 1 : 2;
  const explorer = EXPLORERS[chainId];
  const wait = async (txPromise) => (await txPromise).wait(confirmations);

  console.log(`Network  : ${network.name} (chain ID ${chainId})`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // 1-3. Deploy
  const token = await ethers.deployContract("VerdanaCarbonCredit", [deployer.address]);
  await token.waitForDeployment();
  const deployBlock = (await token.deploymentTransaction().wait(confirmations)).blockNumber;
  console.log("VerdanaCarbonCredit deployed to:", await token.getAddress());

  const registry = await ethers.deployContract("VerdanaRegistry", [
    deployer.address,
    await token.getAddress(),
    MAX_KG_PER_HECTARE_PER_QUARTER,
    BUFFER_BPS,
  ]);
  await registry.waitForDeployment();
  await registry.deploymentTransaction().wait(confirmations);
  console.log("VerdanaRegistry     deployed to:", await registry.getAddress());

  // The programme fund is the deployer's wallet in this demo; in production it would be a multisig.
  const market = await ethers.deployContract("VerdanaMarketplace", [await token.getAddress(), deployer.address, FARMER_SHARE_BPS]);
  await market.waitForDeployment();
  await market.deploymentTransaction().wait(confirmations);
  console.log("VerdanaMarketplace  deployed to:", await market.getAddress());

  // 4. Roles
  console.log("\nGranting roles...");
  await wait(token.grantRole(await token.MINTER_ROLE(), await registry.getAddress()));
  console.log("  MINTER_ROLE    -> VerdanaRegistry (only the registry can create credits)");
  await wait(registry.grantRole(await registry.REGISTRAR_ROLE(), deployer.address));
  console.log("  REGISTRAR_ROLE -> deployer (field agent)");
  await wait(registry.grantRole(await registry.VERIFIER_ROLE(), deployer.address));
  console.log("  VERIFIER_ROLE  -> deployer (verifier A)");
  await wait(registry.grantRole(await registry.VERIFIER_ROLE(), p.verifierB.address));
  console.log(`  VERIFIER_ROLE  -> ${p.verifierB.address} (verifier B)`);

  const methodologyId = ethers.keccak256(ethers.toUtf8Bytes(METHODOLOGY.code));
  await wait(registry.addMethodology(methodologyId, METHODOLOGY.name, METHODOLOGY.leakageBps));
  console.log(`\nMethodology approved: ${METHODOLOGY.name} (leakage ${METHODOLOGY.leakageBps / 100}%)`);
  console.log(`Permanence buffer: ${BUFFER_BPS / 100}% of each issuance | Benefit sharing: ${FARMER_SHARE_BPS / 100}% farmer / ${100 - FARMER_SHARE_BPS / 100}% programme fund`);

  // 5. Export for the frontend
  const contracts = {
    VerdanaCarbonCredit: await token.getAddress(),
    VerdanaRegistry: await registry.getAddress(),
    VerdanaMarketplace: await market.getAddress(),
  };
  const record = {
    network: network.name,
    chainId,
    deployedAt: new Date().toISOString(),
    deployBlock,
    contracts,
    accounts: {
      admin: deployer.address,
      programmeFund: deployer.address,
      verifierA: deployer.address,
      verifierB: p.verifierB.address,
      amina: p.amina.address,
      jean: p.jean.address,
      buyer: p.buyer.address,
    },
    maxKgPerHectarePerQuarter: MAX_KG_PER_HECTARE_PER_QUARTER,
    bufferBps: BUFFER_BPS,
    farmerShareBps: FARMER_SHARE_BPS,
    methodology: { id: methodologyId, ...METHODOLOGY },
  };

  if (network.name !== "hardhat") {
    const dir = path.dirname(FRONTEND_DEPLOYMENTS);
    fs.mkdirSync(dir, { recursive: true });
    for (const name of Object.keys(contracts)) {
      const { contractName, abi } = hre.artifacts.readArtifactSync(name);
      fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ contractName, abi }, null, 2) + "\n");
    }
    const all = fs.existsSync(FRONTEND_DEPLOYMENTS) ? JSON.parse(fs.readFileSync(FRONTEND_DEPLOYMENTS, "utf8")) : {};
    all[String(chainId)] = record;
    fs.writeFileSync(FRONTEND_DEPLOYMENTS, JSON.stringify(all, null, 2) + "\n");
    console.log("\nABIs and addresses exported to", path.relative(process.cwd(), FRONTEND_DEPLOYMENTS));
  }

  console.log("\nDeployment summary");
  console.log(`  Admin / field agent / verifier A : ${deployer.address}`);
  console.log(`  Verifier B                       : ${p.verifierB.address}`);
  console.log(`  Programme fund                   : ${deployer.address}`);
  console.log(`  Minter of VCC                    : ${contracts.VerdanaRegistry} (registry only)`);

  if (explorer) {
    console.log("\nView on Etherscan:");
    for (const [name, address] of Object.entries(contracts)) console.log(`  ${name.padEnd(20)} ${explorer}/address/${address}`);
    console.log("\nVerify the source code on Etherscan (needs ETHERSCAN_API_KEY):");
    console.log(`  npx hardhat verify --network ${network.name} ${contracts.VerdanaCarbonCredit} ${deployer.address}`);
    console.log(`  npx hardhat verify --network ${network.name} ${contracts.VerdanaRegistry} ${deployer.address} ${contracts.VerdanaCarbonCredit} ${MAX_KG_PER_HECTARE_PER_QUARTER} ${BUFFER_BPS}`);
    console.log(`  npx hardhat verify --network ${network.name} ${contracts.VerdanaMarketplace} ${contracts.VerdanaCarbonCredit} ${deployer.address} ${FARMER_SHARE_BPS}`);
  }
  console.log("\nNext: run the end-to-end demo with  npx hardhat run scripts/interact.js --network " + network.name);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
