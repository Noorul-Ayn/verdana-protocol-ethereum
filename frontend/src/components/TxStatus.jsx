import { explorerUrl } from "../config.js";
import { Alert } from "./ui.jsx";
import { ExternalIcon, SpinnerIcon } from "./Icons.jsx";

/**
 * Shows where a transaction is in its life cycle:
 * wallet approval -> waiting for a block -> confirmed / failed.
 */
export function TxStatus({ state, chainId }) {
  if (!state || state.phase === "idle") return null;
  const link = state.txHash ? explorerUrl(chainId, "tx", state.txHash) : null;
  const txLine = state.txHash && (
    <span className="small">
      Transaction: <span className="mono break">{state.txHash}</span>
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="inline-link">
          {" "}
          View on Etherscan <ExternalIcon aria-hidden="true" />
        </a>
      )}
    </span>
  );

  if (state.phase === "wallet")
    return (
      <div className="tx-pending" data-testid="tx-status">
        <SpinnerIcon aria-hidden="true" />
        <div>
          {state.label && <strong>{state.label}: </strong>}
          please approve the transaction in your wallet...
        </div>
      </div>
    );
  if (state.phase === "mining")
    return (
      <div className="tx-pending" data-testid="tx-status">
        <SpinnerIcon aria-hidden="true" />
        <div>
          {state.label && <strong>{state.label}: </strong>}
          waiting for the transaction to be included in a block...
          <br />
          {txLine}
        </div>
      </div>
    );
  if (state.phase === "success")
    return (
      <div data-testid="tx-status">
        <Alert tone="success" title={state.title}>
          {state.message}
          {state.message && <br />}
          {txLine}
        </Alert>
      </div>
    );
  return (
    <div data-testid="tx-status">
      <Alert tone="danger" title={state.title ?? "Transaction failed"}>
        {state.message}
      </Alert>
    </div>
  );
}
