/**
 * Gives pages ready-made ethers.js contract instances for the three Verdana contracts.
 *
 * - `read`  : connected to a provider, for free view calls. Uses the wallet's network when it
 *             is supported, otherwise a public RPC for the default network, so every page can be
 *             browsed with no wallet at all.
 * - `getWriteContracts()` : connected to the wallet's signer, for transactions the wallet asks
 *             the user to approve.
 */
import { useCallback, useMemo } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import { CHAINS, DEFAULT_CHAIN_ID, MARKET_ABI, REGISTRY_ABI, TOKEN_ABI, getDeployment } from "../config.js";
import { useWallet } from "./WalletContext.jsx";

const rpcProviders = new Map();
function readOnlyProvider(chainId) {
  if (!rpcProviders.has(chainId)) {
    // staticNetwork: we already know the chain ID, so ethers doesn't need to ask for it.
    rpcProviders.set(chainId, new JsonRpcProvider(CHAINS[chainId].rpcUrl, chainId, { staticNetwork: true }));
  }
  return rpcProviders.get(chainId);
}

function build(deployment, runner) {
  const c = deployment.contracts;
  return {
    registry: new Contract(c.VerdanaRegistry, REGISTRY_ABI, runner),
    token: new Contract(c.VerdanaCarbonCredit, TOKEN_ABI, runner),
    market: new Contract(c.VerdanaMarketplace, MARKET_ABI, runner),
  };
}

export function useContracts() {
  const { browserProvider, chainId, isSupportedNetwork, account } = useWallet();

  const readChainId = isSupportedNetwork ? chainId : DEFAULT_CHAIN_ID;
  const deployment = getDeployment(readChainId);

  const read = useMemo(() => {
    if (!deployment) return null;
    const runner = isSupportedNetwork && browserProvider ? browserProvider : readOnlyProvider(readChainId);
    return build(deployment, runner);
  }, [deployment, isSupportedNetwork, browserProvider, readChainId]);

  const getWriteContracts = useCallback(async () => {
    if (!browserProvider || !isSupportedNetwork) throw new Error("Connect your wallet to a supported network first.");
    return build(deployment, await browserProvider.getSigner());
  }, [browserProvider, isSupportedNetwork, deployment]);

  return {
    readChainId,
    chain: CHAINS[readChainId],
    deployment,
    read,
    getWriteContracts,
    canWrite: Boolean(account && isSupportedNetwork),
  };
}
