// Small Verdana-specific display components.
import { useRef, useState } from "react";
import { explorerUrl } from "../config.js";
import { useContracts } from "../wallet/useContracts.js";
import { useWallet } from "../wallet/WalletContext.jsx";
import { accountLabel, sameAddress } from "../lib/verdana.js";
import { shortenAddress, shortenHash } from "../lib/format.js";
import { hashFile } from "../lib/hash.js";
import { CopyButton } from "./ui.jsx";
import { FileIcon, LockIcon, SpinnerIcon, UploadIcon } from "./Icons.jsx";

/** A short address that links to Etherscan, with a friendly name for demo accounts. */
export function Addr({ address }) {
  const { readChainId, deployment } = useContracts();
  const { account } = useWallet();
  if (!address) return <span className="muted">-</span>;
  const url = explorerUrl(readChainId, "address", address);
  const label = sameAddress(address, account) ? "You" : accountLabel(address, deployment);
  const text = shortenAddress(address);
  return (
    <span className="addr" title={address}>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="mono">
          {text}
        </a>
      ) : (
        <span className="mono">{text}</span>
      )}
      {label && <span className="addr-label">{label}</span>}
    </span>
  );
}

export function Hash({ value }) {
  return (
    <span className="mono hash" title={value}>
      {shortenHash(value)}
    </span>
  );
}

const STATUS_TONES = { Pending: "warning", Approved: "success", Rejected: "danger", Active: "success", Inactive: "muted", Closed: "muted", Expired: "muted" };
export function StatusBadge({ status }) {
  return <span className={`badge badge-${STATUS_TONES[status] ?? "info"}`}>{status}</span>;
}

export function Stat({ label, value, note, testId }) {
  return (
    <div className="stat" data-testid={testId}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

/** Shown when the connected wallet lacks the role a section needs. */
export function Locked({ title, children }) {
  return (
    <div className="locked">
      <LockIcon className="locked-icon" aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

/**
 * Picks a file and computes its SHA-256 fingerprint in the browser. The file itself never
 * leaves the device; only the 32-byte hash is used.
 */
export function FileHashInput({ label, hint, value, onChange, testId }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  const handle = async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await hashFile(file);
      setFileName(file.name);
      onChange(hash, file);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <span>{label}</span>
      <div
        className={`dropzone dropzone-sm ${dragging ? "dragging" : ""} ${value ? "has-file" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          hidden
          data-testid={testId}
          onChange={(e) => handle(e.target.files?.[0])}
        />
        {busy ? (
          <span className="dropzone-line">
            <SpinnerIcon aria-hidden="true" /> Computing SHA-256...
          </span>
        ) : value ? (
          <span className="dropzone-line">
            <FileIcon className="dropzone-icon-sm" aria-hidden="true" />
            <span>
              <strong>{fileName ?? "File"}</strong>
              <br />
              <span className="mono small break">SHA-256 {value}</span>
            </span>
          </span>
        ) : (
          <span className="dropzone-line">
            <UploadIcon className="dropzone-icon-sm" aria-hidden="true" />
            <span>
              <strong>Choose or drop a file</strong>
              {hint && (
                <>
                  <br />
                  <span className="muted small">{hint}</span>
                </>
              )}
            </span>
          </span>
        )}
      </div>
      {value && (
        <div className="hash-actions">
          <CopyButton value={value} label="Copy hash" />
        </div>
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

/** A table that says something useful when it's empty. */
export function EmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="muted center empty-cell">
        {children}
      </td>
    </tr>
  );
}
