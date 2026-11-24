/**
 * Test suite for Verdana Protocol (Ethereum edition).
 *
 * Run with:  npx hardhat test
 *
 * Each test has an ID (TC-01 ... TC-40) that matches the test-case table in TEST_CASES.md and
 * the project report.
 *
 * Worked example used throughout (farm of 2.5 ha, methodology with 10% leakage, 10% buffer):
 *   gross removals 11,250 kg - baseline 1,250 kg = 10,000 kg additional
 *   - 10% leakage                                 =  9,000 kg net verified
 *   - 10% to the permanence buffer pool           =    900 kg  (0.9 VCC, held by the registry)
 *   = farmer receives                               8,100 kg  (8.1 VCC)
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const vcc = (tonnes) => ethers.parseUnits(tonnes.toString(), 18); // 1 VCC = 1 tonne CO2e
const KG = 10n ** 15n; // base units per kg
const id = (text) => ethers.keccak256(ethers.toUtf8Bytes(text));

const LOCATION = id("geohash:kxt8f"); // coarse grid cell, never exact GPS
const LOCATION_2 = id("geohash:kxmuq");
const LAND_RECORD = id("signed land-rights and consent record, farm 1");
const EVIDENCE = id("MRV report 2026-Q3 farm 1: Sentinel-2 NDVI + 3 field plots + VDN-AGF-01 calculation");
const METHOD = id("VDN-AGF-01");
const METHOD_NAME = "VDN-AGF-01 Agroforestry biomass growth (demo)";
const LEAKAGE_BPS = 1000; // 10%
const BUFFER_BPS = 1000; // 10%
const AREA = 250; // 2.50 ha
const CAP = 5000; // kg CO2e per hectare per quarter (20 t/ha/year)
const PERIOD = 20263; // 2026, quarter 3
const GROSS = 11250;
const BASELINE = 1250;
const PRICE = ethers.parseEther("0.001"); // per tonne
const FARMER_SHARE_BPS = 8000; // 80% to the farmer, 20% to the programme fund
const farmerPart = (cost) => (cost * BigInt(FARMER_SHARE_BPS)) / 10000n;
const DAY = 24 * 60 * 60;

describe("Verdana Protocol", function () {
  async function deployFixture() {
    const [admin, registrar, verifierA, verifierB, farmer, buyer, outsider, fund] = await ethers.getSigners();

    const token = await ethers.deployContract("VerdanaCarbonCredit", [admin.address]);
    const registry = await ethers.deployContract("VerdanaRegistry", [admin.address, await token.getAddress(), CAP, BUFFER_BPS]);
    const market = await ethers.deployContract("VerdanaMarketplace", [await token.getAddress(), fund.address, FARMER_SHARE_BPS]);

    await token.grantRole(await token.MINTER_ROLE(), await registry.getAddress());
    await registry.grantRole(await registry.REGISTRAR_ROLE(), registrar.address);
    await registry.grantRole(await registry.VERIFIER_ROLE(), verifierA.address);
    await registry.grantRole(await registry.VERIFIER_ROLE(), verifierB.address);
    await registry.addMethodology(METHOD, METHOD_NAME, LEAKAGE_BPS);

    return { token, registry, market, admin, registrar, verifierA, verifierB, farmer, buyer, outsider, fund };
  }

  /** Fixture + one registered farm. */
  async function farmFixture() {
    const f = await deployFixture();
    await f.registry.connect(f.registrar).registerFarm(f.farmer.address, LOCATION, LAND_RECORD, AREA, "Musanze, Rwanda");
    return { ...f, farmId: 1n };
  }

  /** Farm + an approved report: the farmer holds 8.1 VCC and the buffer pool 0.9 VCC. */
  async function creditedFixture() {
    const f = await farmFixture();
    await f.registry.connect(f.verifierA).submitReading(f.farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE);
    await f.registry.connect(f.verifierB).approveReading(1);
    return f;
  }

  /** The farmer has listed 5 VCC at 0.001 ETH per tonne. */
  async function listedFixture() {
    const f = await creditedFixture();
    await f.token.connect(f.farmer).approve(await f.market.getAddress(), vcc(5));
    await f.market.connect(f.farmer).createListing(vcc(5), PRICE);
    return { ...f, listingId: 1n };
  }

  /** The buyer has committed 0.01 ETH for 10 future tonnes at 0.001 ETH, locked for 90 days. */
  async function offtakeFixture() {
    const f = await creditedFixture();
    await f.market.connect(f.buyer).createOfftake(vcc(10), PRICE, 90 * DAY, { value: ethers.parseEther("0.01") });
    return { ...f, offtakeId: 1n };
  }

  // =================================================================================
  // 1. Deployment and farm registration
  // =================================================================================
  describe("1. Deployment and farm registration", function () {
    it("TC-01 deploys with the right token, roles, limits and benefit split", async function () {
      const { token, registry, market, admin, fund } = await loadFixture(deployFixture);
      expect(await token.name()).to.equal("Verdana Carbon Credit");
      expect(await token.symbol()).to.equal("VCC");
      expect(await token.hasRole(await token.MINTER_ROLE(), await registry.getAddress())).to.equal(true);
      expect(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await registry.creditToken()).to.equal(await token.getAddress());
      expect(await registry.maxKgPerHectarePerPeriod()).to.equal(CAP);
      expect(await registry.bufferBps()).to.equal(BUFFER_BPS);
      expect(await market.creditToken()).to.equal(await token.getAddress());
      expect(await market.programmeFund()).to.equal(fund.address);
      expect(await market.farmerShareBps()).to.equal(FARMER_SHARE_BPS);
    });

    it("TC-02 a field agent registers a farm with a private location and a land-rights/consent record", async function () {
      const { registry, registrar, farmer } = await loadFixture(deployFixture);
      await expect(registry.connect(registrar).registerFarm(farmer.address, LOCATION, LAND_RECORD, AREA, "Musanze, Rwanda"))
        .to.emit(registry, "FarmRegistered")
        .withArgs(1n, farmer.address, LOCATION, LAND_RECORD, AREA, "Musanze, Rwanda");

      const farm = await registry.getFarm(1);
      expect(farm.farmer).to.equal(farmer.address);
      expect(farm.landRecordHash).to.equal(LAND_RECORD);
      expect(farm.areaHectaresX100).to.equal(AREA);
      expect(farm.active).to.equal(true);
      expect(await registry.farmsOf(farmer.address)).to.deep.equal([1n]);
      expect(await registry.locationRegistered(LOCATION)).to.equal(true);
    });

    it("TC-03 a wallet without the registrar role cannot register farms", async function () {
      const { registry, outsider, farmer } = await loadFixture(deployFixture);
      await expect(registry.connect(outsider).registerFarm(farmer.address, LOCATION, LAND_RECORD, AREA, "X"))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, await registry.REGISTRAR_ROLE());
    });

    it("TC-04 the same plot cannot be registered twice (prevents double claiming)", async function () {
      const { registry, registrar, buyer } = await loadFixture(farmFixture);
      await expect(
        registry.connect(registrar).registerFarm(buyer.address, LOCATION, LAND_RECORD, AREA, "Musanze, Rwanda")
      ).to.be.revertedWith("Verdana: this plot is already registered");
    });

    it("TC-05 incomplete farm details are rejected, including a missing consent record", async function () {
      const { registry, registrar, farmer } = await loadFixture(deployFixture);
      const r = registry.connect(registrar);
      await expect(r.registerFarm(ethers.ZeroAddress, LOCATION, LAND_RECORD, AREA, "X")).to.be.revertedWith(
        "Verdana: farmer is the zero address"
      );
      await expect(r.registerFarm(farmer.address, ethers.ZeroHash, LAND_RECORD, AREA, "X")).to.be.revertedWith(
        "Verdana: location hash is required"
      );
      await expect(r.registerFarm(farmer.address, LOCATION, ethers.ZeroHash, AREA, "X")).to.be.revertedWith(
        "Verdana: land-rights and consent record is required"
      );
      await expect(r.registerFarm(farmer.address, LOCATION, LAND_RECORD, 0, "X")).to.be.revertedWith(
        "Verdana: area must be greater than zero"
      );
    });
  });

  // =================================================================================
  // 2. Methodologies
  // =================================================================================
  describe("2. Carbon-accounting methodologies", function () {
    it("TC-06 only the admin can approve methodologies, with a leakage deduction of at most 50%", async function () {
      const { registry, admin, outsider } = await loadFixture(deployFixture);
      const m = await registry.getMethodology(METHOD);
      expect(m.name).to.equal(METHOD_NAME);
      expect(m.leakageBps).to.equal(LEAKAGE_BPS);
      expect(m.active).to.equal(true);
      expect(await registry.methodologyIds()).to.deep.equal([METHOD]);

      await expect(registry.connect(outsider).addMethodology(id("X"), "X", 0)).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount"
      );
      await expect(registry.connect(admin).addMethodology(METHOD, "again", 0)).to.be.revertedWith(
        "Verdana: methodology already exists"
      );
      await expect(registry.connect(admin).addMethodology(id("Y"), "Y", 5001)).to.be.revertedWith(
        "Verdana: leakage cannot exceed 50%"
      );
      await expect(registry.connect(admin).addMethodology(id("Z"), "Z v1", 500))
        .to.emit(registry, "MethodologyAdded")
        .withArgs(id("Z"), "Z v1", 500);
    });
  });

  // =================================================================================
  // 3. MRV reports: the fix for the "any wallet can submit a reading" flaw
  // =================================================================================
  describe("3. MRV reports and independent verification", function () {
    it("TC-07 a verifier submits a report; only removals above the baseline, minus leakage, count", async function () {
      const { registry, verifierA, farmId } = await loadFixture(farmFixture);
      await expect(registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE))
        .to.emit(registry, "ReadingSubmitted")
        .withArgs(1n, farmId, PERIOD, METHOD, GROSS, BASELINE, 9000n, EVIDENCE, verifierA.address);

      const reading = await registry.getReading(1);
      expect(reading.status).to.equal(1n); // Pending
      expect(reading.netKg).to.equal(9000n); // (11,250 - 1,250) x 90%
      expect(reading.evidenceHash).to.equal(EVIDENCE);
      expect(await registry.activeReadingFor(farmId, PERIOD)).to.equal(1n);
    });

    it("TC-08 any other wallet is rejected: only approved verifiers can submit reports", async function () {
      const { registry, outsider, farmId } = await loadFixture(farmFixture);
      await expect(registry.connect(outsider).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, await registry.VERIFIER_ROLE());
    });

    it("TC-09 a farmer can never verify their own farm, even with the verifier role", async function () {
      const { registry, admin, farmer, verifierA, farmId } = await loadFixture(farmFixture);
      await registry.connect(admin).grantRole(await registry.VERIFIER_ROLE(), farmer.address);
      await expect(
        registry.connect(farmer).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE)
      ).to.be.revertedWith("Verdana: farmers cannot verify their own farm");

      await registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE);
      await expect(registry.connect(farmer).approveReading(1)).to.be.revertedWith(
        "Verdana: farmers cannot verify their own farm"
      );
    });

    it("TC-10 gross removals above the plausible maximum for the farm's size are rejected", async function () {
      const { registry, verifierA, farmId } = await loadFixture(farmFixture);
      const max = await registry.maxReadingFor(farmId); // 5,000 kg/ha x 2.5 ha
      expect(max).to.equal(12500n);
      await expect(
        registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, max + 1n, BASELINE, EVIDENCE)
      ).to.be.revertedWith("Verdana: reading exceeds the plausible maximum for this farm");
      await expect(registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, max, BASELINE, EVIDENCE)).to.not.be
        .reverted;
    });

    it("TC-11 no additionality, no credit: removals at or below the baseline are rejected", async function () {
      const { registry, verifierA, farmId } = await loadFixture(farmFixture);
      await expect(
        registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, 5000, 5000, EVIDENCE)
      ).to.be.revertedWith("Verdana: no additional removals above the baseline");
      await expect(
        registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, 5000, 6000, EVIDENCE)
      ).to.be.revertedWith("Verdana: no additional removals above the baseline");
    });

    it("TC-12 reports must use an approved, active methodology", async function () {
      const { registry, admin, verifierA, farmId } = await loadFixture(farmFixture);
      await expect(
        registry.connect(verifierA).submitReading(farmId, PERIOD, id("UNKNOWN"), GROSS, BASELINE, EVIDENCE)
      ).to.be.revertedWith("Verdana: methodology is not approved");
      await expect(registry.connect(admin).setMethodologyActive(METHOD, false))
        .to.emit(registry, "MethodologyStatusChanged")
        .withArgs(METHOD, false);
      await expect(
        registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE)
      ).to.be.revertedWith("Verdana: methodology is not approved");
    });

    it("TC-13 the same farm cannot claim the same quarter twice", async function () {
      const { registry, verifierA, verifierB, farmId } = await loadFixture(farmFixture);
      await registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE);
      await expect(
        registry.connect(verifierB).submitReading(farmId, PERIOD, METHOD, 2000, 0, EVIDENCE)
      ).to.be.revertedWith("Verdana: this farm already has a reading for this period");
      // The next quarter is fine.
      await expect(registry.connect(verifierB).submitReading(farmId, 20264, METHOD, 2000, 0, EVIDENCE)).to.not.be.reverted;
    });

    it("TC-14 invalid reports are rejected (bad period, zero amount, missing evidence, unknown farm)", async function () {
      const { registry, verifierA, farmId } = await loadFixture(farmFixture);
      const v = registry.connect(verifierA);
      await expect(v.submitReading(farmId, 20265, METHOD, GROSS, BASELINE, EVIDENCE)).to.be.revertedWith(
        "Verdana: period must be YYYYQ, e.g. 20263"
      );
      await expect(v.submitReading(farmId, 2026, METHOD, GROSS, BASELINE, EVIDENCE)).to.be.revertedWith(
        "Verdana: period must be YYYYQ, e.g. 20263"
      );
      await expect(v.submitReading(farmId, PERIOD, METHOD, 0, 0, EVIDENCE)).to.be.revertedWith(
        "Verdana: reading must be greater than zero"
      );
      await expect(v.submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, ethers.ZeroHash)).to.be.revertedWith(
        "Verdana: evidence hash is required"
      );
      await expect(v.submitReading(99, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE)).to.be.revertedWith(
        "Verdana: farm does not exist"
      );
    });

    it("TC-15 the verifier who submitted a report cannot approve it (two-verifier rule)", async function () {
      const { registry, verifierA, farmId } = await loadFixture(farmFixture);
      await registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE);
      await expect(registry.connect(verifierA).approveReading(1)).to.be.revertedWith(
        "Verdana: a second, different verifier must approve"
      );
    });

    it("TC-16 a second verifier's approval issues net tonnes: 90% to the farmer, 10% to the buffer pool", async function () {
      const { registry, token, verifierA, verifierB, farmer, farmId } = await loadFixture(farmFixture);
      await registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE);

      await expect(registry.connect(verifierB).approveReading(1))
        .to.emit(registry, "ReadingApproved")
        .withArgs(1n, farmId, verifierB.address, 8100n * KG, 900n * KG);

      expect(await token.balanceOf(farmer.address)).to.equal(vcc("8.1"));
      expect(await registry.bufferPoolBalance()).to.equal(vcc("0.9"));
      expect(await token.totalSupply()).to.equal(vcc(9));
      expect(await registry.totalIssuedKg()).to.equal(9000n);
      expect((await registry.getFarm(farmId)).issuedKg).to.equal(9000n);
      const reading = await registry.getReading(1);
      expect(reading.status).to.equal(2n); // Approved
      expect(reading.reviewedBy).to.equal(verifierB.address);
    });

    it("TC-17 a report can only be decided once", async function () {
      const { registry, verifierA, verifierB } = await loadFixture(creditedFixture);
      await expect(registry.connect(verifierA).approveReading(1)).to.be.revertedWith("Verdana: reading is not pending");
      await expect(registry.connect(verifierB).rejectReading(1, "late objection")).to.be.revertedWith(
        "Verdana: reading is not pending"
      );
    });

    it("TC-18 a rejected report issues nothing and frees the quarter for a corrected report", async function () {
      const { registry, token, verifierA, verifierB, farmer, farmId } = await loadFixture(farmFixture);
      await registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, 12000, 0, EVIDENCE);
      await expect(registry.connect(verifierB).rejectReading(1, "Field plots do not match satellite estimate"))
        .to.emit(registry, "ReadingRejected")
        .withArgs(1n, farmId, verifierB.address, "Field plots do not match satellite estimate");

      expect(await token.totalSupply()).to.equal(0n);
      expect(await registry.activeReadingFor(farmId, PERIOD)).to.equal(0n);
      await expect(registry.connect(verifierB).rejectReading(2, "x")).to.be.revertedWith("Verdana: reading does not exist");

      await registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE); // corrected
      await registry.connect(verifierB).approveReading(2);
      expect(await token.balanceOf(farmer.address)).to.equal(vcc("8.1"));
    });

    it("TC-19 an inactive farm cannot receive new reports or approvals", async function () {
      const { registry, registrar, verifierA, verifierB, farmId } = await loadFixture(farmFixture);
      await registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE);
      await expect(registry.connect(registrar).setFarmActive(farmId, false))
        .to.emit(registry, "FarmStatusChanged")
        .withArgs(farmId, false);
      await expect(registry.connect(verifierB).approveReading(1)).to.be.revertedWith("Verdana: farm is not active");
      await expect(
        registry.connect(verifierA).submitReading(farmId, 20264, METHOD, GROSS, BASELINE, EVIDENCE)
      ).to.be.revertedWith("Verdana: farm is not active");
    });

    it("TC-20 a revoked verifier immediately loses the ability to submit", async function () {
      const { registry, admin, verifierA, farmId } = await loadFixture(farmFixture);
      await registry.connect(admin).revokeRole(await registry.VERIFIER_ROLE(), verifierA.address);
      await expect(
        registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });

  // =================================================================================
  // 4. Permanence: reversals and the buffer pool
  // =================================================================================
  describe("4. Permanence (reversals)", function () {
    it("TC-21 a reversal deactivates the farm and cancels buffer credits; credits people hold are untouched", async function () {
      const { registry, token, verifierB, farmer, farmId } = await loadFixture(creditedFixture);
      const tx = registry.connect(verifierB).recordReversal(farmId, 600, "0.2 ha cleared, confirmed by field visit");
      await expect(tx)
        .to.emit(registry, "ReversalRecorded")
        .withArgs(farmId, 600n, 600n * KG, verifierB.address, "0.2 ha cleared, confirmed by field visit");
      await expect(tx).to.emit(token, "CreditsCancelled").withArgs(await registry.getAddress(), 600n * KG);

      expect((await registry.getFarm(farmId)).active).to.equal(false);
      expect((await registry.getFarm(farmId)).reversedKg).to.equal(600n);
      expect(await registry.bufferPoolBalance()).to.equal(vcc("0.3"));
      expect(await token.totalCancelled()).to.equal(vcc("0.6"));
      expect(await token.balanceOf(farmer.address)).to.equal(vcc("8.1")); // unchanged
    });

    it("TC-22 reversal rules: verifiers only, a reason, no more than was credited; cancels at most the pool", async function () {
      const { registry, outsider, verifierA, farmId } = await loadFixture(creditedFixture);
      await expect(registry.connect(outsider).recordReversal(farmId, 100, "x")).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount"
      );
      await expect(registry.connect(verifierA).recordReversal(farmId, 100, "")).to.be.revertedWith(
        "Verdana: a reason is required"
      );
      await expect(registry.connect(verifierA).recordReversal(farmId, 0, "x")).to.be.revertedWith(
        "Verdana: lost amount must be greater than zero"
      );
      await expect(registry.connect(verifierA).recordReversal(farmId, 9001, "x")).to.be.revertedWith(
        "Verdana: loss exceeds what this farm was credited"
      );
      // Losing everything (9,000 kg) cancels the whole 900 kg pool, never more.
      await expect(registry.connect(verifierA).recordReversal(farmId, 9000, "Fire destroyed the woodlot"))
        .to.emit(registry, "ReversalRecorded")
        .withArgs(farmId, 9000n, 900n * KG, verifierA.address, "Fire destroyed the woodlot");
      expect(await registry.bufferPoolBalance()).to.equal(0n);
    });
  });

  // =================================================================================
  // 5. Administration and emergency controls
  // =================================================================================
  describe("5. Administration", function () {
    it("TC-23 the admin can pause and unpause; paused actions revert", async function () {
      const { registry, admin, registrar, verifierA, farmer, farmId } = await loadFixture(farmFixture);
      await registry.connect(admin).pause();
      await expect(
        registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE)
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");
      await expect(
        registry.connect(registrar).registerFarm(farmer.address, LOCATION_2, LAND_RECORD, AREA, "X")
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");
      await registry.connect(admin).unpause();
      await expect(registry.connect(verifierA).submitReading(farmId, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE)).to.not.be
        .reverted;
    });

    it("TC-24 only the admin can pause or change limits, and limits stay within safe bounds", async function () {
      const { registry, token, admin, outsider } = await loadFixture(deployFixture);
      await expect(registry.connect(outsider).pause()).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      await expect(registry.connect(outsider).setMaxKgPerHectarePerPeriod(1)).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount"
      );
      await expect(registry.connect(admin).setMaxKgPerHectarePerPeriod(4000))
        .to.emit(registry, "MaxRateUpdated")
        .withArgs(CAP, 4000);
      await expect(registry.connect(admin).setMaxKgPerHectarePerPeriod(0)).to.be.revertedWith(
        "Verdana: cap must be greater than zero"
      );
      await expect(registry.connect(admin).setBufferBps(1500)).to.emit(registry, "BufferUpdated").withArgs(BUFFER_BPS, 1500);
      await expect(registry.connect(admin).setBufferBps(400)).to.be.revertedWith("Verdana: buffer must be between 5% and 50%");
      await expect(
        ethers.deployContract("VerdanaRegistry", [admin.address, await token.getAddress(), CAP, 100])
      ).to.be.revertedWith("Verdana: buffer must be between 5% and 50%");
    });
  });

  // =================================================================================
  // 6. Carbon credit token
  // =================================================================================
  describe("6. Carbon credit token (VCC)", function () {
    it("TC-25 only the registry can mint or cancel credits, not even the admin", async function () {
      const { token, admin, outsider } = await loadFixture(deployFixture);
      await expect(token.connect(admin).mint(admin.address, vcc(1)))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
        .withArgs(admin.address, await token.MINTER_ROLE());
      await expect(token.connect(outsider).mint(outsider.address, vcc(1))).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
      await expect(token.connect(admin).cancel(vcc(1))).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("TC-26 retiring credits burns them and records a public certificate", async function () {
      const { token, farmer } = await loadFixture(creditedFixture);
      await expect(token.connect(farmer).retire(vcc(2), "Kigali Green Coffee Co.", "2026 roasting emissions"))
        .to.emit(token, "CreditsRetired")
        .withArgs(1n, farmer.address, vcc(2), "Kigali Green Coffee Co.", "2026 roasting emissions");

      expect(await token.balanceOf(farmer.address)).to.equal(vcc("6.1"));
      expect(await token.totalSupply()).to.equal(vcc(7));
      expect(await token.totalRetired()).to.equal(vcc(2));
      const cert = await token.getRetirement(1);
      expect(cert.beneficiary).to.equal("Kigali Green Coffee Co.");
      expect(cert.amount).to.equal(vcc(2));
    });

    it("TC-27 credits cannot be retired twice, without a beneficiary, or beyond the balance", async function () {
      const { token, farmer } = await loadFixture(creditedFixture);
      await expect(token.connect(farmer).retire(vcc(9), "A", "")).to.be.revertedWithCustomError(
        token,
        "ERC20InsufficientBalance"
      );
      await expect(token.connect(farmer).retire(vcc(1), "", "")).to.be.revertedWith("VCC: beneficiary is required");
      await expect(token.connect(farmer).retire(0, "A", "")).to.be.revertedWith("VCC: amount must be greater than zero");
      await token.connect(farmer).retire(vcc("8.1"), "A", "all");
      await expect(token.connect(farmer).retire(vcc(1), "A", "again")).to.be.revertedWithCustomError(
        token,
        "ERC20InsufficientBalance"
      );
      await expect(token.getRetirement(2)).to.be.revertedWith("VCC: certificate does not exist");
    });
  });

  // =================================================================================
  // 7. Marketplace: open market and benefit sharing
  // =================================================================================
  describe("7. Marketplace (open market)", function () {
    it("TC-28 the farmer's share can never be set below 70%", async function () {
      const { token, fund } = await loadFixture(deployFixture);
      const t = await token.getAddress();
      await expect(ethers.deployContract("VerdanaMarketplace", [t, fund.address, 6999])).to.be.revertedWith(
        "Marketplace: farmer share must be between 70% and 100%"
      );
      await expect(ethers.deployContract("VerdanaMarketplace", [t, fund.address, 10001])).to.be.revertedWith(
        "Marketplace: farmer share must be between 70% and 100%"
      );
      await expect(ethers.deployContract("VerdanaMarketplace", [t, ethers.ZeroAddress, 8000])).to.be.revertedWith(
        "Marketplace: programme fund is the zero address"
      );
    });

    it("TC-29 a farmer lists credits, which are held in escrow by the marketplace", async function () {
      const { token, market, farmer } = await loadFixture(creditedFixture);
      await token.connect(farmer).approve(await market.getAddress(), vcc(5));
      await expect(market.connect(farmer).createListing(vcc(5), PRICE))
        .to.emit(market, "ListingCreated")
        .withArgs(1n, farmer.address, vcc(5), PRICE);
      expect(await token.balanceOf(await market.getAddress())).to.equal(vcc(5));
      expect(await token.balanceOf(farmer.address)).to.equal(vcc("3.1"));
    });

    it("TC-30 a buyer pays the exact price; the payment is split 80% farmer / 20% programme fund", async function () {
      const { token, market, farmer, buyer, fund, listingId } = await loadFixture(listedFixture);
      const cost = await market.quote(listingId, vcc(2)); // 2 t x 0.001 ETH
      expect(cost).to.equal(ethers.parseEther("0.002"));
      const [toFarmer, toFund] = await market.splitPayment(cost);
      expect(toFarmer).to.equal(ethers.parseEther("0.0016"));
      expect(toFund).to.equal(ethers.parseEther("0.0004"));

      const tx = market.connect(buyer).buy(listingId, vcc(2), { value: cost });
      await expect(tx).to.changeEtherBalances([buyer, market], [-cost, cost]);
      await expect(tx)
        .to.emit(market, "CreditsPurchased")
        .withArgs(listingId, buyer.address, farmer.address, vcc(2), cost, toFarmer, toFund);

      expect(await token.balanceOf(buyer.address)).to.equal(vcc(2));
      expect(await market.pendingWithdrawals(farmer.address)).to.equal(toFarmer);
      expect(await market.pendingWithdrawals(fund.address)).to.equal(toFund);
      expect((await market.getListing(listingId)).remaining).to.equal(vcc(3)); // partial purchase
    });

    it("TC-31 wrong payments and invalid purchases are rejected", async function () {
      const { market, farmer, buyer, listingId } = await loadFixture(listedFixture);
      const cost = await market.quote(listingId, vcc(1));
      await expect(market.connect(buyer).buy(listingId, vcc(1), { value: cost - 1n })).to.be.revertedWith(
        "Marketplace: send the exact price"
      );
      await expect(market.connect(buyer).buy(listingId, vcc(6), { value: cost * 6n })).to.be.revertedWith(
        "Marketplace: not enough credits in this listing"
      );
      await expect(market.connect(farmer).buy(listingId, vcc(1), { value: cost })).to.be.revertedWith(
        "Marketplace: you cannot buy your own listing"
      );
      await expect(market.connect(buyer).buy(99, vcc(1), { value: cost })).to.be.revertedWith(
        "Marketplace: listing does not exist"
      );
    });

    it("TC-32 the farmer and the programme fund each withdraw their share exactly once", async function () {
      const { market, farmer, buyer, fund, listingId } = await loadFixture(listedFixture);
      const cost = await market.quote(listingId, vcc(5));
      await market.connect(buyer).buy(listingId, vcc(5), { value: cost });
      expect((await market.getListing(listingId)).active).to.equal(false); // sold out

      const tx = market.connect(farmer).withdraw();
      await expect(tx).to.changeEtherBalances([farmer, market], [farmerPart(cost), -farmerPart(cost)]);
      await expect(tx).to.emit(market, "Withdrawn").withArgs(farmer.address, farmerPart(cost));
      await expect(market.connect(farmer).withdraw()).to.be.revertedWith("Marketplace: nothing to withdraw");
      await expect(market.connect(fund).withdraw()).to.changeEtherBalance(fund, cost - farmerPart(cost));
      expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(0n);
    });

    it("TC-33 only the seller can cancel; unsold credits are returned and the listing closes", async function () {
      const { token, market, farmer, buyer, listingId } = await loadFixture(listedFixture);
      await expect(market.connect(buyer).cancelListing(listingId)).to.be.revertedWith(
        "Marketplace: only the seller can cancel"
      );
      await expect(market.connect(farmer).cancelListing(listingId))
        .to.emit(market, "ListingCancelled")
        .withArgs(listingId, farmer.address, vcc(5));
      expect(await token.balanceOf(farmer.address)).to.equal(vcc("8.1"));
      await expect(market.connect(buyer).buy(listingId, vcc(1), { value: PRICE })).to.be.revertedWith(
        "Marketplace: listing is not active"
      );
    });

    it("TC-34 a re-entrancy attack on withdraw() cannot drain the marketplace", async function () {
      const f = await loadFixture(farmFixture);
      const { registry, token, market, registrar, verifierA, verifierB, buyer, farmer } = f;
      // A malicious contract registers as a "farmer", earns credits, sells them, then attacks.
      const attacker = await ethers.deployContract("ReentrancyAttacker", [await market.getAddress(), await token.getAddress()]);
      await registry.connect(registrar).registerFarm(await attacker.getAddress(), LOCATION_2, LAND_RECORD, AREA, "Attacker farm");
      await registry.connect(verifierA).submitReading(2, PERIOD, METHOD, 5000, 0, EVIDENCE);
      await registry.connect(verifierB).approveReading(1); // attacker receives 4.05 VCC
      await attacker.list(vcc(4), PRICE);
      const cost = await market.quote(1, vcc(4));
      await market.connect(buyer).buy(1, vcc(4), { value: cost });

      // An honest farmer also has ETH waiting in the marketplace.
      await registry.connect(verifierA).submitReading(1, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE);
      await registry.connect(verifierB).approveReading(2);
      await token.connect(farmer).approve(await market.getAddress(), vcc(8));
      await market.connect(farmer).createListing(vcc(8), PRICE);
      const honestCost = await market.quote(2, vcc(8));
      await market.connect(buyer).buy(2, vcc(8), { value: honestCost });

      await attacker.attack();
      expect(await attacker.reentryAttempts()).to.equal(1n);
      expect(await attacker.reentrySucceeded()).to.equal(false); // blocked by ReentrancyGuard
      expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(farmerPart(cost)); // paid once only
      // Everything owed to the honest farmer and the programme fund is still there.
      expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(cost + honestCost - farmerPart(cost));
    });
  });

  // =================================================================================
  // 8. Committed funding (offtake agreements)
  // =================================================================================
  describe("8. Committed funding (offtakes)", function () {
    it("TC-35 a buyer locks funds for future tonnes; a farmer sells into it and is paid at once", async function () {
      const { token, market, farmer, buyer, fund, offtakeId } = await loadFixture(offtakeFixture);
      const offtake = await market.getOfftake(offtakeId);
      expect(offtake.depositWei).to.equal(ethers.parseEther("0.01"));
      expect(await market.totalCommittedWei()).to.equal(ethers.parseEther("0.01"));

      await token.connect(farmer).approve(await market.getAddress(), vcc(5));
      const cost = ethers.parseEther("0.005");
      await expect(market.connect(farmer).sellToOfftake(offtakeId, vcc(5)))
        .to.emit(market, "SoldToOfftake")
        .withArgs(offtakeId, farmer.address, buyer.address, vcc(5), cost, farmerPart(cost), cost - farmerPart(cost));

      expect(await token.balanceOf(buyer.address)).to.equal(vcc(5)); // credits go straight to the buyer
      expect(await market.pendingWithdrawals(farmer.address)).to.equal(farmerPart(cost));
      expect(await market.pendingWithdrawals(fund.address)).to.equal(cost - farmerPart(cost));
      expect((await market.getOfftake(offtakeId)).remaining).to.equal(vcc(5));
      expect(await market.totalCommittedWei()).to.equal(ethers.parseEther("0.005"));
      await expect(market.connect(farmer).withdraw()).to.changeEtherBalance(farmer, farmerPart(cost));
    });

    it("TC-36 committed funds are locked: wrong deposits, early withdrawal and over-delivery are rejected", async function () {
      const { token, market, farmer, buyer, offtakeId } = await loadFixture(offtakeFixture);
      await expect(
        market.connect(buyer).createOfftake(vcc(10), PRICE, 90 * DAY, { value: ethers.parseEther("0.009") })
      ).to.be.revertedWith("Marketplace: deposit must equal amount x price");
      await expect(market.connect(buyer).createOfftake(vcc(1), PRICE, 60, { value: PRICE })).to.be.revertedWith(
        "Marketplace: duration must be between 1 day and 5 years"
      );
      await expect(market.connect(buyer).closeOfftake(offtakeId)).to.be.revertedWith(
        "Marketplace: funds are locked until the offtake expires"
      );
      await expect(market.connect(farmer).closeOfftake(offtakeId)).to.be.revertedWith(
        "Marketplace: only the buyer can close"
      );
      await token.connect(farmer).approve(await market.getAddress(), vcc(8));
      await expect(market.connect(farmer).sellToOfftake(offtakeId, vcc(11))).to.be.revertedWith(
        "Marketplace: offtake does not need that many credits"
      );
      await expect(market.connect(buyer).sellToOfftake(offtakeId, vcc(1))).to.be.revertedWith(
        "Marketplace: you cannot sell to your own offtake"
      );
    });

    it("TC-37 after expiry, sales stop and the buyer gets the unused deposit back", async function () {
      const { token, market, farmer, buyer, offtakeId } = await loadFixture(offtakeFixture);
      await token.connect(farmer).approve(await market.getAddress(), vcc(4));
      await market.connect(farmer).sellToOfftake(offtakeId, vcc(4)); // uses 0.004 ETH

      await time.increase(90 * DAY);
      await expect(market.connect(farmer).sellToOfftake(offtakeId, vcc(1))).to.be.revertedWith(
        "Marketplace: offtake has expired"
      );
      const refund = ethers.parseEther("0.006");
      await expect(market.connect(buyer).closeOfftake(offtakeId))
        .to.emit(market, "OfftakeClosed")
        .withArgs(offtakeId, buyer.address, refund);
      expect(await market.totalCommittedWei()).to.equal(0n);
      await expect(market.connect(buyer).withdraw()).to.changeEtherBalance(buyer, refund);
      await expect(market.connect(buyer).closeOfftake(offtakeId)).to.be.revertedWith("Marketplace: offtake is not active");
    });

    it("TC-38 a fully delivered offtake closes automatically; rounding dust goes back to the buyer", async function () {
      const f = await loadFixture(creditedFixture);
      await f.market.connect(f.buyer).createOfftake(vcc(3), PRICE, 30 * DAY, { value: ethers.parseEther("0.003") });
      await f.token.connect(f.farmer).approve(await f.market.getAddress(), vcc(3));
      await f.market.connect(f.farmer).sellToOfftake(1, vcc(3));
      const offtake = await f.market.getOfftake(1);
      expect(offtake.active).to.equal(false);
      expect(offtake.remaining).to.equal(0n);
      expect(offtake.depositWei).to.equal(0n);
      expect(await f.market.totalCommittedWei()).to.equal(0n);

      // Rounding dust: 1 t at 3 wei, delivered as 2 x 0.5 t (1 wei each), leaves 1 wei -> refunded to the buyer.
      await f.market.connect(f.buyer).createOfftake(vcc(1), 3n, 30 * DAY, { value: 3n });
      await f.token.connect(f.farmer).approve(await f.market.getAddress(), vcc(1));
      await f.market.connect(f.farmer).sellToOfftake(2, vcc("0.5"));
      await f.market.connect(f.farmer).sellToOfftake(2, vcc("0.5"));
      expect((await f.market.getOfftake(2)).active).to.equal(false);
      expect(await f.market.pendingWithdrawals(f.buyer.address)).to.equal(1n);
      expect(await f.market.totalCommittedWei()).to.equal(0n);
    });
  });

  // =================================================================================
  // 9. End-to-end
  // =================================================================================
  describe("9. End-to-end", function () {
    it("TC-39 full journey: register, report, verify, committed sale, open-market sale, payouts, retirement", async function () {
      const { registry, token, market, registrar, verifierA, verifierB, farmer, buyer, fund } = await loadFixture(deployFixture);

      await registry.connect(registrar).registerFarm(farmer.address, LOCATION, LAND_RECORD, AREA, "Musanze, Rwanda");
      await registry.connect(verifierA).submitReading(1, PERIOD, METHOD, GROSS, BASELINE, EVIDENCE);
      await registry.connect(verifierB).approveReading(1); // 8.1 VCC to the farmer, 0.9 to the buffer

      await market.connect(buyer).createOfftake(vcc(5), PRICE, 90 * DAY, { value: ethers.parseEther("0.005") });
      await token.connect(farmer).approve(await market.getAddress(), vcc(8));
      await market.connect(farmer).sellToOfftake(1, vcc(5)); // paid at once from committed funds
      await market.connect(farmer).createListing(vcc(3), PRICE);
      await market.connect(buyer).buy(1, vcc(2), { value: ethers.parseEther("0.002") });

      const paid = ethers.parseEther("0.007");
      await expect(market.connect(farmer).withdraw()).to.changeEtherBalance(farmer, farmerPart(paid));
      await expect(market.connect(fund).withdraw()).to.changeEtherBalance(fund, paid - farmerPart(paid));
      await token.connect(buyer).retire(vcc(7), "Kigali Green Coffee Co.", "2026 emissions");

      // Every tonne ever issued is accounted for: in circulation, retired or cancelled.
      const issued = (await registry.totalIssuedKg()) * KG;
      expect(issued).to.equal(vcc(9));
      expect((await token.totalSupply()) + (await token.totalRetired()) + (await token.totalCancelled())).to.equal(issued);
      expect(await token.balanceOf(await market.getAddress())).to.equal(vcc(1)); // still listed
      expect(await registry.bufferPoolBalance()).to.equal(vcc("0.9"));
      expect(await market.totalToFarmersWei()).to.equal(farmerPart(paid));
    });

    it("TC-40 views report farms, reports and limits correctly", async function () {
      const { registry, verifierA, verifierB, farmId } = await loadFixture(farmFixture);
      await registry.connect(verifierA).submitReading(farmId, 20262, METHOD, 5000, 1000, EVIDENCE);
      await registry.connect(verifierB).submitReading(farmId, PERIOD, METHOD, 6000, 1000, EVIDENCE);
      expect(await registry.readingsOfFarm(farmId)).to.deep.equal([1n, 2n]);
      expect(await registry.readingCount()).to.equal(2n);
      expect(await registry.farmCount()).to.equal(1n);
      await expect(registry.getFarm(2)).to.be.revertedWith("Verdana: farm does not exist");
      await expect(registry.getReading(3)).to.be.revertedWith("Verdana: reading does not exist");
      await expect(registry.getMethodology(id("NOPE"))).to.be.revertedWith("Verdana: methodology does not exist");
    });
  });
});
