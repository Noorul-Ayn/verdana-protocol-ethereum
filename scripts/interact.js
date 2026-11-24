/**
 * End-to-end interaction with a deployed Verdana Protocol, step by step:
 *
 *   1. A field agent registers two smallholder farms (Amina in Musanze, Jean in Huye), each with
 *      the SHA-256 of a signed land-rights and consent record (samples/land-records/).
 *   2. Verifier A submits MRV reports (remote sensing + field plots + methodology calculation),
 *      each with the SHA-256 of the report file (samples/mrv-reports/).
 *   3. Security checks: an outsider, the same verifier, an inflated report, a report with no
 *      additionality and a double claim are all refused by the contract (simulated, no gas used).
 *   4. Verifier B approves -> credits are issued: 90% to the farmer, 10% to the buffer pool.
 *   5. A buyer commits funding up front (offtake): ETH locked for 10 future tonnes.
 *   6. Amina sells into the offtake and is paid immediately (80% farmer / 20% programme fund).
 *   7. Jean lists credits on the open market; the buyer buys some.
 *   8. Amina, Jean and the programme fund withdraw their shares (mobile-money payout point).
 *   9. The buyer retires credits for its offset -> public retirement certificate.
 *
 * Safe to re-run: steps that already happened are detected and skipped.
 *
 *   npx hardhat run scripts/interact.js --network localhost
 *   npx hardhat run scripts/interact.js --network sepolia
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const hre = require("hardhat");
const { getPersonas, LOCAL_NETWORKS } = require("./lib/personas");
const { attach } = require("./lib/deployment");

const PERIOD = 20263; // 2026, quarter 3
const SAMPLES = path.join(__dirname, "..", "samples");
const FARMS = [
  { persona: "amina", grid: "geohash:kxt8f", areaX100: 250, region: "Musanze, Rwanda", gross: 11250, baseline: 1250,
    report: "mrv-reports/farm-1-2026Q3.json", land: "land-records/farm-1-consent.json" },
  { persona: "jean", grid: "geohash:kxmuq", areaX100: 180, region: "Huye, Rwanda", gross: 7200, baseline: 1200,
    report: "mrv-reports/farm-2-2026Q3.json", land: "land-records/farm-2-consent.json" },
];
const EXPLORERS = { 11155111: "https://sepolia.etherscan.io/tx/" };
const DAY = 24 * 60 * 60;

const sha256File = (rel) => "0x" + crypto.createHash("sha256").update(fs.readFileSync(path.join(SAMPLES, rel))).digest("hex");

/** Turns a revert into a short, readable reason (custom errors are decoded by name). */
function revertReason(err, contracts) {
  const data = err.data?.data ?? err.data ?? err.error?.data;
  if (typeof data === "string" && data.length >= 10) {
    for (const c of contracts) {
      try {
        const parsed = c.interface.parseError(data);
        if (parsed?.name === "Error") return String(parsed.args[0]);
        if (parsed) return `${parsed.name}(${parsed.args.map(String).join(", ")})`.replace(/0x[0-9a-fA-F]{64}/g, (h) => h.slice(0, 10) + "...");
      } catch {}
    }
  }
  const text = err.reason || err.revert?.args?.[0] || err.shortMessage || err.message || String(err);
  const m = text.match(/reverted with reason string '(.+)'/);
  return (m ? m[1] : text).replace(/0x[0-9a-fA-F]{64}/g, (h) => h.slice(0, 10) + "...");
}

/** Finds a named event in a receipt. */
function findEvent(contract, receipt, name) {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === name) return parsed;
    } catch {}
  }
  return null;
}

