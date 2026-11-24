/**
 * Prints the demo accounts' addresses and private keys so you can import them into MetaMask
 * and act as each role in the dApp (verifier B, farmer Amina, buyer...).
 *
 *   npx hardhat run scripts/show-personas.js --network sepolia
 *
 * These are TEST accounts derived from your Sepolia deployer key. Never send real funds to
 * them, never use them on Mainnet, and don't share this output publicly.
 */
const hre = require("hardhat");
const { getPersonas, LOCAL_NETWORKS } = require("./lib/personas");

const ROLES = {
  deployer: "Admin + field agent + verifier A (your own MetaMask account)",
  verifierB: "Verifier B (second, independent verifier)",
  amina: "Farmer Amina, Musanze (farm 1)",
  jean: "Farmer Jean, Huye (farm 2)",
  buyer: "Buyer (company that buys and retires credits)",
};

async function main() {
  const p = await getPersonas(hre);
  const local = LOCAL_NETWORKS.includes(hre.network.name);
  const balances = await Promise.all(Object.keys(ROLES).map((k) => hre.ethers.provider.getBalance(p[k].address)));
  console.log(`Demo accounts on ${hre.network.name} (TEST ONLY - never send real funds)\n`);
  Object.keys(ROLES).forEach((k, i) => {
    console.log(`${ROLES[k]}`);
    console.log(`   address : ${p[k].address}   (${hre.ethers.formatEther(balances[i])} ETH)`);
    if (k !== "deployer") console.log(`   key     : ${local ? "(Hardhat test account, see `npx hardhat node`)" : p[k].privateKey}`);
    console.log("");
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
