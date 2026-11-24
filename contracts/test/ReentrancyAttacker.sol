// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IVerdanaMarketplace {
    function createListing(uint256 amount, uint256 pricePerTonneWei) external returns (uint256);
    function withdraw() external;
}

/**
 * @dev TEST ONLY. A malicious "farmer" contract that tries to drain the marketplace by calling
 *      withdraw() again from inside its receive() function (a re-entrancy attack).
 *      Used by the test suite to prove the marketplace pays out exactly once.
 */
contract ReentrancyAttacker {
    IVerdanaMarketplace public immutable market;
    IERC20 public immutable token;
    uint256 public reentryAttempts;
    bool public reentrySucceeded;

    constructor(IVerdanaMarketplace market_, IERC20 token_) {
        market = market_;
        token = token_;
    }

    function list(uint256 amount, uint256 price) external {
        token.approve(address(market), amount);
        market.createListing(amount, price);
    }

    function attack() external {
        market.withdraw();
    }

    receive() external payable {
        if (reentryAttempts == 0) {
            reentryAttempts++;
            try market.withdraw() {
                reentrySucceeded = true;
            } catch {
                // Blocked by ReentrancyGuard, as expected.
            }
        }
    }
}
