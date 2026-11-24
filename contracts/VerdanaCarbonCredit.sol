// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  VerdanaCarbonCredit (VCC)
 * @notice ERC-20 carbon credit token for Verdana Protocol.
 *
 *         1 VCC = 1 tonne of CO2 equivalent (CO2e) of verified, additional removals by a
 *         smallholder farm, issued only after an MRV report has been approved by two independent
 *         verifiers in VerdanaRegistry. Only the registry can create (mint) credits, so every VCC
 *         in existence traces back to an approved, evidence-backed report.
 *
 *         Credits leave circulation in two ways, both recorded publicly:
 *         - RETIRED: a company burns credits to claim an offset and gets a retirement
 *           certificate. A retired tonne can never be sold or claimed again (no double counting).
 *         - CANCELLED: the registry burns credits from its permanence buffer pool when trees that
 *           earned credits are later lost (fire, felling), so the tonnes buyers hold stay backed.
 *
 * @dev    18 decimals, so 1 VCC = 10^18 base units and 1 kg CO2e = 10^15 base units.
 */
contract VerdanaCarbonCredit is ERC20, AccessControl {
    /// @notice Role allowed to mint and cancel credits. Granted only to the VerdanaRegistry contract.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice A public record of credits taken out of circulation to offset emissions.
    struct Retirement {
        address retiredBy;   // wallet that burned the credits
        uint256 amount;      // credits retired (18 decimals)
        string beneficiary;  // who the offset is claimed for, e.g. "Kigali Green Coffee Co."
        string reason;       // e.g. "2026 roasting emissions"
        uint64 retiredAt;    // Unix timestamp
    }

    /// @notice Total credits ever retired (burned for offsets).
    uint256 public totalRetired;
    /// @notice Total credits ever cancelled from the buffer pool to cover lost trees.
    uint256 public totalCancelled;
    /// @notice Number of retirement certificates issued. Certificate IDs start at 1.
    uint256 public retirementCount;

    mapping(uint256 => Retirement) private _retirements;

    event CreditsMinted(address indexed to, uint256 amount);
    event CreditsCancelled(address indexed by, uint256 amount);
    event CreditsRetired(
        uint256 indexed certificateId,
        address indexed retiredBy,
        uint256 amount,
        string beneficiary,
        string reason
    );

    /// @param admin Account that can grant MINTER_ROLE (the Verdana operator).
    constructor(address admin) ERC20("Verdana Carbon Credit", "VCC") {
        require(admin != address(0), "VCC: admin is the zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Creates new credits. Only the registry can call this, after a second verifier approves.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
        emit CreditsMinted(to, amount);
    }

    /**
     * @notice Cancels (burns) credits held by the caller. Used by the registry to cancel credits
     *         from its permanence buffer pool after a reversal. Only the registry can call this,
     *         and it can only burn its own balance, never anyone else's.
     */
    function cancel(uint256 amount) external onlyRole(MINTER_ROLE) {
        require(amount > 0, "VCC: amount must be greater than zero");
        _burn(msg.sender, amount);
        totalCancelled += amount;
        emit CreditsCancelled(msg.sender, amount);
    }

    /**
     * @notice Retires (burns) the caller's credits to claim an offset, and records a certificate.
     * @param  amount       Credits to retire, in base units (1 VCC = 10^18).
     * @param  beneficiary  Who the offset is for. Required.
     * @param  reason       What the offset covers. Optional.
     * @return certificateId The ID of the new retirement certificate.
     */
    function retire(uint256 amount, string calldata beneficiary, string calldata reason)
        external
        returns (uint256 certificateId)
    {
        require(amount > 0, "VCC: amount must be greater than zero");
        require(bytes(beneficiary).length > 0, "VCC: beneficiary is required");

        _burn(msg.sender, amount); // reverts with ERC20InsufficientBalance if the caller lacks credits

        certificateId = ++retirementCount;
        _retirements[certificateId] = Retirement({
            retiredBy: msg.sender,
            amount: amount,
            beneficiary: beneficiary,
            reason: reason,
            retiredAt: uint64(block.timestamp)
        });
        totalRetired += amount;

        emit CreditsRetired(certificateId, msg.sender, amount, beneficiary, reason);
    }

    /// @notice Returns a retirement certificate. Reverts for unknown IDs.
    function getRetirement(uint256 certificateId) external view returns (Retirement memory) {
        require(certificateId > 0 && certificateId <= retirementCount, "VCC: certificate does not exist");
        return _retirements[certificateId];
    }
}
