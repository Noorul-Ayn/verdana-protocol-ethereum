/**
 * Display helpers shared by the dApp's pages and the integration tests.
 */

/** 0x1234567890abcdef... -> 0x1234...cdef */
export function shortenAddress(address, chars = 4) {
  if (!address) return "";
  return `${address.slice(0, 2 + chars)}...${address.slice(-chars)}`;
}

/**
 * Formats a raw token amount (bigint in base units) for people to read.
 * 1000000000000000000000000n with 18 decimals -> "1,000,000"
 */
export function formatTokenAmount(raw, decimals = 18, maxFractionDigits = 2) {
  const value = BigInt(raw ?? 0);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);

  const whole = (abs / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (abs % base)
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? "." + fraction : ""}`;
}

/** Unix timestamp in seconds (number or bigint) -> "1 November 2026 at 10:43" */
export function formatDate(unixSeconds) {
  const date = new Date(Number(unixSeconds) * 1000);
  return date.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
}

/** 10n -> "10%" */
export function formatPercent(value) {
  return `${value?.toString() ?? "0"}%`;
}

/** kg (number or bigint) -> "11,250 kg" */
export function formatKg(kg) {
  return `${Number(kg ?? 0).toLocaleString("en-US")} kg`;
}

/** kg -> tonnes string, e.g. 8100 -> "8.1 t" */
export function formatTonnes(kg) {
  return `${(Number(kg ?? 0) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} t`;
}

/** wei (bigint) -> "0.0048 ETH" (up to 6 decimals) */
export function formatEth(wei, maxFractionDigits = 6) {
  return `${formatTokenAmount(wei ?? 0n, 18, maxFractionDigits)} ETH`;
}

/** basis points -> "10%" */
export function formatBps(bps) {
  return `${Number(bps ?? 0) / 100}%`;
}

/** 20263 -> "2026 Q3" */
export function formatPeriod(period) {
  const p = Number(period);
  return `${Math.floor(p / 10)} Q${p % 10}`;
}

/** hundredths of a hectare -> "2.5 ha" */
export function formatHectares(areaX100) {
  return `${(Number(areaX100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} ha`;
}

/** 0x1234...abcd for 32-byte hashes */
export function shortenHash(hash, chars = 6) {
  if (!hash) return "";
  return `${hash.slice(0, 2 + chars)}...${hash.slice(-4)}`;
}
