import { CHAINS, DEPLOYED_CHAIN_IDS, networkName } from "../config.js";
import { useWallet } from "../wallet/WalletContext.jsx";
import { useContracts } from "../wallet/useContracts.js";
import { WarningIcon } from "./Icons.jsx";

/** Warns when the wallet is on a network where the contracts aren't deployed. */
export function NetworkBanner() {
  const { isConnected, isSupportedNetwork, chainId, switchNetwork, error } = useWallet();
  const { chain } = useContracts();

  if (!isConnected || isSupportedNetwork) return null;

  return (
    <div className="network-banner" role="alert" data-testid="network-banner">
      <WarningIcon aria-hidden="true" />
      <span>
        Your wallet is on <strong>{networkName(chainId)}</strong>, where the Verdana contracts are not
        deployed. Showing read-only data from <strong>{chain?.name}</strong>. Switch networks to send transactions.
        {error && <em className="banner-error"> {error}</em>}
      </span>
      <span className="banner-actions">
        {DEPLOYED_CHAIN_IDS.map((id) => (
          <button key={id} className="btn btn-sm btn-light" onClick={() => switchNetwork(id)}>
            Switch to {CHAINS[id].name}
          </button>
        ))}
      </span>
    </div>
  );
}
