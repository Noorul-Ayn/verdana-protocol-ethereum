/**
 * Verdana domain logic shared by the dApp's pages and the integration tests.
 *
 * The calculation helpers mirror the smart contracts' integer arithmetic exactly, so the
 * previews the website shows (net tonnes, buffer, farmer share, payment split) are what the
 * chain will actually do.
 */
import { id, keccak256, toUtf8Bytes } from "ethers";

export const BPS = 10_000n;
export const KG_TO_CREDIT_UNITS = 10n ** 15n; // 1 kg CO2e in VCC base units
export const CREDIT_UNITS_PER_TONNE = 10n ** 18n;

export const ROLES = {
  admin: "0x0000000000000000000000000000000000000000000000000000000000000000",
  registrar: id("REGISTRAR_ROLE"),
  verifier: id("VERIFIER_ROLE"),
};
export const ROLE_LABELS = { admin: "Programme admin", registrar: "Field agent (registrar)", verifier: "MRV verifier" };

export const READING_STATUS = ["None", "Pending", "Approved", "Rejected"];

/** keccak256 of a grid-cell label such as "geohash:kxt8f" (how farm locations are stored). */
export function locationHash(gridCell) {
  return keccak256(toUtf8Bytes(gridCell.trim()));
}

/** keccak256 ID of a methodology code such as "VDN-AGF-01". */
export function methodologyId(code) {
  return keccak256(toUtf8Bytes(code.trim()));
}

/** "2026" + "3" -> 20263 */
export function toPeriod(year, quarter) {
  return Number(year) * 10 + Number(quarter);
}

