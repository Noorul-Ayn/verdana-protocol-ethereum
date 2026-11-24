require("@nomicfoundation/hardhat-toolbox");
const { vars } = require("hardhat/config");

/**
 * Hardhat configuration for Verdana Protocol (Ethereum edition).
 *
 * Networks
 * - `hardhat`   : in-process blockchain used automatically by `npx hardhat test`
 * - `localhost` : the standalone local node started with `npx hardhat node`
 * - `sepolia`   : the public Ethereum test network. Reading works for everyone; deploying
 *                 needs a deployer private key stored with Hardhat's configuration variables:
 *
 *                     npx hardhat vars set SEPOLIA_PRIVATE_KEY
 *                     npx hardhat vars set SEPOLIA_RPC_URL      (optional)
 *                     npx hardhat vars set ETHERSCAN_API_KEY    (optional, for verification)
 *
 *                 Hardhat keeps these values outside the project folder, so they can never
 *                 be committed to GitHub by accident.
 *
 * @type import('hardhat/config').HardhatUserConfig
 */
const networks = {
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337,
  },
};

// Sepolia is always available for read-only scripts (e.g. scripts/status.js), so anyone
// can check the deployed contracts. Sending transactions needs SEPOLIA_PRIVATE_KEY.
networks.sepolia = {
  url: vars.get("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com"),
  accounts: vars.has("SEPOLIA_PRIVATE_KEY") ? [vars.get("SEPOLIA_PRIVATE_KEY")] : [],
  chainId: 11155111,
};

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // OpenZeppelin Contracts v5.6 uses the `mcopy` opcode, which only exists from the
      // Cancun upgrade onwards. Hardhat 2 compiles for "paris" by default, so we set it here.
      evmVersion: "cancun",
    },
  },
  networks,
  // Source-code verification on Etherscan (API v2 uses a single key for every chain).
  etherscan: {
    apiKey: vars.get("ETHERSCAN_API_KEY", ""),
  },
  sourcify: {
    enabled: false,
  },
};
