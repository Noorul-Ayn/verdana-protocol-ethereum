# Verdana Protocol: Test Cases

All automated tests run with one command:

```bash
npx hardhat test
```

Result: **45 passing** (40 smart-contract tests in `test/Verdana.test.js`, 5 dApp integration tests in `test/VerdanaDapp.test.js`).

Each test ID below matches the name of the test in the code, so every row can be traced to the exact test that produced the result.

## 1. Test-case table (expected vs actual)

| ID | Area | Scenario | Input / action | Expected result | Actual result |
|---|---|---|---|---|---|
| TC-01 | Deployment | Contracts deploy and are wired together | Deploy token, registry (cap 5,000 kg/ha/quarter, buffer 10%), marketplace (80% farmer share) | Token name/symbol VCC; registry holds MINTER_ROLE; admin role set; cap, buffer, programme fund and 80% share stored | ✅ As expected |
| TC-02 | Farm registration | Field agent registers a farm | registerFarm(Amina, hash of grid cell, hash of consent record, 2.5 ha, Musanze) | FarmRegistered event; farm stored as active with consent hash; plot marked as registered | ✅ As expected |
| TC-03 | Access control | Non-registrar tries to register a farm | Outsider calls registerFarm | Reverts AccessControlUnauthorizedAccount(outsider, REGISTRAR_ROLE) | ✅ As expected |
| TC-04 | Double claiming | Same plot registered twice | registerFarm with an already-used location hash | Reverts "this plot is already registered" | ✅ As expected |
| TC-05 | Input validation | Incomplete farm details | Zero farmer address / zero location / missing consent record / zero area | Each reverts with its own message, incl. "land-rights and consent record is required" | ✅ As expected |
| TC-06 | Methodology | Only admin approves methodologies; leakage <= 50% | Outsider adds; admin adds duplicate; admin adds 50.01% leakage; admin adds valid one | Outsider refused; duplicate refused; leakage refused; valid one emits MethodologyAdded | ✅ As expected |
| TC-07 | MRV reports | Verifier submits a report; additionality and leakage applied | Gross 11,250 kg, baseline 1,250 kg, methodology with 10% leakage | Status Pending; net = (11,250 - 1,250) x 90% = 9,000 kg; evidence hash stored | ✅ As expected |
| TC-08 | Oracle fix | Any other wallet submits a reading | Outsider calls submitReading | Reverts AccessControlUnauthorizedAccount(outsider, VERIFIER_ROLE) | ✅ As expected |
| TC-09 | Conflict of interest | Farmer verifies own farm (even with verifier role) | Farmer granted VERIFIER_ROLE submits / approves for own farm | Both revert "farmers cannot verify their own farm" | ✅ As expected |
| TC-10 | Plausibility cap | Inflated reading | Gross 12,501 kg on a 2.5 ha farm (cap 12,500) | Reverts "reading exceeds the plausible maximum"; exactly 12,500 accepted | ✅ As expected |
| TC-11 | Additionality | No removals above the baseline | Gross = baseline (5,000/5,000) and gross < baseline (5,000/6,000) | Both revert "no additional removals above the baseline" | ✅ As expected |
| TC-12 | Methodology | Unapproved or suspended methodology | Unknown methodology ID; then admin suspends the approved one | Both revert "methodology is not approved"; MethodologyStatusChanged emitted | ✅ As expected |
| TC-13 | Double claiming | Same farm, same quarter twice | Second report for farm 1, 2026 Q3 | Reverts "already has a reading for this period"; next quarter accepted | ✅ As expected |
| TC-14 | Input validation | Invalid reports | Period 20265 and 2026; zero gross; zero evidence hash; farm 99 | Each reverts with a clear message | ✅ As expected |
| TC-15 | Two-verifier rule | Submitter approves own report | Verifier A submits, then approves | Reverts "a second, different verifier must approve" | ✅ As expected |
| TC-16 | Credit issuance | Second verifier approves | Verifier B approves the 9,000 kg report | Farmer gets 8.1 VCC, buffer pool 0.9 VCC, total supply 9 VCC, status Approved | ✅ As expected |
| TC-17 | State machine | Report decided twice | Approve or reject an already approved report | Both revert "reading is not pending" | ✅ As expected |
| TC-18 | Rejection | Verifier rejects a report | rejectReading(1, "Field plots do not match satellite estimate"), then corrected report | Nothing minted; quarter freed; corrected report approved -> 8.1 VCC | ✅ As expected |
| TC-19 | Farm status | Inactive farm | Registrar deactivates farm with a pending report | Approval and new reports revert "farm is not active" | ✅ As expected |
| TC-20 | Access control | Revoked verifier | Admin revokes verifier A, who then submits | Reverts AccessControlUnauthorizedAccount | ✅ As expected |
| TC-21 | Permanence | Reversal of 600 kg | Verifier records reversal on a credited farm | Farm inactive; 0.6 VCC cancelled from buffer (0.9 -> 0.3); farmer's 8.1 VCC untouched | ✅ As expected |
| TC-22 | Permanence | Reversal limits | Outsider; empty reason; zero; 9,001 kg (> credited); then full 9,000 kg loss | Refused, refused, refused, refused; full loss cancels exactly the 0.9 VCC pool | ✅ As expected |
| TC-23 | Emergency stop | Pause and unpause | Admin pauses; registration and report attempted; admin unpauses | Both revert EnforcedPause; work again after unpause | ✅ As expected |
| TC-24 | Admin limits | Only admin changes limits, within bounds | Outsider pauses / sets cap; admin sets cap 4,000, cap 0, buffer 15%, buffer 4%, deploy with 1% | Outsider refused; valid changes emit events; out-of-bounds values revert | ✅ As expected |
| TC-25 | Token security | Mint or cancel outside the registry | Admin and outsider call mint(); admin calls cancel() | All revert AccessControlUnauthorizedAccount(MINTER_ROLE) | ✅ As expected |
| TC-26 | Retirement | Retire credits for an offset | Farmer retires 2 VCC for Kigali Green Coffee Co. | CreditsRetired; balance 6.1; supply 7; certificate #1 stored | ✅ As expected |
| TC-27 | Retirement | Invalid retirements | Retire 9 (holds 8.1); no beneficiary; zero; retire all then again; certificate #2 | Insufficient balance, missing beneficiary, zero all refused; unknown certificate reverts | ✅ As expected |
| TC-28 | Benefit sharing | Farmer share below 70% | Deploy marketplace with 69.99%, 100.01%, zero programme fund | All three deployments revert | ✅ As expected |
| TC-29 | Open market | Farmer lists credits | Approve + createListing(5 VCC, 0.001 ETH/t) | ListingCreated; 5 VCC held in escrow; farmer keeps 3.1 | ✅ As expected |
| TC-30 | Benefit sharing | Buyer purchase split 80/20 | Buy 2 t at 0.001 ETH | Buyer pays 0.002 ETH; farmer owed 0.0016, programme 0.0004; 3 t remain listed | ✅ As expected |
| TC-31 | Input validation | Wrong payments | Underpay by 1 wei; buy 6 of 5; seller buys own; listing 99 | All four revert with clear messages | ✅ As expected |
| TC-32 | Pull payments | Withdraw exactly once | Buy all 5 t; farmer withdraws twice; fund withdraws | Farmer gets 80%, second withdraw refused; fund gets 20%; marketplace balance 0 | ✅ As expected |
| TC-33 | Listings | Cancel listing | Buyer cancels (refused); seller cancels; buyer buys | Unsold 5 VCC returned; later purchase reverts "listing is not active" | ✅ As expected |
| TC-34 | Re-entrancy | Malicious farmer contract re-enters withdraw() | Attacker earns, sells, then calls withdraw from receive() | Re-entry blocked; attacker paid once; honest farmer's and fund's ETH still held | ✅ As expected |
| TC-35 | Committed funding | Buyer locks funds; farmer sells into it | Offtake 10 t at 0.001 ETH for 90 days; farmer sells 5 t | Buyer receives 5 VCC; farmer owed 0.004 ETH (80%), fund 0.001; 0.005 ETH still locked | ✅ As expected |
| TC-36 | Committed funding | Locked funds can't be gamed | Wrong deposit; 60-second lock; buyer closes early; farmer closes; sell 11 of 10; buyer sells to self | All refused; "funds are locked until the offtake expires" | ✅ As expected |
| TC-37 | Committed funding | Expiry and refund | Sell 4 t; advance 90 days; sell again; buyer closes and withdraws | Sale after expiry refused; buyer refunded 0.006 ETH; second close refused | ✅ As expected |
| TC-38 | Committed funding | Full delivery and rounding dust | Deliver all 3 t; then 1 t at 3 wei delivered as 2 x 0.5 t | Offtake closes automatically; 1 wei rounding dust returned to buyer; nothing left locked | ✅ As expected |
| TC-39 | End-to-end | Full journey | Register, report, verify, offtake sale, open-market sale, withdrawals, retirement | Every tonne accounted for: supply + retired + cancelled = 9 VCC issued; payouts 80/20 | ✅ As expected |
| TC-40 | Views | Read functions | Two reports on one farm; unknown farm / report / methodology | Lists and counts correct; unknown IDs revert | ✅ As expected |
| TC-41 | dApp integration | Website preview = contract maths | 4 random gross/baseline pairs through previewIssuance() and the contract | Net kg and VCC minted identical for every case | ✅ As expected |
| TC-42 | dApp integration | Website price and split = marketplace | 4 amounts incl. fractional tonnes | quoteCost() and splitPayment() equal quote() and splitPayment() on-chain | ✅ As expected |
| TC-43 | dApp integration | In-browser SHA-256 and document check | Hash sample MRV report with Web Crypto; submit; check original and altered copy | Hash equals Node SHA-256; original found as approved report; altered copy not found | ✅ As expected |
| TC-44 | dApp integration | Website reads programme state | Run a scenario, then loadProgramme() and loadAccount() | Farms, reports, totals, offtakes, certificates, balances and roles all correct | ✅ As expected |
| TC-45 | dApp integration | Plain-language errors | Self-approval, outsider submission, no additionality, wallet rejection | Messages such as "The smart contract refused this: A second, different verifier must approve." | ✅ As expected |

