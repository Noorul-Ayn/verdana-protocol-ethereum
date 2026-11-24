/**
 * In-browser SHA-256 hashing.
 *
 * Uses the Web Crypto API (`crypto.subtle`), which is built into every modern browser and
 * into Node.js 20+. The file never leaves the user's device: its bytes are read locally and
 * only the 32-byte fingerprint is sent to the blockchain.
 *
 * Note: browsers only expose `crypto.subtle` on secure pages (https:// or http://localhost).
 */

const HASH_HEX = /^[0-9a-f]{64}$/;

/** Converts a 32-byte digest into the 0x-prefixed hex string Solidity expects for bytes32. */
export function toBytes32Hex(digest) {
  const bytes = new Uint8Array(digest);
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hashes raw bytes (ArrayBuffer or typed array) and returns a bytes32 hex string. */
export async function sha256Bytes32(data) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "This browser cannot compute SHA-256 here. Open the app over https:// or http://localhost."
    );
  }
  const digest = await subtle.digest("SHA-256", data);
  return toBytes32Hex(digest);
}

/**
 * Hashes a File or Blob (for example from an <input type="file">) and returns its SHA-256
 * fingerprint as a bytes32 value ready to pass to the smart contract.
 */
export async function hashFile(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Please choose a file to hash.");
  }
  const buffer = await file.arrayBuffer();
  return sha256Bytes32(buffer);
}

/**
 * Cleans up a hash typed or pasted by a user and returns it in bytes32 format.
 * Accepts upper or lower case, with or without the 0x prefix and surrounding spaces.
 */
export function normalizeHash(input) {
  const value = String(input ?? "").trim().toLowerCase().replace(/^0x/, "");
  if (!HASH_HEX.test(value)) {
    throw new Error("A SHA-256 fingerprint is 64 characters long and uses only the digits 0-9 and letters a-f.");
  }
  return "0x" + value;
}

/** True if `value` is a 0x-prefixed 32-byte hex string. */
export function isBytes32(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}
