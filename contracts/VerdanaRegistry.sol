// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {VerdanaCarbonCredit} from "./VerdanaCarbonCredit.sol";

/**
 * @title  VerdanaRegistry
 * @notice The record-keeping core of Verdana Protocol. It aggregates smallholder farms into one
 *         programme, records their MRV (measurement, reporting and verification) reports and
 *         issues carbon credits (VCC) only for verified, additional removals.
 *
 *         Sequestration is not automatically a carbon credit, and one wallet's word is not
 *         evidence. (The hackathon version of Verdana let ANY wallet submit a carbon reading.)
 *         This contract therefore enforces, in code:
 *
 *         1. Roles: only approved field agents (REGISTRAR_ROLE) register farms, each with the
 *            hash of a signed land-rights and consent record; only approved MRV verifiers
 *            (VERIFIER_ROLE) submit or review reports.
 *         2. Methodology: every report must use a carbon-accounting methodology approved by the
 *            programme admin, which sets the leakage deduction.
 *         3. Additionality: credits are issued only for removals ABOVE the report's baseline.
 *         4. Leakage: the methodology's leakage percentage is deducted.
 *         5. Independent verification: a report must be approved by a SECOND, DIFFERENT verifier,
 *            and a farmer can never verify their own farm.
 *         6. Plausibility cap: gross removals cannot exceed a realistic kg CO2e per hectare per
 *            quarter, so an inflated number is rejected automatically.
 *         7. No double claiming: one registration per plot, one report per farm per quarter.
 *         8. Evidence: the SHA-256 of each MRV report (remote sensing + field plots + calculation)
 *            is stored, so anyone can later check the report was not altered.
 *         9. Permanence: a share of every issuance goes to a buffer pool held by this contract.
 *            If trees are later lost (a reversal), buffer credits are cancelled to cover them.
 *        10. Emergency pause, controlled by the admin.
 *
 * @dev    Periods are calendar quarters encoded as YYYYQ (20263 = 2026, quarter 3).
 *         Areas are hundredths of a hectare (250 = 2.50 ha). Percentages are basis points
 *         (1000 = 10%). Locations are stored as a hash of a coarse grid cell, never as GPS points.
 */
