/**
 * Runs one or more transactions and tracks their progress for <TxStatus>:
 * wallet approval -> waiting for a block -> confirmed / failed.
 *
 * Usage:
 *   const { state, run } = useTx();
 *   run(async (c, send) => {
 *     await send("Approve the marketplace", () => c.token.approve(market, amount));
 *     await send("List the credits", () => c.market.createListing(amount, price));
 *   }, { title: "Listed", message: "Your credits are on the market." });
 */
import { useCallback, useState } from "react";
import { useWallet } from "./WalletContext.jsx";
import { useContracts } from "./useContracts.js";
import { friendlyError } from "../lib/errors.js";

export function useTx() {
  const { refresh } = useWallet();
  const { getWriteContracts } = useContracts();
  const [state, setState] = useState({ phase: "idle" });

  const run = useCallback(
    async (steps, { title = "Transaction confirmed", message = "" } = {}) => {
      let lastHash = null;
      try {
        const contracts = await getWriteContracts();
        const send = async (label, makeTx) => {
          setState({ phase: "wallet", label });
          const tx = await makeTx();
          lastHash = tx.hash;
          setState({ phase: "mining", label, txHash: tx.hash });
          const receipt = await tx.wait();
          if (receipt.status !== 1) throw new Error("The transaction was reverted.");
          return receipt;
        };
        const result = await steps(contracts, send);
        setState({
          phase: "success",
          title,
          message: typeof message === "function" ? message(result) : message,
          txHash: lastHash,
        });
        refresh();
        return result;
      } catch (err) {
        setState({ phase: "error", title: "Not completed", message: friendlyError(err), txHash: lastHash });
        if (lastHash) refresh(); // an earlier step (e.g. an approval) may have gone through
        return undefined;
      }
    },
    [getWriteContracts, refresh]
  );

  const busy = state.phase === "wallet" || state.phase === "mining";
  return { state, run, busy, reset: () => setState({ phase: "idle" }) };
}