async function main() {
  const { ethers, network } = hre;
  const { token, registry, market, chainId, deployment } = await attach(hre);
  const p = await getPersonas(hre);
  const live = !LOCAL_NETWORKS.includes(network.name);
  const confirmations = live ? 2 : 1;
  const methodologyId = deployment.methodology.id;
  // Price per tonne. On a public testnet it is kept tiny so the demo runs on faucet ETH.
  const price = live ? ethers.parseEther("0.00001") : ethers.parseEther("0.001");
  const t = (n) => ethers.parseUnits(String(n), 18);
  const vcc = (units) => `${ethers.formatUnits(units, 18)} VCC`;
  const eth = (wei) => `${ethers.formatEther(wei)} ETH`;
  const txLink = (hash) => (EXPLORERS[chainId] ? EXPLORERS[chainId] + hash : hash);
  const send = async (label, txPromise) => {
    const receipt = await (await txPromise).wait(confirmations);
    console.log(`   ✔ ${label}\n     tx: ${txLink(receipt.hash)}`);
    return receipt;
  };
  const expectRevert = async (label, callPromise) => {
    try {
      await callPromise;
      console.log(`   ✘ ${label}: NOT rejected (unexpected!)`);
    } catch (err) {
      console.log(`   ✔ ${label}\n     refused by the contract: ${revertReason(err, [registry, token, market])}`);
    }
  };

  console.log(`Verdana Protocol demo on ${network.name} (chain ${chainId})\n`);

  // 0. Gas money for the demo personas on a public testnet. Each account gets what its
  //    transactions need at the CURRENT fee (x3 for safety, at least 0.0001 ETH), plus the
  //    buyer's payments. Accounts that already have enough are left alone.
  if (live) {
    console.log("0. Funding demo accounts with a little test ETH (gas, and the buyer's payments)");
    const fee = await ethers.provider.getFeeData();
    const perGas = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
    const floor = ethers.parseEther("0.0001");
    const gasFor = (units) => { const g = units * perGas * 3n; return g > floor ? g : floor; };
    const buyerValue = (t(10) * price) / 10n ** 18n + (t(2) * price) / 10n ** 18n; // commitment + purchase
    const needs = {
      verifierB: gasFor(400_000n),
      amina: gasFor(400_000n),
      jean: gasFor(400_000n),
      buyer: gasFor(500_000n) + buyerValue,
    };
    const deployerGas = gasFor(1_500_000n);
    let toSend = 0n;
    const plan = [];
    for (const [label, need] of Object.entries(needs)) {
      const bal = await ethers.provider.getBalance(p[label].address);
      if (bal < need) { plan.push([label, need - bal]); toSend += need - bal; }
      else console.log(`   ✔ ${label} already has ${eth(bal)}`);
    }
    const deployerBal = await ethers.provider.getBalance(p.deployer.address);
    console.log(`   current max fee: ${ethers.formatUnits(perGas, "gwei")} gwei · deployer balance: ${eth(deployerBal)} · needed: ${eth(toSend + deployerGas)}`);
    if (deployerBal < toSend + deployerGas) {
      console.log(`\n   Not enough Sepolia ETH right now (fees are high or the balance is low).`);
      console.log(`   Add test ETH to ${p.deployer.address} from a Sepolia faucet, or wait for fees to drop, then run this again.`);
      process.exitCode = 1;
      return;
    }
    for (const [label, amount] of plan) {
      await send(`sent ${eth(amount)} to ${label} (${p[label].address})`, p.deployer.sendTransaction({ to: p[label].address, value: amount }));
    }
    console.log("");
  }

  // 1. Register farms
  console.log("1. Field agent registers farms (location stored as a grid-cell hash, plus a consent record hash)");
  const farmIds = [];
  for (const f of FARMS) {
    const locationHash = ethers.keccak256(ethers.toUtf8Bytes(f.grid));
    const farmer = p[f.persona].address;
    if (await registry.locationRegistered(locationHash)) {
      const ids = await registry.farmsOf(farmer);
      farmIds.push(ids[0]);
      console.log(`   ✔ ${f.region} farm already registered (farm #${ids[0]})`);
      continue;
    }
    const landHash = sha256File(f.land);
    const receipt = await send(
      `registered ${f.areaX100 / 100} ha farm in ${f.region} for ${f.persona}; consent record SHA-256 ${landHash.slice(0, 10)}...`,
      registry.connect(p.deployer).registerFarm(farmer, locationHash, landHash, f.areaX100, f.region)
    );
    farmIds.push(findEvent(registry, receipt, "FarmRegistered").args.farmId);
  }

  // 2. Submit MRV reports
  console.log(`\n2. Verifier A submits MRV reports for 2026 Q3 (methodology ${deployment.methodology.code})`);
  const readingIds = [];
  for (let i = 0; i < FARMS.length; i++) {
    const f = FARMS[i];
    const existing = await registry.activeReadingFor(farmIds[i], PERIOD);
    if (existing !== 0n) {
      readingIds.push(existing);
      console.log(`   ✔ report for farm #${farmIds[i]} already submitted (report #${existing})`);
      continue;
    }
    const evidenceHash = sha256File(f.report);
    const receipt = await send(
      `farm #${farmIds[i]}: gross ${f.gross.toLocaleString("en-US")} kg - baseline ${f.baseline.toLocaleString("en-US")} kg, ` +
        `evidence ${path.basename(f.report)} (SHA-256 ${evidenceHash.slice(0, 10)}...)`,
      registry.connect(p.deployer).submitReading(farmIds[i], PERIOD, methodologyId, f.gross, f.baseline, evidenceHash)
    );
    const ev = findEvent(registry, receipt, "ReadingSubmitted");
    console.log(`     net verified after 10% leakage: ${Number(ev.args.netKg).toLocaleString("en-US")} kg CO2e (pending second verifier)`);
    readingIds.push(ev.args.readingId);
  }

  // 3. Security checks (staticCall: simulated, nothing is sent, no gas is spent)
  console.log("\n3. Security checks: the contract must refuse all of these");
  const fake = ethers.keccak256(ethers.toUtf8Bytes("fake evidence"));
  await expectRevert("an outsider submits a fake report",
    registry.connect(p.buyer).submitReading.staticCall(farmIds[0], 20264, methodologyId, 9000, 0, fake));
  if ((await registry.getReading(readingIds[0])).status === 1n) {
    await expectRevert("verifier A approves their own report",
      registry.connect(p.deployer).approveReading.staticCall(readingIds[0]));
  }
  await expectRevert("an inflated report (99,999 kg on 2.5 ha)",
    registry.connect(p.deployer).submitReading.staticCall(farmIds[0], 20264, methodologyId, 99999, 0, fake));
  await expectRevert("a report with no additionality (gross = baseline)",
    registry.connect(p.deployer).submitReading.staticCall(farmIds[0], 20264, methodologyId, 5000, 5000, fake));
  await expectRevert("a second claim for the same farm and quarter",
    registry.connect(p.verifierB).submitReading.staticCall(farmIds[0], PERIOD, methodologyId, 1000, 0, fake));

  // 4. Second verifier approves -> credits issued
  console.log("\n4. Verifier B (a different person) approves -> credits issued (90% farmer, 10% buffer pool)");
  for (let i = 0; i < readingIds.length; i++) {
    const r = await registry.getReading(readingIds[i]);
    if (r.status === 2n) {
      console.log(`   ✔ report #${readingIds[i]} already approved`);
      continue;
    }
    const receipt = await send(`approved report #${readingIds[i]}`, registry.connect(p.verifierB).approveReading(readingIds[i]));
    const ev = findEvent(registry, receipt, "ReadingApproved");
    console.log(`     ${FARMS[i].persona} receives ${vcc(ev.args.farmerCredits)}, buffer pool receives ${vcc(ev.args.bufferCredits)}`);
  }

  // 5. Committed funding
  console.log("\n5. A buyer commits funding up front (offtake): money locked on-chain for future tonnes");
  let offtakeId = (await market.offtakeCount()) > 0n ? 1n : 0n;
  if (offtakeId === 0n) {
    const deposit = (t(10) * price) / 10n ** 18n;
    const receipt = await send(
      `buyer locks ${eth(deposit)} for 10 tonnes at ${eth(price)}/tonne, for 90 days`,
      market.connect(p.buyer).createOfftake(t(10), price, 90 * DAY, { value: deposit })
    );
    offtakeId = findEvent(market, receipt, "OfftakeCreated").args.offtakeId;
  } else {
    console.log(`   ✔ offtake #${offtakeId} already exists`);
  }

  // 6. Amina sells into the offtake
  console.log("\n6. Amina sells into the offtake and is paid immediately at the agreed price");
  if ((await market.getOfftake(offtakeId)).remaining === t(10)) {
    await send("Amina approves the marketplace to move 6 VCC", token.connect(p.amina).approve(await market.getAddress(), t(6)));
    const receipt = await send("Amina sells 6 VCC into the offtake", market.connect(p.amina).sellToOfftake(offtakeId, t(6)));
    const ev = findEvent(market, receipt, "SoldToOfftake");
    console.log(`     paid ${eth(ev.args.costWei)}: ${eth(ev.args.farmerShareWei)} to Amina (80%), ${eth(ev.args.programmeShareWei)} to the programme fund (20%)`);
  } else {
    console.log("   ✔ already sold");
  }

  // 7. Jean on the open market
  console.log("\n7. Jean lists credits on the open market; the buyer buys some");
  let listingId = 0n;
  for (let i = 1n; i <= (await market.listingCount()); i++) {
    if ((await market.getListing(i)).seller === p.jean.address) listingId = i;
  }
  if (listingId === 0n) {
    await send("Jean approves the marketplace to hold 3 VCC", token.connect(p.jean).approve(await market.getAddress(), t(3)));
    const receipt = await send(`Jean lists 3 VCC at ${eth(price)}/tonne`, market.connect(p.jean).createListing(t(3), price));
    listingId = findEvent(market, receipt, "ListingCreated").args.listingId;
  } else {
    console.log(`   ✔ Jean's listing already exists (listing #${listingId})`);
  }
  if ((await market.getListing(listingId)).remaining === t(3)) {
    const cost = await market.quote(listingId, t(2));
    await send(`buyer pays ${eth(cost)} for 2 VCC`, market.connect(p.buyer).buy(listingId, t(2), { value: cost }));
  } else {
    console.log("   ✔ purchase already done");
  }

  // 8. Withdrawals
  console.log("\n8. Each party withdraws its share (where a mobile-money payout would happen)");
  for (const [label, signer] of [["Amina", p.amina], ["Jean", p.jean], ["Programme fund", p.deployer]]) {
    const owed = await market.pendingWithdrawals(signer.address);
    if (owed > 0n) await send(`${label} withdrew ${eth(owed)}`, market.connect(signer).withdraw());
    else console.log(`   ✔ ${label}: nothing left to withdraw`);
  }

  // 9. Retirement
  console.log("\n9. The buyer retires credits to claim its offset");
  if ((await token.retirementCount()) === 0n) {
    await send('retired 6 VCC for "Kigali Green Coffee Co." -> certificate #1',
      token.connect(p.buyer).retire(t(6), "Kigali Green Coffee Co.", "2026 roasting emissions"));
  } else {
    console.log("   ✔ retirement certificate already issued");
  }

  // Summary
  const cert = await token.getRetirement(1);
  const offtake = await market.getOfftake(offtakeId);
  console.log("\nSummary (read from the contracts)");
  console.log(`   Farms registered        : ${await registry.farmCount()}`);
  console.log(`   MRV reports             : ${await registry.readingCount()}`);
  console.log(`   Net CO2e verified       : ${(await registry.totalIssuedKg()).toLocaleString("en-US")} kg`);
  console.log(`   Buffer pool             : ${vcc(await registry.bufferPoolBalance())}`);
  console.log(`   Credits in circulation  : ${vcc(await token.totalSupply())}`);
  console.log(`   Credits retired         : ${vcc(await token.totalRetired())}`);
  console.log(`   Amina holds             : ${vcc(await token.balanceOf(p.amina.address))}`);
  console.log(`   Jean holds              : ${vcc(await token.balanceOf(p.jean.address))} (+ ${vcc((await market.getListing(listingId)).remaining)} listed)`);
  console.log(`   Paid by buyers          : ${eth(await market.totalVolumeWei())}`);
  console.log(`     to farmers (80%)      : ${eth(await market.totalToFarmersWei())}`);
  console.log(`     to programme (20%)    : ${eth(await market.totalToProgrammeWei())}`);
  console.log(`   Still committed (locked): ${eth(offtake.depositWei)} for ${vcc(offtake.remaining)}`);
  console.log(`   Certificate #1          : ${vcc(cert.amount)} for ${cert.beneficiary} (${cert.reason})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
