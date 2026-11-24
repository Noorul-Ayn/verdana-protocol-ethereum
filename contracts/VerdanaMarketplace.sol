// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  VerdanaMarketplace
 * @notice Connects farmers' verified carbon credits (VCC) to buyers, and shares the proceeds
 *         transparently. Farmers are only ever paid from real money already held by this
 *         contract, never from a promise.
 *
 *         Two ways to sell:
 *
 *         1. COMMITTED FUNDING (offtake): a buyer or programme sponsor locks ETH in advance for a
 *            number of future verified tonnes at a fixed price, until a fixed date. The money
 *            cannot be taken back before that date. When a farmer's credits are issued, the
 *            farmer sells into the offtake and is paid immediately at the agreed price. This
 *            gives farmers a known price and a reliable, fast payment, a credible alternative to
 *            the immediate income from cutting trees.
 *
 *         2. OPEN MARKET (listing): a farmer lists credits at a price per tonne. The credits are
 *            held by this contract (escrow) until sold or cancelled. A buyer pays the exact price
 *            in ETH and receives the credits immediately.
 *
 *         Every sale is split by a public benefit-sharing rule fixed at deployment, for example
 *         80% to the farmer and 20% to the programme fund that pays for monitoring, verification
 *         and aggregation (Verdana's revenue model; farmers pay nothing up front). The contract
 *         guarantees the farmer's share can never be set below 70%. Each party collects their
 *         share with withdraw().
 *
 *         The marketplace has no owner or admin: nobody, including the Verdana team, can change
 *         the split or move escrowed credits or anyone's earnings.
 *
 * @dev    Security: ReentrancyGuard on every state-changing function, checks-effects-interactions
 *         ordering, SafeERC20 transfers, and the pull-payment pattern for ETH. The withdrawal
 *         step is where an off-chain service would convert ETH to local currency and pay the
 *         farmer's mobile money account.
 */
contract VerdanaMarketplace is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice 100% expressed in basis points.
    uint16 public constant BPS_DENOMINATOR = 10_000;
    /// @notice The farmer's share can never be lower than 70%.
    uint16 public constant MIN_FARMER_SHARE_BPS = 7_000;

    struct Listing {
        address seller;            // farmer selling the credits
        uint256 remaining;         // credits still for sale (18 decimals)
        uint256 pricePerTonneWei;  // price of 1 VCC (1 tonne CO2e) in wei
        bool active;
        uint64 createdAt;
    }

    struct Offtake {
        address buyer;             // company or sponsor that committed the funds
        uint256 remaining;         // credits still wanted (18 decimals)
        uint256 pricePerTonneWei;  // fixed price per tonne
        uint256 depositWei;        // ETH still locked for future purchases
        uint64 expiresAt;          // funds are locked until this time
        bool active;
    }

    /// @notice Shortest and longest lock-up period for committed funding.
    uint64 public constant MIN_OFFTAKE_DURATION = 1 days;
    uint64 public constant MAX_OFFTAKE_DURATION = 5 * 365 days;

    /// @notice The carbon credit token traded here.
    IERC20 public immutable creditToken;
    /// @notice Wallet of the programme fund (monitoring, verification, aggregation costs).
    address public immutable programmeFund;
    /// @notice The farmer's share of every sale, in basis points (8000 = 80%). Fixed forever.
    uint16 public immutable farmerShareBps;

    uint256 public listingCount;
    uint256 public offtakeCount;
    /// @notice ETH currently locked in active offtake commitments.
    uint256 public totalCommittedWei;
    /// @notice ETH owed to each account (farmers and the programme fund), waiting to be withdrawn.
    mapping(address => uint256) public pendingWithdrawals;
    /// @notice Total ETH paid by buyers through the marketplace.
    uint256 public totalVolumeWei;
    /// @notice Total ETH allocated to farmers.
    uint256 public totalToFarmersWei;
    /// @notice Total ETH allocated to the programme fund.
    uint256 public totalToProgrammeWei;
    /// @notice Total credits sold through the marketplace.
    uint256 public totalCreditsSold;

    mapping(uint256 => Listing) private _listings;
    mapping(uint256 => Offtake) private _offtakes;

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 amount, uint256 pricePerTonneWei);
    event ListingCancelled(uint256 indexed listingId, address indexed seller, uint256 returnedAmount);
    event CreditsPurchased(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint256 costWei,
        uint256 farmerShareWei,
        uint256 programmeShareWei
    );
    event OfftakeCreated(
        uint256 indexed offtakeId,
        address indexed buyer,
        uint256 amount,
        uint256 pricePerTonneWei,
        uint256 depositWei,
        uint64 expiresAt
    );
    event SoldToOfftake(
        uint256 indexed offtakeId,
        address indexed seller,
        address indexed buyer,
        uint256 amount,
        uint256 costWei,
        uint256 farmerShareWei,
        uint256 programmeShareWei
    );
    event OfftakeClosed(uint256 indexed offtakeId, address indexed buyer, uint256 refundWei);
    event Withdrawn(address indexed account, uint256 amountWei);

    /**
     * @param token          The VerdanaCarbonCredit contract.
     * @param fund           Programme fund wallet (receives the non-farmer share).
     * @param farmerShare    Farmer's share in basis points, from 7000 (70%) to 10000 (100%).
     */
    constructor(IERC20 token, address fund, uint16 farmerShare) {
        require(address(token) != address(0), "Marketplace: token is the zero address");
        require(fund != address(0), "Marketplace: programme fund is the zero address");
        require(
            farmerShare >= MIN_FARMER_SHARE_BPS && farmerShare <= BPS_DENOMINATOR,
            "Marketplace: farmer share must be between 70% and 100%"
        );
        creditToken = token;
        programmeFund = fund;
        farmerShareBps = farmerShare;
    }

    // ---------------------------------------------------------------------
    // Open market (listings)
    // ---------------------------------------------------------------------

    /**
     * @notice Lists credits for sale. The seller must first approve() this contract to move
     *         `amount` VCC; the credits are then held in escrow.
     */
    function createListing(uint256 amount, uint256 pricePerTonneWei) external nonReentrant returns (uint256 listingId) {
        require(amount > 0, "Marketplace: amount must be greater than zero");
        require(pricePerTonneWei > 0, "Marketplace: price must be greater than zero");

        listingId = ++listingCount;
        _listings[listingId] = Listing({
            seller: msg.sender,
            remaining: amount,
            pricePerTonneWei: pricePerTonneWei,
            active: true,
            createdAt: uint64(block.timestamp)
        });
        emit ListingCreated(listingId, msg.sender, amount, pricePerTonneWei);

        creditToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Cancels a listing and returns the unsold credits to the seller.
    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = _requireListing(listingId);
        require(msg.sender == listing.seller, "Marketplace: only the seller can cancel");
        require(listing.active, "Marketplace: listing is not active");

        uint256 returned = listing.remaining;
        listing.remaining = 0;
        listing.active = false;
        emit ListingCancelled(listingId, msg.sender, returned);

        creditToken.safeTransfer(msg.sender, returned);
    }

    /// @notice Price in wei for `amount` credits from a listing.
    function quote(uint256 listingId, uint256 amount) public view returns (uint256) {
        return (amount * _requireListing(listingId).pricePerTonneWei) / 1e18;
    }

    /// @notice How a payment would be split: (farmer's share, programme fund's share).
    function splitPayment(uint256 costWei) public view returns (uint256 farmerShareWei, uint256 programmeShareWei) {
        farmerShareWei = (costWei * farmerShareBps) / BPS_DENOMINATOR;
        programmeShareWei = costWei - farmerShareWei; // rounding dust goes to the programme, never lost
    }

    /**
     * @notice Buys `amount` credits from a listing, paying the exact price in ETH.
     *         The credits go to the buyer; the ETH is split between the farmer and the programme fund.
     */
    function buy(uint256 listingId, uint256 amount) external payable nonReentrant {
        Listing storage listing = _requireListing(listingId);
        require(listing.active, "Marketplace: listing is not active");
        require(msg.sender != listing.seller, "Marketplace: you cannot buy your own listing");
        require(amount > 0, "Marketplace: amount must be greater than zero");
        require(amount <= listing.remaining, "Marketplace: not enough credits in this listing");

        uint256 cost = (amount * listing.pricePerTonneWei) / 1e18;
        require(cost > 0, "Marketplace: amount too small");
        require(msg.value == cost, "Marketplace: send the exact price");
        (uint256 toFarmer, uint256 toProgramme) = splitPayment(cost);

        // Effects
        listing.remaining -= amount;
        if (listing.remaining == 0) listing.active = false;
        pendingWithdrawals[listing.seller] += toFarmer;
        pendingWithdrawals[programmeFund] += toProgramme;
        totalVolumeWei += cost;
        totalToFarmersWei += toFarmer;
        totalToProgrammeWei += toProgramme;
        totalCreditsSold += amount;
        emit CreditsPurchased(listingId, msg.sender, listing.seller, amount, cost, toFarmer, toProgramme);

        // Interaction
        creditToken.safeTransfer(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Committed funding (offtake agreements)
    // ---------------------------------------------------------------------

    /**
     * @notice A buyer or sponsor locks ETH now to buy `amount` future verified credits at a fixed
     *         price. Send exactly amount x price. The funds stay locked until `duration` has passed.
     * @param  amount            Credits wanted, in base units (1 VCC = 10^18).
     * @param  pricePerTonneWei  Fixed price per tonne, in wei.
     * @param  duration          Lock-up period in seconds (1 day to 5 years).
     */
    function createOfftake(uint256 amount, uint256 pricePerTonneWei, uint64 duration)
        external
        payable
        nonReentrant
        returns (uint256 offtakeId)
    {
        require(amount > 0, "Marketplace: amount must be greater than zero");
        require(pricePerTonneWei > 0, "Marketplace: price must be greater than zero");
        require(
            duration >= MIN_OFFTAKE_DURATION && duration <= MAX_OFFTAKE_DURATION,
            "Marketplace: duration must be between 1 day and 5 years"
        );
        uint256 deposit = (amount * pricePerTonneWei) / 1e18;
        require(deposit > 0, "Marketplace: amount too small");
        require(msg.value == deposit, "Marketplace: deposit must equal amount x price");

        offtakeId = ++offtakeCount;
        uint64 expiresAt = uint64(block.timestamp) + duration;
        _offtakes[offtakeId] = Offtake({
            buyer: msg.sender,
            remaining: amount,
            pricePerTonneWei: pricePerTonneWei,
            depositWei: deposit,
            expiresAt: expiresAt,
            active: true
        });
        totalCommittedWei += deposit;
        emit OfftakeCreated(offtakeId, msg.sender, amount, pricePerTonneWei, deposit, expiresAt);
    }

    /**
     * @notice A farmer sells credits into a committed offtake and is paid at once from the locked
     *         funds. The farmer must first approve() this contract to move `amount` VCC.
     */
    function sellToOfftake(uint256 offtakeId, uint256 amount) external nonReentrant {
        Offtake storage offtake = _requireOfftake(offtakeId);
        require(offtake.active, "Marketplace: offtake is not active");
        require(block.timestamp < offtake.expiresAt, "Marketplace: offtake has expired");
        require(msg.sender != offtake.buyer, "Marketplace: you cannot sell to your own offtake");
        require(amount > 0, "Marketplace: amount must be greater than zero");
        require(amount <= offtake.remaining, "Marketplace: offtake does not need that many credits");

        uint256 cost = (amount * offtake.pricePerTonneWei) / 1e18;
        require(cost > 0, "Marketplace: amount too small");
        (uint256 toFarmer, uint256 toProgramme) = splitPayment(cost);

        // Effects
        offtake.remaining -= amount;
        offtake.depositWei -= cost;
        totalCommittedWei -= cost;
        if (offtake.remaining == 0) {
            // Fully delivered: any rounding dust left in the deposit goes back to the buyer.
            offtake.active = false;
            if (offtake.depositWei > 0) {
                pendingWithdrawals[offtake.buyer] += offtake.depositWei;
                totalCommittedWei -= offtake.depositWei;
                offtake.depositWei = 0;
            }
        }
        pendingWithdrawals[msg.sender] += toFarmer;
        pendingWithdrawals[programmeFund] += toProgramme;
        totalVolumeWei += cost;
        totalToFarmersWei += toFarmer;
        totalToProgrammeWei += toProgramme;
        totalCreditsSold += amount;
        emit SoldToOfftake(offtakeId, msg.sender, offtake.buyer, amount, cost, toFarmer, toProgramme);

        // Interaction: credits go straight from the farmer to the buyer.
        creditToken.safeTransferFrom(msg.sender, offtake.buyer, amount);
    }

    /**
     * @notice After the lock-up period, the buyer closes the offtake and the unused deposit is
     *         made available to withdraw. Cannot be done early, so farmers can rely on the funds.
     */
    function closeOfftake(uint256 offtakeId) external nonReentrant {
        Offtake storage offtake = _requireOfftake(offtakeId);
        require(msg.sender == offtake.buyer, "Marketplace: only the buyer can close");
        require(offtake.active, "Marketplace: offtake is not active");
        require(block.timestamp >= offtake.expiresAt, "Marketplace: funds are locked until the offtake expires");

        uint256 refund = offtake.depositWei;
        offtake.active = false;
        offtake.depositWei = 0;
        totalCommittedWei -= refund;
        pendingWithdrawals[msg.sender] += refund;
        emit OfftakeClosed(offtakeId, msg.sender, refund);
    }

    function getOfftake(uint256 offtakeId) external view returns (Offtake memory) {
        return _requireOfftake(offtakeId);
    }

    // ---------------------------------------------------------------------
    // Payouts
    // ---------------------------------------------------------------------

    /**
     * @notice Sends the caller all the ETH they are owed (pull payment).
     *         An off-chain payout service can convert this to local currency for mobile money.
     */
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Marketplace: nothing to withdraw");

        pendingWithdrawals[msg.sender] = 0; // effect before the external call
        emit Withdrawn(msg.sender, amount);

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Marketplace: ETH transfer failed");
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return _requireListing(listingId);
    }

    function _requireListing(uint256 listingId) internal view returns (Listing storage) {
        require(listingId > 0 && listingId <= listingCount, "Marketplace: listing does not exist");
        return _listings[listingId];
    }

    function _requireOfftake(uint256 offtakeId) internal view returns (Offtake storage) {
        require(offtakeId > 0 && offtakeId <= offtakeCount, "Marketplace: offtake does not exist");
        return _offtakes[offtakeId];
    }
}
