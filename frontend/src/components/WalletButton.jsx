import { useEffect, useRef, useState } from "react";
import { useWallet } from "../wallet/WalletContext.jsx";
import { useProgramme } from "../wallet/ProgrammeContext.jsx";
import { useContracts } from "../wallet/useContracts.js";
import { formatTokenAmount, shortenAddress } from "../lib/format.js";
import { accountLabel, ROLE_LABELS } from "../lib/verdana.js";
import { CopyIcon, SpinnerIcon, WalletIcon } from "./Icons.jsx";
import { WalletModal } from "./WalletModal.jsx";

/** "Connect Wallet" button, or the connected wallet's VCC balance, address and roles. */
export function WalletButton() {
  const { isConnected, account, connecting, disconnect, walletName, isSupportedNetwork } = useWallet();
  const { me } = useProgramme();
  const { deployment } = useContracts();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const close = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!isConnected) {
    return (
      <>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)} disabled={connecting}>
          {connecting ? <SpinnerIcon aria-hidden="true" /> : <WalletIcon aria-hidden="true" />}
          {connecting ? "Connecting..." : "Connect Wallet"}
        </button>
        {modalOpen && <WalletModal onClose={() => setModalOpen(false)} />}
      </>
    );
  }

  const roles = me ? Object.entries(me.roles).filter(([, has]) => has).map(([k]) => ROLE_LABELS[k]) : [];
  const demoName = accountLabel(account, deployment);

  return (
    <div className="wallet-chip-wrap" ref={menuRef}>
      <button className="wallet-chip" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
        <span className="wallet-balance" data-testid="header-balance">
          {isSupportedNetwork ? (me ? `${formatTokenAmount(me.vcc)} VCC` : "...") : "Wrong network"}
        </span>
        <span className="wallet-address" data-testid="header-address">
          {shortenAddress(account)}
        </span>
      </button>
      {menuOpen && (
        <div className="wallet-menu" role="menu">
          <p className="wallet-menu-label">Connected with {walletName}</p>
          <p className="mono small">{account}</p>
          {demoName && <p className="small">Demo account: <strong>{demoName}</strong></p>}
          <p className="small">
            Roles: <strong>{roles.length ? roles.join(", ") : "none (farmer or buyer)"}</strong>
          </p>
          <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(account).catch(() => {})}>
            <CopyIcon aria-hidden="true" /> Copy address
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setMenuOpen(false);
              disconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
