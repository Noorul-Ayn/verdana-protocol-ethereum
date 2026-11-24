import { useEffect } from "react";
import { useWallet } from "../wallet/WalletContext.jsx";
import { Alert } from "./ui.jsx";
import { WalletIcon } from "./Icons.jsx";

/** Lets the user pick one of the wallets installed in their browser. */
export function WalletModal({ onClose }) {
  const { wallets, discoveryDone, connect, connecting, error, clearError } = useWallet();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="wallet-modal-title">Connect a wallet</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>

        {error && (
          <Alert tone="danger" title="Couldn't connect">
            {error}
          </Alert>
        )}

        {discoveryDone && wallets.length === 0 ? (
          <div className="no-wallet" data-testid="no-wallet">
            <Alert tone="info" title="No Web3 wallet found in this browser">
              A wallet such as MetaMask or Coinbase Wallet lets you sign transactions. Install one, then refresh this page.
              You can still browse the programme, farms and reports without a wallet.
            </Alert>
            <div className="wallet-links">
              <a className="btn btn-outline" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                Get MetaMask
              </a>
              <a className="btn btn-outline" href="https://www.coinbase.com/wallet/downloads" target="_blank" rel="noreferrer">
                Get Coinbase Wallet
              </a>
            </div>
          </div>
        ) : (
          <ul className="wallet-list">
            {wallets.map((w) => (
              <li key={w.info.uuid}>
                <button
                  className="wallet-option"
                  disabled={connecting}
                  onClick={async () => {
                    clearError();
                    if (await connect(w)) onClose();
                  }}
                >
                  {w.info.icon ? <img src={w.info.icon} alt="" width="28" height="28" /> : <WalletIcon width="28" height="28" />}
                  <span>{w.info.name}</span>
                </button>
              </li>
            ))}
            {!discoveryDone && <li className="muted">Looking for wallets...</li>}
          </ul>
        )}
        <p className="muted small">Connecting only shares your public address. Nothing is sent without your approval.</p>
      </div>
    </div>
  );
}