## 2. Are the tests strong enough? (mutation testing)

A test suite is only useful if it fails when the code is wrong. Each key safeguard was deliberately removed from the contracts, one at a time, and the suite was re-run:

| # | Safeguard removed | Result | Caught by |
|---|---|---|---|
| M1 | Two-verifier rule (submitter may approve) | 1 test fails | TC-15 |
| M2 | Baseline (additionality) check | 1 test fails | TC-11 |
| M3 | Leakage deduction ignored | 10 tests fail | TC-07, TC-16 and others |
| M4 | No permanence buffer withheld | 9 tests fail | TC-16, TC-21 and others |
| M5 | Plausibility cap removed | 1 test fails | TC-10 |
| M6 | Committed funds closable before expiry | 1 test fails | TC-36 |
| M7 | 70% minimum farmer share removed | 1 test fails | TC-28 |
| M8 | `withdraw()` pays before zeroing, no ReentrancyGuard | 2 tests fail | TC-34 |

Every mutation was detected; with the original code restored, all 45 tests pass.

## 3. Code coverage

`npx hardhat coverage` (solidity-coverage):

| Contract | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| VerdanaCarbonCredit.sol | 100% | 85.71% | 100% | 100% |
| VerdanaMarketplace.sol | 100% | 75.61% | 100% | 100% |
| VerdanaRegistry.sol | 100% | 86.21% | 100% | 100% |

