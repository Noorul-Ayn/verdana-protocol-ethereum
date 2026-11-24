import { NavLink, Outlet } from "react-router-dom";
import { useContracts } from "../wallet/useContracts.js";
import { useProgramme } from "../wallet/ProgrammeContext.jsx";
import { WalletButton } from "./WalletButton.jsx";
import { NetworkBanner } from "./NetworkBanner.jsx";
import { Addr } from "./bits.jsx";
import { Alert } from "./ui.jsx";
import { LeafIcon } from "./Icons.jsx";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/farms", label: "Farms & Reports" },
  { to: "/verify", label: "Verifier Console" },
  { to: "/farmer", label: "My Farm" },
  { to: "/market", label: "Funding & Market" },
  { to: "/admin", label: "Admin" },
];

export function Layout() {
  const { chain, deployment } = useContracts();
  const { programme, error } = useProgramme();

  return (
    <div className="app">
      <header className="site-header">
        <div className="container header-inner">
          <NavLink to="/" className="brand">
            <LeafIcon className="brand-icon" aria-hidden="true" />
            <span>
              Verdana Protocol
              <small>Climate-finance access for smallholder farmers</small>
            </span>
          </NavLink>
          <nav className="main-nav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "active" : "")}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-right">
            <span className="network-pill" title="Network the app is reading from">
              <span className="dot" /> {chain?.name ?? "No network"}
            </span>
            <WalletButton />
          </div>
        </div>
      </header>
      <NetworkBanner />
      {programme?.settings.paused && (
        <div className="paused-banner" role="status">
          The programme is paused by the admin: registrations, reports and approvals are temporarily disabled.
        </div>
      )}

      <main className="container main">
        {error && !programme && (
          <div className="stack-lg">
            <Alert tone="danger" title="Couldn't load the programme">
              {error}
            </Alert>
          </div>
        )}
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <span>Verdana Protocol · Testnet demo with illustrative data: VCC are test tokens with no monetary value.</span>
          {deployment && (
            <span className="footer-contracts">
              Registry <Addr address={deployment.contracts.VerdanaRegistry} /> · VCC <Addr address={deployment.contracts.VerdanaCarbonCredit} /> ·
              Marketplace <Addr address={deployment.contracts.VerdanaMarketplace} /> · {chain?.name}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