/** "2.5" hectares -> 250 (hundredths of a hectare), or null if invalid. */
export function hectaresToX100(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Largest gross removals a farm may report in one quarter (mirrors maxReadingFor). */
export function maxReadingFor(areaX100, maxKgPerHectarePerPeriod) {
  return (BigInt(maxKgPerHectarePerPeriod) * BigInt(areaX100)) / 100n;
}

/**
 * What an MRV report will issue once approved (mirrors submitReading + approveReading).
 * All inputs and outputs are kg CO2e as bigint.
 */
export function previewIssuance({ grossKg, baselineKg, leakageBps, bufferBps }) {
  const gross = BigInt(grossKg || 0);
  const baseline = BigInt(baselineKg || 0);
  if (gross <= baseline) return { additional: 0n, leakage: 0n, net: 0n, buffer: 0n, farmer: 0n, additionalityOk: false };
  const additional = gross - baseline;
  const leakage = (additional * BigInt(leakageBps)) / BPS;
  const net = additional - leakage;
  const buffer = (net * BigInt(bufferBps)) / BPS;
  return { additional, leakage, net, buffer, farmer: net - buffer, additionalityOk: true };
}

/** Price in wei for `amount` credit units at `pricePerTonneWei` (mirrors quote). */
export function quoteCost(amountUnits, pricePerTonneWei) {
  return (BigInt(amountUnits) * BigInt(pricePerTonneWei)) / CREDIT_UNITS_PER_TONNE;
}

/** Splits a payment between the farmer and the programme fund (mirrors splitPayment). */
export function splitPayment(costWei, farmerShareBps) {
  const farmer = (BigInt(costWei) * BigInt(farmerShareBps)) / BPS;
  return { farmer, programme: BigInt(costWei) - farmer };
}

const plainFarm = (farmId, f) => ({
  id: farmId,
  farmer: f.farmer,
  locationHash: f.locationHash,
  landRecordHash: f.landRecordHash,
  areaX100: Number(f.areaHectaresX100),
  region: f.region,
  active: f.active,
  registeredAt: Number(f.registeredAt),
  issuedKg: f.issuedKg,
  reversedKg: f.reversedKg,
});

const plainReading = (readingId, r) => ({
  id: readingId,
  farmId: r.farmId,
  period: Number(r.period),
  methodologyId: r.methodologyId,
  grossKg: r.grossKg,
  baselineKg: r.baselineKg,
  netKg: r.netKg,
  evidenceHash: r.evidenceHash,
  submittedBy: r.submittedBy,
  reviewedBy: r.reviewedBy,
  status: READING_STATUS[Number(r.status)],
  submittedAt: Number(r.submittedAt),
  reviewedAt: Number(r.reviewedAt),
});

const range = (n) => Array.from({ length: Number(n) }, (_, i) => BigInt(i + 1));

/** Reads the whole programme state from the three contracts. */
export async function loadProgramme({ registry, token, market }) {
  const [
    farmCount, readingCount, totalIssuedKg, totalBufferKg, totalReversedKg, bufferBps, maxKgPerHectarePerPeriod,
    methodologyIdList, paused, bufferPool,
    totalSupply, totalRetired, totalCancelled, retirementCount,
    listingCount, offtakeCount, totalVolumeWei, totalToFarmersWei, totalToProgrammeWei, totalCommittedWei,
    farmerShareBps, programmeFund,
  ] = await Promise.all([
    registry.farmCount(), registry.readingCount(), registry.totalIssuedKg(), registry.totalBufferKg(),
    registry.totalReversedKg(), registry.bufferBps(), registry.maxKgPerHectarePerPeriod(),
    registry.methodologyIds(), registry.paused(), registry.bufferPoolBalance(),
    token.totalSupply(), token.totalRetired(), token.totalCancelled(), token.retirementCount(),
    market.listingCount(), market.offtakeCount(), market.totalVolumeWei(), market.totalToFarmersWei(),
    market.totalToProgrammeWei(), market.totalCommittedWei(), market.farmerShareBps(), market.programmeFund(),
  ]);

  const [farms, readings, methodologies, listings, offtakes, retirements] = await Promise.all([
    Promise.all(range(farmCount).map(async (i) => plainFarm(i, await registry.getFarm(i)))),
    Promise.all(range(readingCount).map(async (i) => plainReading(i, await registry.getReading(i)))),
    Promise.all(
      [...methodologyIdList].map(async (mid) => {
        const m = await registry.getMethodology(mid);
        return { id: mid, name: m.name, leakageBps: Number(m.leakageBps), active: m.active };
      })
    ),
    Promise.all(
      range(listingCount).map(async (i) => {
        const l = await market.getListing(i);
        return { id: i, seller: l.seller, remaining: l.remaining, pricePerTonneWei: l.pricePerTonneWei, active: l.active, createdAt: Number(l.createdAt) };
      })
    ),
    Promise.all(
      range(offtakeCount).map(async (i) => {
        const o = await market.getOfftake(i);
        return { id: i, buyer: o.buyer, remaining: o.remaining, pricePerTonneWei: o.pricePerTonneWei, depositWei: o.depositWei, expiresAt: Number(o.expiresAt), active: o.active };
      })
    ),
    Promise.all(
      range(retirementCount).map(async (i) => {
        const r = await token.getRetirement(i);
        return { id: i, retiredBy: r.retiredBy, amount: r.amount, beneficiary: r.beneficiary, reason: r.reason, retiredAt: Number(r.retiredAt) };
      })
    ),
  ]);

  return {
    settings: { bufferBps: Number(bufferBps), maxKgPerHectarePerPeriod, farmerShareBps: Number(farmerShareBps), programmeFund, paused },
    totals: {
      farmCount, readingCount, totalIssuedKg, totalBufferKg, totalReversedKg, bufferPool,
      totalSupply, totalRetired, totalCancelled, totalVolumeWei, totalToFarmersWei, totalToProgrammeWei, totalCommittedWei,
    },
    farms, readings, methodologies, listings, offtakes, retirements,
  };
}

/** Reads what a connected wallet holds and is allowed to do. */
export async function loadAccount({ registry, token, market }, account) {
  const [vcc, pending, farmIds, isAdmin, isRegistrar, isVerifier, allowance] = await Promise.all([
    token.balanceOf(account),
    market.pendingWithdrawals(account),
    registry.farmsOf(account),
    registry.hasRole(ROLES.admin, account),
    registry.hasRole(ROLES.registrar, account),
    registry.hasRole(ROLES.verifier, account),
    token.allowance(account, await market.getAddress()),
  ]);
  return { vcc, pending, farmIds: [...farmIds], roles: { admin: isAdmin, registrar: isRegistrar, verifier: isVerifier }, allowance };
}

/** Looks a document's SHA-256 up in the on-chain records (consent records and MRV reports). */
export function findDocument(programme, hash) {
  const h = hash.toLowerCase();
  const matches = [];
  for (const farm of programme.farms) {
    if (farm.landRecordHash.toLowerCase() === h) matches.push({ kind: "consent", farm });
  }
  for (const reading of programme.readings) {
    if (reading.evidenceHash.toLowerCase() === h) {
      matches.push({ kind: "mrv", reading, farm: programme.farms.find((f) => f.id === reading.farmId) });
    }
  }
  return matches;
}

/** Case-insensitive address comparison. */
export function sameAddress(a, b) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/** A friendly name for demo accounts listed in the deployment record. */
export function accountLabel(address, deployment) {
  const names = { admin: "Programme admin / verifier A", verifierB: "Verifier B", amina: "Amina (farmer)", jean: "Jean (farmer)", buyer: "Buyer" };
  const accounts = deployment?.accounts ?? {};
  for (const key of ["amina", "jean", "buyer", "verifierB", "admin"]) {
    if (sameAddress(accounts[key], address)) return names[key];
  }
  return null;
}
