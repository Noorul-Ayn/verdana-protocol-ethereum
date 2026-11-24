import { id } from "ethers";

/**
 * Turns low-level wallet / RPC / contract errors into messages a non-technical user can act on.
 * The contracts' own revert messages ("Verdana: ...", "Marketplace: ...", "VCC: ...") are already
 * written in plain language, so they are shown as they are, without the prefix.
 */

/** Collects every message an ethers.js or wallet error might carry. */
export function errorText(err) {
  if (!err) return "";
  return [
    err.reason,
    err.revert?.name,
    err.revert?.args?.[0],
    err.shortMessage,
    err.info?.error?.message,
    err.error?.message,
    err.data?.message,
    err.message,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function isUserRejection(err) {
  return (
    err?.code === "ACTION_REJECTED" ||
    err?.code === 4001 ||
    err?.info?.error?.code === 4001 ||
    /user (rejected|denied)/i.test(errorText(err))
  );
}

/** The plain-language reason from one of the Verdana contracts, if there is one. */
export function contractReason(err) {
  const match = errorText(err).match(/(Verdana|Marketplace|VCC): ([^|'"]+)/);
  if (!match) return null;
  const text = match[2].trim();
  return text.charAt(0).toUpperCase() + text.slice(1) + (/[.!?]$/.test(text) ? "" : ".");
}

const ROLE_NAMES = {
  "0x0000000000000000000000000000000000000000000000000000000000000000": "programme admin",
  [id("REGISTRAR_ROLE")]: "field agent (registrar)",
  [id("VERIFIER_ROLE")]: "MRV verifier",
  [id("MINTER_ROLE")]: "minter",
};

export function friendlyError(err) {
  const text = errorText(err);
  if (isUserRejection(err)) return "You rejected the request in your wallet, so nothing was sent.";

  const reason = contractReason(err);
  if (reason) return `The smart contract refused this: ${reason}`;

  if (/AccessControlUnauthorizedAccount/.test(text) || err?.revert?.name === "AccessControlUnauthorizedAccount") {
    const candidates = [String(err?.revert?.args?.[1] ?? ""), ...(text.match(/0x[0-9a-fA-F]{64}/g) || [])];
    const role = candidates.map((h) => ROLE_NAMES[h.toLowerCase()] || ROLE_NAMES[h]).find(Boolean);
    return `The smart contract refused this: your wallet does not have the ${role ?? "required"} role.`;
  }
  if (/EnforcedPause/.test(text)) return "The programme is paused by the admin, so this action is temporarily disabled.";
  if (/ERC20InsufficientBalance/.test(text)) return "You don't hold enough VCC credits for this.";
  if (/ERC20InsufficientAllowance/.test(text)) return "The marketplace has not been approved to move these credits yet.";
  if (/insufficient funds/i.test(text)) return "Your wallet does not have enough ETH to pay for this (price plus network fee).";
  if (/nonce|replacement/i.test(text))
    return "Your wallet's transaction counter is out of sync with this network. In MetaMask, open Settings > Advanced > Clear activity tab data, then try again.";
  if (/failed to fetch|ECONNREFUSED|could not detect network|network error|timeout/i.test(text))
    return "Couldn't reach the blockchain. Check your connection (or that the local node is running) and try again.";

  return err?.shortMessage || err?.reason || err?.message || "Something went wrong. Please try again.";
}
