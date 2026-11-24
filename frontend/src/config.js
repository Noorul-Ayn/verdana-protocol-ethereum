/**
 * Network and contract configuration for the Verdana dApp.
 *
 * The ABIs and addresses in ./contracts are written by `scripts/deploy.js` every time the
 * contracts are deployed, so the frontend always talks to the latest deployment.
 */
import deployments from "./contracts/deployments.json";
import registryArtifact from "./contracts/VerdanaRegistry.json";
import tokenArtifact from "./contracts/VerdanaCarbonCredit.json";
import marketArtifact from "./contracts/VerdanaMarketplace.json";

export const REGISTRY_ABI = registryArtifact.abi;
export const TOKEN_ABI = tokenArtifact.abi;
export const MARKET_ABI = marketArtifact.abi;

const LOCAL_RPC = import.meta.env.VITE_LOCAL_RPC_URL || "http://127.0.0.1:8545";
const SEPOLIA_RPC = import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

/** Networks the dApp knows how to use. */
export const CHAINS = {
  31337: {
    id: 31337,
    name: "Hardhat Local",
    rpcUrl: LOCAL_RPC,
    explorer: null,
    addParams: {
      chainId: "0x7a69",
      chainName: "Hardhat Local",
      rpcUrls: [LOCAL_RPC],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
  },
  11155111: {
    id: 11155111,
    name: "Sepolia Testnet",
    rpcUrl: SEPOLIA_RPC,
    explorer: "https://sepolia.etherscan.io",
    addParams: {
      chainId: "0xaa36a7",
      chainName: "Sepolia",
      rpcUrls: [SEPOLIA_RPC],
      nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
      blockExplorerUrls: ["https://sepolia.etherscan.io"],
    },
  },
};

/** Friendly names for other networks a wallet might be on (used in the wrong-network banner). */
export const OTHER_NETWORK_NAMES = {
  1: "Ethereum Mainnet",
  17000: "Holesky Testnet",
  560048: "Hoodi Testnet",
  137: "Polygon",
  8453: "Base",
  10: "Optimism",
  42161: "Arbitrum One",
  56: "BNB Smart Chain",
};

export function networkName(chainId) {
  return CHAINS[chainId]?.name ?? OTHER_NETWORK_NAMES[chainId] ?? `network ${chainId}`;
}

/** The deployment record (addresses, demo accounts, settings) for a chain, or null. */
export function getDeployment(chainId) {
  return deployments[String(chainId)] ?? null;
}

/** Chains that are both known to the dApp and have a deployment. */
export const DEPLOYED_CHAIN_IDS = Object.keys(deployments)
  .map(Number)
  .filter((id) => CHAINS[id]);

/**
 * The network used for read-only access when no wallet is connected. Sepolia is preferred
 * when deployed, because anyone can reach it. Override with VITE_DEFAULT_CHAIN_ID.
 */
export const DEFAULT_CHAIN_ID =
  Number(import.meta.env.VITE_DEFAULT_CHAIN_ID) ||
  (DEPLOYED_CHAIN_IDS.includes(11155111) ? 11155111 : DEPLOYED_CHAIN_IDS[0] ?? 31337);

export function isSupportedChain(chainId) {
  return Boolean(CHAINS[chainId] && getDeployment(chainId));
}

export function explorerUrl(chainId, kind, value) {
  const base = CHAINS[chainId]?.explorer;
  return base ? `${base}/${kind}/${value}` : null;
}
