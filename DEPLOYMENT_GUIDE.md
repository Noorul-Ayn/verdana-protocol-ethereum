# Verdana Protocol: Deployment Guide

This guide deploys Verdana Protocol step by step: first to a local blockchain, then to the Ethereum **Sepolia** testnet, then verifies the source code on Etherscan and publishes the website on GitHub Pages.

Commands are for a Linux / macOS / WSL (Ubuntu) terminal, run from the project folder.

---

## 0. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 20 or later | `node -v` |
| npm | comes with Node | `npm -v` |
| Git | any | `git --version` |
| MetaMask | browser extension | for the website |
| Sepolia test ETH | about 0.02 ETH | from a Sepolia faucet (e.g. Google Cloud Web3 faucet) |

## 1. Install

```bash
npm install                   # Hardhat, OpenZeppelin, ethers
npm run frontend:install      # website dependencies
npx hardhat compile           # "Compiled ... Solidity files successfully"
```

## 2. Run the tests

```bash
npx hardhat test
```

Expected: **45 passing**. Optional coverage report: `npx hardhat coverage`.

## 3. Deploy locally (optional rehearsal)

```bash
npx hardhat node                                   # terminal 1, leave it running
npx hardhat run scripts/deploy.js --network localhost     # terminal 2
npx hardhat run scripts/interact.js --network localhost   # terminal 2
```

`deploy.js` deploys the three contracts, then wires them together:

1. Grants the registry `MINTER_ROLE` on the token, so only the registry can create credits.
2. Grants the deployer the field-agent and verifier A roles, and a second account verifier B.
3. Approves the demo methodology `VDN-AGF-01` (10% leakage).
4. Sets the 10% buffer and the 80/20 split.
5. Exports the ABIs and addresses to `frontend/src/contracts/`.

`interact.js` then runs the whole programme and prints each transaction: register farms, submit and approve MRV reports, five security checks, committed funding, sale, open-market sale, withdrawals and retirement.

## 4. Configure the Sepolia deployer (once)

Hardhat stores secrets **outside the project folder**, so they can never be committed to GitHub:

```bash
npx hardhat vars set SEPOLIA_PRIVATE_KEY     # paste the MetaMask private key of a TEST account
npx hardhat vars set ETHERSCAN_API_KEY       # optional, for source verification (etherscan.io > API keys)
npx hardhat vars set SEPOLIA_RPC_URL         # optional; default https://ethereum-sepolia-rpc.publicnode.com
```

> Use a test-only account that holds no real funds. Never paste a private key into code, a chat or a file in the repository.

## 5. Deploy to Sepolia

```bash
npm run deploy:sepolia
```

Expected output (addresses will differ):

```
Network  : sepolia (chain ID 11155111)
VerdanaCarbonCredit deployed to: 0x...
VerdanaRegistry     deployed to: 0x...
VerdanaMarketplace  deployed to: 0x...
Granting roles...
Methodology approved: VDN-AGF-01 ... (leakage 10%)
View on Etherscan: ...
Verify the source code on Etherscan: npx hardhat verify ...
```

The script waits for 2 confirmations per transaction, so public RPC load balancers don't return stale data.

## 6. Run the programme on Sepolia

```bash
npm run demo:sepolia
```

The script first sends a little test ETH to four demo accounts (verifier B, Amina, Jean, the buyer). These accounts are derived from your deployer key, so they are the same on every run. It then runs the full journey and prints an Etherscan link for every transaction.

It is safe to re-run: steps that already happened are skipped. If a public RPC hiccups (a timeout, or "nonce too low"), simply run it again.

Check the result at any time, without a key:

```bash
npm run status:sepolia
```

## 7. Verify the source code on Etherscan (optional, recommended)

Copy the three `npx hardhat verify ...` lines printed by the deploy script and run them. Each one should end with `Successfully verified contract ... on the block explorer`. Etherscan then shows a green tick, and anyone can read the code.

## 8. Use the website with MetaMask

```bash
npm run dev            # http://localhost:5173
```

1. Add the Sepolia network to MetaMask (the website offers a **Switch to Sepolia Testnet** button).
2. Import the demo accounts so you can act as each role. This prints their addresses and test keys:
   ```bash
   npm run personas:sepolia
   ```
   In MetaMask: account menu > **Add account or hardware wallet** > **Import account** > paste the key.
3. Switch accounts in MetaMask to act as verifier B, Amina (farmer) or the buyer. The website updates automatically.

## 9. Publish the website on GitHub Pages

The Sepolia addresses are now in `frontend/src/contracts/deployments.json`. Commit them, then publish:

```bash
git add -A
git commit -m "Deploy Verdana Protocol to Sepolia"
git push
npm run deploy:pages        # builds the site and pushes it to the gh-pages branch
```

Then, in GitHub: **Settings > Pages > Source: Deploy from a branch > Branch: `gh-pages` / `(root)` > Save**. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`. It reads Sepolia through a public RPC, so it works for visitors with no wallet at all.

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `No deployer account for "sepolia"` | Run `npx hardhat vars set SEPOLIA_PRIVATE_KEY` |
| `insufficient funds` | Get more Sepolia ETH from a faucet |
| `nonce too low` / timeout on Sepolia | Re-run the same command; finished steps are skipped |
| Website shows "Wrong network" | Click **Switch to Sepolia Testnet** in the yellow banner |
| MetaMask "nonce" errors after restarting a local node | MetaMask > Settings > Advanced > **Clear activity tab data** |
| `gh-pages` asks for a password repeatedly | `git config --global credential.helper 'cache --timeout=3600'`, then retry |
