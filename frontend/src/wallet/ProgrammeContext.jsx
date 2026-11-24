/**
 * Loads the programme's on-chain state once and shares it with every page.
 * Reloads automatically when the network or account changes, and after every transaction
 * (WalletContext.refresh() bumps refreshKey).
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useWallet } from "./WalletContext.jsx";
import { useContracts } from "./useContracts.js";
import { loadAccount, loadProgramme } from "../lib/verdana.js";
import { friendlyError } from "../lib/errors.js";

const ProgrammeContext = createContext(null);

export function ProgrammeProvider({ children }) {
  const { account, isSupportedNetwork, refreshKey } = useWallet();
  const { read, readChainId } = useContracts();
  const [state, setState] = useState({ loading: true, error: null, programme: null, me: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!read) {
      setState({ loading: false, error: "The Verdana contracts are not deployed on this network yet.", programme: null, me: null });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const [programme, me] = await Promise.all([
          loadProgramme(read),
          account && isSupportedNetwork ? loadAccount(read, account) : Promise.resolve(null),
        ]);
        if (!cancelled) setState({ loading: false, error: null, programme, me });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: friendlyError(err) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [read, readChainId, account, isSupportedNetwork, refreshKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return <ProgrammeContext.Provider value={{ ...state, reload }}>{children}</ProgrammeContext.Provider>;
}

export function useProgramme() {
  const ctx = useContext(ProgrammeContext);
  if (!ctx) throw new Error("useProgramme must be used inside <ProgrammeProvider>");
  return ctx;
}
