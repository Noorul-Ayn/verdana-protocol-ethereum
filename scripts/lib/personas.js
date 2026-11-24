/**
 * Demo accounts ("personas") used by the deploy and interaction scripts.
 *
 *  - On the local Hardhat network they are Hardhat's built-in test accounts #1-#4.
 *  - On Sepolia they are derived deterministically from the deployer's private key, so the
 *    same addresses are used on every run and can be imported into MetaMask for the demo
 *    (see scripts/show-personas.js). They are TEST accounts only: never send real funds.
 *
 * Roles in the demo:
 *   deployer   - Verdana admin, field agent (registrar) and verifier A
 *   verifierB  - the independent second verifier
 *   amina      - smallholder farmer in Musanze (farm 1)
 *   jean       - smallholder farmer in Huye (farm 2)
 *   buyer      - a company buying and retiring credits
 */
const LABELS = ["verifierB", "amina", "jean", "buyer"];
const LOCAL_NETWORKS = ["hardhat", "localhost"];

async function getPersonas(hre) {
  const { ethers, network } = hre;
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) {
    throw new Error(`No deployer account for "${network.name}". Run: npx hardhat vars set SEPOLIA_PRIVATE_KEY`);
  }

  const personas = { deployer };
  if (LOCAL_NETWORKS.includes(network.name)) {
    LABELS.forEach((label, i) => (personas[label] = signers[i + 1]));
  } else {
    const { vars } = require("hardhat/config");
    const rawKey = vars.get("SEPOLIA_PRIVATE_KEY").trim();
    const deployerKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
    for (const label of LABELS) {
      const key = ethers.keccak256(ethers.concat([deployerKey, ethers.toUtf8Bytes(`verdana-demo:${label}`)]));
      personas[label] = new ethers.Wallet(key, ethers.provider);
    }
  }
  return personas;
}

module.exports = { getPersonas, LABELS, LOCAL_NETWORKS };
