// Small reusable UI pieces.
import { useEffect, useState } from "react";
import { CheckCircleIcon, CopyIcon, InfoIcon, WarningIcon } from "./Icons.jsx";

export function Alert({ tone = "info", title, children }) {
  const Icon = tone === "success" ? CheckCircleIcon : tone === "info" ? InfoIcon : WarningIcon;
  return (
    <div className={`alert alert-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="alert-icon" aria-hidden="true" />
      <div>
        {title && <strong className="alert-title">{title}</strong>}
        {children && <div className="alert-body">{children}</div>}
      </div>
    </div>
  );
}

export function Card({ title, subtitle, children, className = "", actions }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard not available */
        }
      }}
    >
      <CopyIcon aria-hidden="true" /> {copied ? "Copied" : label}
    </button>
  );
}

/** Runs an async loader and tracks loading / error / data. Re-runs when deps change. */
export function useLoader(loader, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(loader)
      .then((data) => !cancelled && setState({ loading: false, error: null, data }))
      .catch((error) => !cancelled && setState({ loading: false, error, data: null }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