contract VerdanaRegistry is AccessControl, Pausable {
    // ---------------------------------------------------------------------
    // Roles and constants
    // ---------------------------------------------------------------------

    /// @notice Field agents who onboard farms.
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    /// @notice Approved MRV verifiers.
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    /// @notice 1 kg CO2e = 10^15 VCC base units (1 VCC = 1 tonne = 1,000 kg, 18 decimals).
    uint256 public constant KG_TO_CREDIT_UNITS = 1e15;
    uint16 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Leakage deductions above 50% are not accepted.
    uint16 public constant MAX_LEAKAGE_BPS = 5_000;
    /// @notice The permanence buffer must stay between 5% and 50% of each issuance.
    uint16 public constant MIN_BUFFER_BPS = 500;
    uint16 public constant MAX_BUFFER_BPS = 5_000;

    // ---------------------------------------------------------------------
    // Data structures
    // ---------------------------------------------------------------------

    enum ReadingStatus {
        None,
        Pending,
        Approved,
        Rejected
    }

    struct Methodology {
        string name;          // e.g. "VDN-AGF-01 Agroforestry biomass growth"
        uint16 leakageBps;    // deduction for emissions displaced elsewhere
        bool active;          // inactive methodologies cannot be used for new reports
    }

    struct Farm {
        address farmer;            // wallet that receives the farm's credits
        bytes32 locationHash;      // hash of the farm's grid cell (privacy-preserving)
        bytes32 landRecordHash;    // SHA-256 of the signed land-rights and consent record
        uint32 areaHectaresX100;   // area in hundredths of a hectare
        string region;             // human-readable region, e.g. "Musanze, Rwanda"
        bool active;               // inactive farms (e.g. after a reversal) earn no new credits
        uint64 registeredAt;       // Unix timestamp
        uint256 issuedKg;          // net verified kg CO2e ever approved for this farm
        uint256 reversedKg;        // kg CO2e reported lost (reversals)
    }

    struct Reading {
        uint256 farmId;
        uint32 period;             // quarter, YYYYQ
        bytes32 methodologyId;     // approved methodology used
        uint256 grossKg;           // measured removals in the period, in kg CO2e
        uint256 baselineKg;        // removals that would have happened anyway (no additionality)
        uint256 netKg;             // creditable: (gross - baseline) minus leakage
        bytes32 evidenceHash;      // SHA-256 of the MRV report
        address submittedBy;       // first verifier
        address reviewedBy;        // second verifier (approval) or reviewer (rejection)
        ReadingStatus status;
        uint64 submittedAt;
        uint64 reviewedAt;
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    /// @notice The carbon credit token this registry mints.
    VerdanaCarbonCredit public immutable creditToken;

    /// @notice Highest plausible gross removals, in kg CO2e per hectare per quarter.
    uint256 public maxKgPerHectarePerPeriod;
    /// @notice Share of every issuance placed in the permanence buffer pool, in basis points.
    uint16 public bufferBps;

    uint256 public farmCount;
    uint256 public readingCount;
    /// @notice Total net kg CO2e ever approved (farmer credits + buffer).
    uint256 public totalIssuedKg;
    /// @notice Total kg CO2e placed in the buffer pool.
    uint256 public totalBufferKg;
    /// @notice Total kg CO2e reported lost through reversals.
    uint256 public totalReversedKg;

    mapping(bytes32 => Methodology) private _methodologies;
    bytes32[] private _methodologyIds;
    mapping(uint256 => Farm) private _farms;
    mapping(uint256 => Reading) private _readings;
    mapping(address => uint256[]) private _farmsOf;
    mapping(uint256 => uint256[]) private _readingsOfFarm;

    /// @notice True once a plot (location hash) is registered, so it cannot be registered twice.
    mapping(bytes32 => bool) public locationRegistered;
    /// @notice farmId => period => the pending or approved report for that quarter (0 if none).
    mapping(uint256 => mapping(uint32 => uint256)) public activeReadingFor;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event MethodologyAdded(bytes32 indexed methodologyId, string name, uint16 leakageBps);
    event MethodologyStatusChanged(bytes32 indexed methodologyId, bool active);
    event FarmRegistered(
        uint256 indexed farmId,
        address indexed farmer,
        bytes32 locationHash,
        bytes32 landRecordHash,
        uint32 areaHectaresX100,
        string region
    );
    event FarmStatusChanged(uint256 indexed farmId, bool active);
    event ReadingSubmitted(
        uint256 indexed readingId,
        uint256 indexed farmId,
        uint32 period,
        bytes32 methodologyId,
        uint256 grossKg,
        uint256 baselineKg,
        uint256 netKg,
        bytes32 evidenceHash,
        address indexed submittedBy
    );
    event ReadingApproved(
        uint256 indexed readingId,
        uint256 indexed farmId,
        address indexed approvedBy,
        uint256 farmerCredits,
        uint256 bufferCredits
    );
    event ReadingRejected(uint256 indexed readingId, uint256 indexed farmId, address indexed rejectedBy, string reason);
    event ReversalRecorded(
        uint256 indexed farmId,
        uint256 lostKg,
        uint256 creditsCancelled,
        address indexed reportedBy,
        string reason
    );
    event MaxRateUpdated(uint256 previousMax, uint256 newMax);
    event BufferUpdated(uint16 previousBps, uint16 newBps);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /**
     * @param admin                     Verdana programme operator (roles, methodologies, limits, pause).
     * @param token                     The VerdanaCarbonCredit contract (must grant this
     *                                  registry MINTER_ROLE after deployment).
     * @param maxKgPerHectarePerQuarter Plausibility cap on gross removals, e.g. 5000 (= 20 t/ha/year).
     * @param bufferShareBps            Permanence buffer, e.g. 1000 (= 10% of each issuance).
     */
    constructor(address admin, VerdanaCarbonCredit token, uint256 maxKgPerHectarePerQuarter, uint16 bufferShareBps) {
        require(admin != address(0), "Verdana: admin is the zero address");
        require(address(token) != address(0), "Verdana: token is the zero address");
        require(maxKgPerHectarePerQuarter > 0, "Verdana: cap must be greater than zero");
        require(bufferShareBps >= MIN_BUFFER_BPS && bufferShareBps <= MAX_BUFFER_BPS, "Verdana: buffer must be between 5% and 50%");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        creditToken = token;
        maxKgPerHectarePerPeriod = maxKgPerHectarePerQuarter;
        bufferBps = bufferShareBps;
    }

    // ---------------------------------------------------------------------
    // Methodologies
    // ---------------------------------------------------------------------

    /**
     * @notice Approves a carbon-accounting methodology for use in MRV reports.
     * @param  methodologyId  Short ID, e.g. keccak256("VDN-AGF-01").
     * @param  name           Human-readable name and version.
     * @param  leakageBps     Leakage deduction in basis points (1000 = 10%), at most 50%.
     */
    function addMethodology(bytes32 methodologyId, string calldata name, uint16 leakageBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(methodologyId != bytes32(0), "Verdana: methodology ID is required");
        require(bytes(name).length > 0, "Verdana: methodology name is required");
        require(bytes(_methodologies[methodologyId].name).length == 0, "Verdana: methodology already exists");
        require(leakageBps <= MAX_LEAKAGE_BPS, "Verdana: leakage cannot exceed 50%");

        _methodologies[methodologyId] = Methodology({name: name, leakageBps: leakageBps, active: true});
        _methodologyIds.push(methodologyId);
        emit MethodologyAdded(methodologyId, name, leakageBps);
    }

    /// @notice Suspends or re-enables a methodology (e.g. if it is found to over-credit).
    function setMethodologyActive(bytes32 methodologyId, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bytes(_methodologies[methodologyId].name).length > 0, "Verdana: methodology does not exist");
        _methodologies[methodologyId].active = active;
        emit MethodologyStatusChanged(methodologyId, active);
    }

    // ---------------------------------------------------------------------
    // Farms
    // ---------------------------------------------------------------------

    /**
     * @notice Onboards a farm into the programme. Called by a field agent after visiting the
     *         farmer, documenting land rights and recording the farmer's consent.
     * @param  farmer           Farmer's wallet (receives credits). Farmers pay nothing to join.
     * @param  locationHash     keccak256 of the farm's grid cell, e.g. keccak256("geohash:kxt8f").
     * @param  landRecordHash   SHA-256 of the signed land-rights and consent record (kept off-chain).
     * @param  areaHectaresX100 Area in hundredths of a hectare (250 = 2.5 ha).
     * @param  region           Human-readable region.
     * @return farmId           The new farm's ID (starting at 1).
     */
    function registerFarm(
        address farmer,
        bytes32 locationHash,
        bytes32 landRecordHash,
        uint32 areaHectaresX100,
        string calldata region
    ) external onlyRole(REGISTRAR_ROLE) whenNotPaused returns (uint256 farmId) {
        require(farmer != address(0), "Verdana: farmer is the zero address");
        require(locationHash != bytes32(0), "Verdana: location hash is required");
        require(landRecordHash != bytes32(0), "Verdana: land-rights and consent record is required");
        require(areaHectaresX100 > 0, "Verdana: area must be greater than zero");
        require(!locationRegistered[locationHash], "Verdana: this plot is already registered");

        farmId = ++farmCount;
        Farm storage farm = _farms[farmId];
        farm.farmer = farmer;
        farm.locationHash = locationHash;
        farm.landRecordHash = landRecordHash;
        farm.areaHectaresX100 = areaHectaresX100;
        farm.region = region;
        farm.active = true;
        farm.registeredAt = uint64(block.timestamp);

        locationRegistered[locationHash] = true;
        _farmsOf[farmer].push(farmId);

        emit FarmRegistered(farmId, farmer, locationHash, landRecordHash, areaHectaresX100, region);
    }

    /// @notice Activates or deactivates a farm (e.g. the farmer leaves the programme).
    function setFarmActive(uint256 farmId, bool active) external onlyRole(REGISTRAR_ROLE) {
        _requireFarm(farmId).active = active;
        emit FarmStatusChanged(farmId, active);
    }

    // ---------------------------------------------------------------------
    // MRV reports: submit -> second verifier approves (credits issued) or rejects
    // ---------------------------------------------------------------------

    /**
     * @notice Step 1: a verifier submits an MRV report for one farm and one quarter.
     * @param  farmId        Farm being measured.
     * @param  period        Quarter as YYYYQ, e.g. 20263.
     * @param  methodologyId Approved methodology used for the calculation.
     * @param  grossKg       Measured removals in the quarter, in kg CO2e.
     * @param  baselineKg    Removals expected without the programme, in kg CO2e.
     * @param  evidenceHash  SHA-256 of the MRV report (remote sensing, field plots, calculation).
     * @return readingId     The new report's ID (starting at 1).
     */
    function submitReading(
        uint256 farmId,
        uint32 period,
        bytes32 methodologyId,
        uint256 grossKg,
        uint256 baselineKg,
        bytes32 evidenceHash
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused returns (uint256 readingId) {
        Farm storage farm = _requireFarm(farmId);
        require(farm.active, "Verdana: farm is not active");
        require(msg.sender != farm.farmer, "Verdana: farmers cannot verify their own farm");
        _requireValidPeriod(period);

        Methodology storage method = _methodologies[methodologyId];
        require(method.active, "Verdana: methodology is not approved");
        require(grossKg > 0, "Verdana: reading must be greater than zero");
        require(grossKg <= maxReadingFor(farmId), "Verdana: reading exceeds the plausible maximum for this farm");
        require(grossKg > baselineKg, "Verdana: no additional removals above the baseline");
        require(evidenceHash != bytes32(0), "Verdana: evidence hash is required");
        require(activeReadingFor[farmId][period] == 0, "Verdana: this farm already has a reading for this period");

        uint256 additional = grossKg - baselineKg;
        uint256 netKg = additional - (additional * method.leakageBps) / BPS_DENOMINATOR;

        readingId = ++readingCount;
        _readings[readingId] = Reading({
            farmId: farmId,
            period: period,
            methodologyId: methodologyId,
            grossKg: grossKg,
            baselineKg: baselineKg,
            netKg: netKg,
            evidenceHash: evidenceHash,
            submittedBy: msg.sender,
            reviewedBy: address(0),
            status: ReadingStatus.Pending,
            submittedAt: uint64(block.timestamp),
            reviewedAt: 0
        });
        activeReadingFor[farmId][period] = readingId;
        _readingsOfFarm[farmId].push(readingId);

        emit ReadingSubmitted(readingId, farmId, period, methodologyId, grossKg, baselineKg, netKg, evidenceHash, msg.sender);
    }

    /**
     * @notice Step 2a: a SECOND verifier approves a pending report. The net verified tonnes are
     *         issued as VCC: the buffer share goes to the permanence pool (held by this contract)
     *         and the rest goes to the farmer.
     */
    function approveReading(uint256 readingId) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        Reading storage reading = _requireReading(readingId);
        require(reading.status == ReadingStatus.Pending, "Verdana: reading is not pending");
        require(msg.sender != reading.submittedBy, "Verdana: a second, different verifier must approve");

        Farm storage farm = _farms[reading.farmId];
        require(msg.sender != farm.farmer, "Verdana: farmers cannot verify their own farm");
        require(farm.active, "Verdana: farm is not active");

        // Effects first (checks-effects-interactions)...
        uint256 bufferKg = (reading.netKg * bufferBps) / BPS_DENOMINATOR;
        uint256 farmerKg = reading.netKg - bufferKg;
        reading.status = ReadingStatus.Approved;
        reading.reviewedBy = msg.sender;
        reading.reviewedAt = uint64(block.timestamp);
        farm.issuedKg += reading.netKg;
        totalIssuedKg += reading.netKg;
        totalBufferKg += bufferKg;

        uint256 farmerCredits = farmerKg * KG_TO_CREDIT_UNITS;
        uint256 bufferCredits = bufferKg * KG_TO_CREDIT_UNITS;
        emit ReadingApproved(readingId, reading.farmId, msg.sender, farmerCredits, bufferCredits);

        // ...then the external calls to the token contract.
        creditToken.mint(farm.farmer, farmerCredits);
        if (bufferCredits > 0) creditToken.mint(address(this), bufferCredits);
    }

    /**
     * @notice Step 2b: a verifier rejects a pending report (e.g. cloud cover, mismatched field
     *         data). No credits are issued, and the quarter is freed for a corrected report.
     */
    function rejectReading(uint256 readingId, string calldata reason) external onlyRole(VERIFIER_ROLE) {
        Reading storage reading = _requireReading(readingId);
        require(reading.status == ReadingStatus.Pending, "Verdana: reading is not pending");
        require(bytes(reason).length > 0, "Verdana: a reason is required");

        reading.status = ReadingStatus.Rejected;
        reading.reviewedBy = msg.sender;
        reading.reviewedAt = uint64(block.timestamp);
        activeReadingFor[reading.farmId][reading.period] = 0;

        emit ReadingRejected(readingId, reading.farmId, msg.sender, reason);
    }

    // ---------------------------------------------------------------------
    // Permanence: reversals
    // ---------------------------------------------------------------------

    /**
     * @notice Records that credited trees on a farm were lost (fire, felling...). The farm is
     *         deactivated and the same tonnage is cancelled from the buffer pool, so credits that
     *         buyers already hold remain backed by standing trees elsewhere in the programme.
     * @param  farmId  Farm where the loss happened.
     * @param  lostKg  kg CO2e lost; cannot exceed what the farm was credited for.
     * @param  reason  Description, e.g. "2.0 ha cleared, confirmed by field visit".
     */
    function recordReversal(uint256 farmId, uint256 lostKg, string calldata reason) external onlyRole(VERIFIER_ROLE) {
        Farm storage farm = _requireFarm(farmId);
        require(lostKg > 0, "Verdana: lost amount must be greater than zero");
        require(farm.reversedKg + lostKg <= farm.issuedKg, "Verdana: loss exceeds what this farm was credited");
        require(bytes(reason).length > 0, "Verdana: a reason is required");

        uint256 lostCredits = lostKg * KG_TO_CREDIT_UNITS;
        uint256 pool = creditToken.balanceOf(address(this));
        uint256 toCancel = lostCredits < pool ? lostCredits : pool;

        farm.reversedKg += lostKg;
        totalReversedKg += lostKg;
        if (farm.active) {
            farm.active = false;
            emit FarmStatusChanged(farmId, false);
        }
        emit ReversalRecorded(farmId, lostKg, toCancel, msg.sender, reason);

        if (toCancel > 0) creditToken.cancel(toCancel);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Updates the plausibility cap (kg CO2e per hectare per quarter).
    function setMaxKgPerHectarePerPeriod(uint256 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newMax > 0, "Verdana: cap must be greater than zero");
        emit MaxRateUpdated(maxKgPerHectarePerPeriod, newMax);
        maxKgPerHectarePerPeriod = newMax;
    }

    /// @notice Updates the permanence buffer share for future approvals (5% to 50%).
    function setBufferBps(uint16 newBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newBps >= MIN_BUFFER_BPS && newBps <= MAX_BUFFER_BPS, "Verdana: buffer must be between 5% and 50%");
        emit BufferUpdated(bufferBps, newBps);
        bufferBps = newBps;
    }

    /// @notice Emergency stop for registrations, submissions and approvals.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getMethodology(bytes32 methodologyId) external view returns (Methodology memory) {
        require(bytes(_methodologies[methodologyId].name).length > 0, "Verdana: methodology does not exist");
        return _methodologies[methodologyId];
    }

    /// @notice IDs of every methodology ever added.
    function methodologyIds() external view returns (bytes32[] memory) {
        return _methodologyIds;
    }

    function getFarm(uint256 farmId) external view returns (Farm memory) {
        require(farmId > 0 && farmId <= farmCount, "Verdana: farm does not exist");
        return _farms[farmId];
    }

    function getReading(uint256 readingId) external view returns (Reading memory) {
        require(readingId > 0 && readingId <= readingCount, "Verdana: reading does not exist");
        return _readings[readingId];
    }

    /// @notice IDs of all farms registered to a farmer.
    function farmsOf(address farmer) external view returns (uint256[] memory) {
        return _farmsOf[farmer];
    }

    /// @notice IDs of all reports ever submitted for a farm.
    function readingsOfFarm(uint256 farmId) external view returns (uint256[] memory) {
        return _readingsOfFarm[farmId];
    }

    /// @notice The largest gross removals (kg CO2e) a farm can report in one quarter.
    function maxReadingFor(uint256 farmId) public view returns (uint256) {
        return (maxKgPerHectarePerPeriod * _farms[farmId].areaHectaresX100) / 100;
    }

    /// @notice Credits currently held in the permanence buffer pool.
    function bufferPoolBalance() external view returns (uint256) {
        return creditToken.balanceOf(address(this));
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _requireFarm(uint256 farmId) internal view returns (Farm storage farm) {
        require(farmId > 0 && farmId <= farmCount, "Verdana: farm does not exist");
        farm = _farms[farmId];
    }

    function _requireReading(uint256 readingId) internal view returns (Reading storage reading) {
        require(readingId > 0 && readingId <= readingCount, "Verdana: reading does not exist");
        reading = _readings[readingId];
    }

    /// @dev Accepts YYYYQ with a year from 2024 to 2100 and a quarter from 1 to 4.
    function _requireValidPeriod(uint32 period) internal pure {
        uint32 year = period / 10;
        uint32 quarter = period % 10;
        require(year >= 2024 && year <= 2100 && quarter >= 1 && quarter <= 4, "Verdana: period must be YYYYQ, e.g. 20263");
    }
}
