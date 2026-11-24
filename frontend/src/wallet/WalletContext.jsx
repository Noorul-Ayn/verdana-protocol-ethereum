/**
 * Wallet connection for the whole app.
 *
 * - Discovers every installed wallet with EIP-6963 (MetaMask, Coinbase Wallet, Rabby, Brave...)
 *   and falls back to the legacy window.ethereum object.
 * - Connects with eth_requestAccounts, which makes the wallet ask the user for permission.
 * - Listens for account changes, network changes and disconnection.
 * - Can switch the wallet to a supported network (adding it first if needed).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BrowserProvider, getAddress } from "ethers";
import { CHAINS, isSupportedChain } from "../config.js";
import { friendlyError } from "../lib/errors.js";

const WalletContext = createContext(null);
const STORAGE_KEY = "verdana-dapp.lastWallet";

// localStorage can be unavailable (private mode, sandboxed previews), so never let it throw.
const storage = {
  get: () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } },
};

function legacyWalletName(eth) {
  if (eth.isCoinbaseWallet) return "Coinbase Wallet";
  if (eth.isBraveWallet) return "Brave Wallet";
  if (eth.isMetaMask) return "MetaMask";
  return "Browser wallet";
}

export function WalletProvider({ children }) {
  const [wallets, setWallets] = useState([]); // detected wallets: { info, provider }
  const [discoveryDone, setDiscoveryDone] = useState(false);
  const [active, setActive] = useState(null); // the wallet the user connected
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0); // bumped after transactions

  // --- 1. Discover installed wallets (EIP-6963) ---------------------------------------
  useEffect(() => {
    const found = new Map();
    const onAnnounce = (event) => {
      found.set(event.detail.info.uuid, event.detail);
      setWallets([...found.values()]);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Older wallets only inject window.ethereum and don't announce themselves.
    const timer = setTimeout(() => {
      if (found.size === 0 && window.ethereum) {
        found.set("legacy", {
          info: { uuid: "legacy", name: legacyWalletName(window.ethereum), icon: null, rdns: "legacy" },
          provider: window.ethereum,
        });
        setWallets([...found.values()]);
      }
      setDiscoveryDone(true);
    }, 500);

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(timer);
    };
  }, []);

  const reset = useCallback(() => {
    setActive(null);
    setAccount(null);
    setChainId(null);
  }, []);

  // --- 2. Connect -----------------------------------------------------------------------
  const connect = useCallback(async (wallet, { silent = false } = {}) => {
    setConnecting(true);
    setError(null);
    try {
      // eth_requestAccounts opens the wallet's permission prompt; eth_accounts doesn't.
      const accounts = await wallet.provider.request({ method: silent ? "eth_accounts" : "eth_requestAccounts" });
      if (!accounts?.length) return false;
      const currentChain = parseInt(await wallet.provider.request({ method: "eth_chainId" }), 16);
      setActive(wallet);
      setAccount(getAddress(accounts[0]));
      setChainId(currentChain);
      storage.set(wallet.info.rdns);
      return true;
    } catch (err) {
      if (!silent) setError(friendlyError(err));
      return false;
    } finally {
      setConnecting(false);
    }
  }, []);

  // Reconnect automatically (without a prompt) to the wallet used last time.
  useEffect(() => {
    if (!discoveryDone || active) return;
    const last = storage.get();
    const wallet = wallets.find((w) => w.info.rdns === last);
    if (wallet) connect(wallet, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoveryDone]);

  // --- 3. React to changes made inside the wallet --------------------------------------
  useEffect(() => {
    if (!active?.provider?.on) return undefined;
    const provider = active.provider;
    const onAccountsChanged = (accounts) => {
      if (!accounts?.length) {
        reset(); // the user disconnected this site from inside the wallet
        storage.clear();
      } else {
        setAccount(getAddress(accounts[0]));
      }
    };
    const onChainChanged = (hexId) => setChainId(parseInt(hexId, 16));
    const onDisconnect = () => reset();

    provider.on("accountsChanged", onAccountsChanged);
    provider.on("chainChanged", onChainChanged);
    provider.on("disconnect", onDisconnect);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, [active, reset]);

  // --- 4. Disconnect ----------------------------------------------------------------------
  const disconnect = useCallback(async () => {
    try {
      // Supported by MetaMask and some others; other wallets simply forget the site.
      await active?.provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    } catch {
      /* not supported by this wallet - the app still forgets the connection */
    }
    storage.clear();
    reset();
  }, [active, reset]);

  // --- 5. Switch network --------------------------------------------------------------------
  const switchNetwork = useCallback(
    async (targetChainId) => {
      if (!active) return;
      const chain = CHAINS[targetChainId];
      setError(null);
      try {
        await active.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.addParams.chainId }] });
      } catch (err) {
        const unknownChain = err?.code === 4902 || err?.data?.originalError?.code === 4902 || /unrecognized chain/i.test(err?.message);
        if (!unknownChain) {
          setError(friendlyError(err));
          return;
        }
        try {
          await active.provider.request({ method: "wallet_addEthereumChain", params: [chain.addParams] });
        } catch (addErr) {
          setError(friendlyError(addErr));
        }
      }
    },
    [active]
  );

  // An ethers.js provider around the wallet. Recreated when the network changes.
  const browserProvider = useMemo(
    () => (active && chainId ? new BrowserProvider(active.provider, chainId) : null),
    [active, chainId]
  );

  const value = {
    wallets,
    discoveryDone,
    hasWallet: wallets.length > 0,
    walletName: active?.info.name ?? null,
    account,
    chainId,
    isConnected: Boolean(account),
    isSupportedNetwork: isSupportedChain(chainId),
    connecting,
    error,
    clearError: () => setError(null),
    connect,
    disconnect,
    switchNetwork,
    browserProvider,
    refreshKey,
    refresh: () => setRefreshKey((k) => k + 1),
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
