/**
 * dApp integration tests: the website's own code (frontend/src/lib) run against the real
 * contracts, to prove that what the website shows is what the chain actually does.
 *
 * Run with:  npx hardhat test
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const SAMPLES = path.join(__dirname, "..", "samples");
const vcc = (t) => ethers.parseUnits(String(t), 18);
const DAY = 24 * 60 * 60;

describe("dApp integration (website code vs. contracts)", function () {
  let ui;
  before(async function () {
    ui = await import("../frontend/src/lib/index.js"); // the exact modules the website uses
  });

  async function deployFixture() {
    const [admin, verifierB, farmer, buyer, outsider] = await ethers.getSigners();
    const token = await ethers.deployContract("VerdanaCarbonCredit", [admin.address]);
    const registry = await ethers.deployContract("VerdanaRegistry", [admin.address, await token.getAddress(), 5000, 1000]);
    const market = await ethers.deployContract("VerdanaMarketplace", [await token.getAddress(), admin.address, 8000]);
    await token.grantRole(await token.MINTER_ROLE(), await registry.getAddress());
    for (const role of [await registry.REGISTRAR_ROLE(), await registry.VERIFIER_ROLE()]) await registry.grantRole(role, admin.address);
    await registry.grantRole(await registry.VERIFIER_ROLE(), verifierB.address);
    const methodId = ethers.keccak256(ethers.toUtf8Bytes("VDN-AGF-01"));
    await registry.addMethodology(methodId, "VDN-AGF-01 Agroforestry biomass growth (demo)", 1000);
    return { token, registry, market, admin, verifierB, farmer, buyer, outsider, methodId };
  }

  it("TC-41 the website's issuance preview equals what the contract computes and mints", async function () {
    const { registry, token, admin, verifierB, farmer, methodId } = await loadFixture(deployFixture);
    await registry.registerFarm(farmer.address, ui.locationHash("geohash:kxt8f"), ethers.id("consent"), ui.hectaresToX100("5"), "Test");
    const cases = [
      [11250, 1250],
      [24999, 3],
      [7, 0],
      [12345, 6789],
    ];
    let quarter = 1;
    for (const [gross, baseline] of cases) {
      const p = ui.previewIssuance({ grossKg: gross, baselineKg: baseline, leakageBps: 1000, bufferBps: 1000 });
      const before = await token.balanceOf(farmer.address);
      await registry.connect(admin).submitReading(1, ui.toPeriod(2026, quarter), methodId, gross, baseline, ethers.id(`r${quarter}`));
      const id = await registry.readingCount();
      expect((await registry.getReading(id)).netKg).to.equal(p.net);
      await registry.connect(verifierB).approveReading(id);
      expect((await token.balanceOf(farmer.address)) - before).to.equal(p.farmer * ui.KG_TO_CREDIT_UNITS);
      quarter++;
    }
    expect(ui.maxReadingFor(500, 5000)).to.equal(await registry.maxReadingFor(1));
  });

  it("TC-42 the website's price quote and 80/20 split equal the marketplace's", async function () {
    const { token, registry, market, admin, verifierB, farmer, methodId } = await loadFixture(deployFixture);
    await registry.registerFarm(farmer.address, ethers.id("loc"), ethers.id("consent"), 250, "Test");
    await registry.submitReading(1, 20263, methodId, 11250, 1250, ethers.id("r"));
    await registry.connect(verifierB).approveReading(1);
    await token.connect(farmer).approve(await market.getAddress(), vcc(8));
    const price = ethers.parseEther("0.000123");
    await market.connect(farmer).createListing(vcc(8), price);
    for (const amount of [vcc(1), vcc("2.5"), vcc("0.333"), 12345678901234567n]) {
      const cost = ui.quoteCost(amount, price);
      expect(cost).to.equal(await market.quote(1, amount));
      const split = ui.splitPayment(cost, 8000);
      const [f, p] = await market.splitPayment(cost);
      expect([split.farmer, split.programme]).to.deep.equal([f, p]);
    }
    expect(admin.address).to.equal(await market.programmeFund());
  });

  it("TC-43 in-browser SHA-256 matches the evidence hash, and only the unaltered file is found on-chain", async function () {
    const { registry, token, market, verifierB, farmer, methodId } = await loadFixture(deployFixture);
    const bytes = fs.readFileSync(path.join(SAMPLES, "mrv-reports/farm-1-2026Q3.json"));
    const browserHash = await ui.hashFile(new File([bytes], "farm-1-2026Q3.json"));
    expect(browserHash).to.equal("0x" + crypto.createHash("sha256").update(bytes).digest("hex"));

    await registry.registerFarm(farmer.address, ethers.id("loc"), ethers.id("consent"), 250, "Musanze, Rwanda");
    await registry.submitReading(1, 20263, methodId, 11250, 1250, browserHash);
    await registry.connect(verifierB).approveReading(1);

    const programme = await ui.loadProgramme({ registry, token, market });
    const found = ui.findDocument(programme, browserHash);
    expect(found).to.have.length(1);
    expect(found[0].kind).to.equal("mrv");
    expect(found[0].reading.status).to.equal("Approved");

    const altered = Buffer.from(bytes.toString().replace("11250", "12250"));
    expect(ui.findDocument(programme, await ui.hashFile(new File([altered], "x.json")))).to.have.length(0);
  });

  it("TC-44 the website reads the full programme state correctly after a real scenario", async function () {
    const { token, registry, market, admin, verifierB, farmer, buyer, methodId } = await loadFixture(deployFixture);
    await registry.registerFarm(farmer.address, ethers.id("loc"), ethers.id("consent"), 250, "Musanze, Rwanda");
    await registry.submitReading(1, 20263, methodId, 11250, 1250, ethers.id("r"));
    await registry.connect(verifierB).approveReading(1);
    await market.connect(buyer).createOfftake(vcc(10), ethers.parseEther("0.001"), 90 * DAY, { value: ethers.parseEther("0.01") });
    await token.connect(farmer).approve(await market.getAddress(), vcc(6));
    await market.connect(farmer).sellToOfftake(1, vcc(6));
    await token.connect(buyer).retire(vcc(6), "Kigali Green Coffee Co.", "2026");

    const p = await ui.loadProgramme({ registry, token, market });
    expect(p.farms).to.have.length(1);
    expect(p.farms[0].region).to.equal("Musanze, Rwanda");
    expect(p.readings[0].status).to.equal("Approved");
    expect(p.totals.totalIssuedKg).to.equal(9000n);
    expect(p.totals.bufferPool).to.equal(vcc("0.9"));
    expect(p.totals.totalRetired).to.equal(vcc(6));
    expect(p.totals.totalCommittedWei).to.equal(ethers.parseEther("0.004"));
    expect(p.totals.totalToFarmersWei).to.equal(ethers.parseEther("0.0048"));
    expect(p.offtakes[0].remaining).to.equal(vcc(4));
    expect(p.retirements[0].beneficiary).to.equal("Kigali Green Coffee Co.");
    expect(p.settings.farmerShareBps).to.equal(8000);

    const me = await ui.loadAccount({ registry, token, market }, farmer.address);
    expect(me.vcc).to.equal(vcc("2.1"));
    expect(me.pending).to.equal(ethers.parseEther("0.0048"));
    expect(me.farmIds).to.deep.equal([1n]);
    const adminMe = await ui.loadAccount({ registry, token, market }, admin.address);
    expect(adminMe.roles).to.deep.equal({ admin: true, registrar: true, verifier: true });
    expect(ui.formatTokenAmount(me.vcc)).to.equal("2.1");
    expect(ui.formatEth(me.pending)).to.equal("0.0048 ETH");
    expect(ui.formatPeriod(20263)).to.equal("2026 Q3");
  });

  it("TC-45 contract refusals are shown to users in plain language", async function () {
    const { registry, outsider, methodId, farmer } = await loadFixture(deployFixture);
    await registry.registerFarm(farmer.address, ethers.id("loc"), ethers.id("consent"), 250, "Test");
    await registry.submitReading(1, 20263, methodId, 11250, 1250, ethers.id("r"));

    const refusal = async (promise) => {
      try {
        await promise;
      } catch (err) {
        return ui.friendlyError(err);
      }
      throw new Error("expected the contract to refuse");
    };
    expect(await refusal(registry.approveReading(1))).to.equal(
      "The smart contract refused this: A second, different verifier must approve."
    );
    expect(await refusal(registry.connect(outsider).submitReading(1, 20264, methodId, 100, 0, ethers.id("x")))).to.equal(
      "The smart contract refused this: your wallet does not have the MRV verifier role."
    );
    expect(await refusal(registry.submitReading(1, 20264, methodId, 500, 500, ethers.id("x")))).to.equal(
      "The smart contract refused this: No additional removals above the baseline."
    );
    expect(ui.friendlyError({ code: "ACTION_REJECTED" })).to.equal("You rejected the request in your wallet, so nothing was sent.");
  });
});