Uncovered branches are mostly the "else" side of `require` checks whose failure message is already tested in another form, and OpenZeppelin modifiers.

## 4. Testnet interaction checks (Sepolia)

`npx hardhat run scripts/interact.js --network sepolia` runs the full programme on the public testnet and also asks the deployed contracts to perform five forbidden actions (simulated with `staticCall`, so no gas is spent). Expected and actual results:

| Check | Expected | Actual |
|---|---|---|
| An outsider submits a fake report | Refused: `AccessControlUnauthorizedAccount` | ✅ Refused |
| Verifier A approves their own report | Refused: "a second, different verifier must approve" | ✅ Refused |
| Inflated report (99,999 kg on 2.5 ha) | Refused: "exceeds the plausible maximum" | ✅ Refused |
| Report with no additionality (gross = baseline) | Refused: "no additional removals above the baseline" | ✅ Refused |
| Second claim for the same farm and quarter | Refused: "already has a reading for this period" | ✅ Refused |
| Second verifier approves | Amina 8.1 VCC, Jean 4.86 VCC, buffer 1.44 VCC | ✅ As expected |
| Amina sells 6 t into committed funding | Paid immediately: 80% to Amina, 20% to the programme fund | ✅ As expected |
| Buyer retires 6 t | Certificate #1 recorded, 6 VCC burned | ✅ As expected |

## 5. Website end-to-end checks (browser)

The dApp was driven in a real Chromium browser (Playwright) against a fresh local deployment, switching between the admin, verifier B, an outsider, the farmer and the buyer. 24 checks, all passed, no page errors:

| # | Check | Result |
|---|---|---|
| 1 | Overview loads and reads the chain with no wallet installed | ✅ |
| 2 | "No wallet found" guidance shown when no wallet is installed | ✅ |
| 3 | Wallet connects (EIP-6963 discovery) | ✅ |
| 4 | Field agent registers a farm with a consent record hashed in the browser | ✅ |
| 5 | Report form preview shows 9,000 kg net and 8.1 VCC for the farmer | ✅ |
| 6 | Verifier A submits the MRV report | ✅ |
| 7 | UI warns that the submitter cannot approve | ✅ |
| 8 | Contract refuses self-approval; message shown in plain language | ✅ |
| 9 | UI warns about the plausibility cap | ✅ |
| 10 | Contract refuses the inflated report | ✅ |
| 11 | Verifier B approves; credits issued | ✅ |
| 12 | Contract refuses an outsider's fake report ("does not have the MRV verifier role") | ✅ |
| 13 | Buyer locks 0.01 ETH of committed funding for 10 tonnes | ✅ |
| 14 | Farmer dashboard shows 8.1 VCC | ✅ |
| 15 | Payout preview shows 0.0048 ETH (80% of 0.006 ETH) | ✅ |
| 16 | Farmer sells 6 t into the commitment (approve + sell) | ✅ |
| 17 | Farmer withdraws 0.0048 ETH | ✅ |
| 18 | Farmer lists 2 t on the open market | ✅ |
| 19 | Buyer buys 1 t | ✅ |
| 20 | Buyer retires 7 t; certificate appears | ✅ |
| 21 | Contract refuses closing the commitment before its end date | ✅ |
| 22 | Genuine MRV report matches its on-chain fingerprint | ✅ |
| 23 | Altered MRV report (one number changed) does not match | ✅ |
| 24 | Overview totals: 9,000 kg verified, 0.0056 ETH paid to farmers | ✅ |
