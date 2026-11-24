/**
 * Shared helpers: load a deployment record and attach to the three contracts.
 */
const fs = require("fs");
const path = require("path");

const FRONTEND_DEPLOYMENTS = path.join(__dirname, "..", "..", "frontend", "src", "contracts", "deployments.json");

function readDeployment(chainId) {
  if (!fs.existsSync(FRONTEND_DEPLOYMENTS)) return null;
  return JSON.parse(fs.readFileSync(FRONTEND_DEPLOYMENTS, "utf8"))[String(chainId)] ?? null;
}

async function attach(hre) {
  const { ethers, network } = hre;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const deployment = readDeployment(chainId);
  if (!deployment) throw new Error(`No Verdana deployment for "${network.name}". Run scripts/deploy.js first.`);
  return {
    chainId,
    deployment,
    token: await ethers.getContractAt("VerdanaCarbonCredit", deployment.contracts.VerdanaCarbonCredit),
    registry: await ethers.getContractAt("VerdanaRegistry", deployment.contracts.VerdanaRegistry),
    market: await ethers.getContractAt("VerdanaMarketplace", deployment.contracts.VerdanaMarketplace),
  };
}

module.exports = { FRONTEND_DEPLOYMENTS, readDeployment, attach };
