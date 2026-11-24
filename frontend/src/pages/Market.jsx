import { useState } from "react";
import { parseEther } from "ethers";
import { useWallet } from "../wallet/WalletContext.jsx";
import { useProgramme } from "../wallet/ProgrammeContext.jsx";
import { useContracts } from "../wallet/useContracts.js";
import { useTx } from "../wallet/useTx.js";
import { Card } from "../components/ui.jsx";
import { TxStatus } from "../components/TxStatus.jsx";
import { Addr, EmptyRow, Stat, StatusBadge } from "../components/bits.jsx";
import { formatDate, formatEth, formatTokenAmount } from "../lib/format.js";
import { quoteCost, sameAddress, splitPayment } from "../lib/verdana.js";
import { parseTonnes } from "./Farmer.jsx";

const DAY = 24 * 60 * 60;
const parseEth = (v) => {
  try {
    const wei = parseEther(String(v || "").trim() || "0");
    return wei > 0n ? wei : null;
  } catch {
    return null;
  }
};

function offtakeStatus(o, now) {
  if (!o.active) return "Closed";
  return o.expiresAt <= now ? "Expired" : "Active";
}

function CommitFunding({ canWrite }) {
  const { chainId } = useWallet();
  const tx = useTx();
  const [tonnes, setTonnes] = useState("10");
  const [price, setPrice] = useState("0.0001");
  const [days, setDays] = useState("90");
  const amount = parseTonnes(tonnes);
  const priceWei = parseEth(price);
  const deposit = amount && priceWei ? quoteCost(amount, priceWei) : 0n;
  const duration = Math.round(Number(days) * DAY);

  const submit = (e) => {
    e.preventDefault();
    tx.run(async (c, send) => send("Commit funding", () => c.market.createOfftake(amount, priceWei, duration, { value: deposit })), {
      title: "Funding committed",
      message: `${formatEth(deposit)} is locked on-chain until ${new Date(Date.now() + duration * 1000).toLocaleDateString("en-GB", { dateStyle: "long" })}. Farmers can now sell verified tonnes into it and be paid immediately.`,
    });
  };

  return (
    <Card title="Commit funding (offtake)" subtitle="Lock payment now for future verified tonnes, at a fixed price. Farmers get a known price and immediate payment; you can't withdraw early, which is what makes it reliable.">
      <form className="form" onSubmit={submit} data-testid="offtake-form">
        <div className="form-row">
          <label className="field">
            <span>Tonnes wanted</span>
            <input className="input" value={tonnes} onChange={(e) => setTonnes(e.target.value)} />
          </label>
          <label className="field">
            <span>Price per tonne (ETH)</span>
            <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="field">
            <span>Locked for (days)</span>
            <input className="input" type="number" min="1" max="1825" value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
        </div>
        <p className="small">
          Deposit: <strong>{formatEth(deposit)}</strong>, released to farmers as they deliver tonnes. Anything not delivered by the end date comes back to you.
        </p>
        <button className="btn btn-primary" disabled={!canWrite || !deposit || !duration || tx.busy}>
          Lock {formatEth(deposit)}
        </button>
      </form>
      <TxStatus state={tx.state} chainId={chainId} />
    </Card>
  );
}

function Commitments({ programme, account }) {
  const { chainId } = useWallet();
  const tx = useTx();
  const now = Date.now() / 1000;
  return (
    <Card title={`Committed funding (${programme.offtakes.length})`}>
      <div className="table-wrap">
        <table className="table" data-testid="offtakes-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Buyer</th>
              <th className="num">Price / t</th>
              <th className="num">Tonnes still wanted</th>
              <th className="num">Locked</th>
              <th>Until</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {programme.offtakes.length === 0 && <EmptyRow colSpan={8}>No commitments yet.</EmptyRow>}
            {programme.offtakes.map((o) => {
              const status = offtakeStatus(o, now);
              return (
                <tr key={o.id.toString()}>
                  <td>{o.id.toString()}</td>
                  <td>
                    <Addr address={o.buyer} />
                  </td>
                  <td className="num">{formatEth(o.pricePerTonneWei)}</td>
                  <td className="num">{formatTokenAmount(o.remaining)}</td>
                  <td className="num">{formatEth(o.depositWei)}</td>
                  <td>{formatDate(o.expiresAt)}</td>
                  <td>
                    <StatusBadge status={status} />
                  </td>
                  <td className="num">
                    {sameAddress(o.buyer, account) && o.active && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={tx.busy}
                        title={status === "Active" ? "The contract will refuse: funds are locked until the end date" : ""}
                        onClick={() =>
                          tx.run(async (c, send) => send("Close commitment", () => c.market.closeOfftake(o.id)), {
                            title: "Commitment closed",
                            message: "The undelivered part of your deposit is ready to withdraw below.",
                          })
                        }
                      >
                        Close
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TxStatus state={tx.state} chainId={chainId} />
    </Card>
  );
}

function Listings({ programme, account, canWrite }) {
  const { chainId } = useWallet();
  const tx = useTx();
  const [amounts, setAmounts] = useState({});
  const active = programme.listings.filter((l) => l.active);
  const share = programme.settings.farmerShareBps;

  const buy = (l) => {
    const amount = parseTonnes(amounts[l.id]);
    const cost = quoteCost(amount, l.pricePerTonneWei);
    tx.run(async (c, send) => send(`Buy from listing #${l.id}`, () => c.market.buy(l.id, amount, { value: cost })), {
      title: "Credits purchased",
      message: `You paid ${formatEth(cost)}; the farmer receives ${formatEth(splitPayment(cost, share).farmer)}. Retire the credits below to claim your offset.`,
    });
  };

  return (
    <Card title="Open market" subtitle={`Credits listed by farmers. ${share / 100}% of what you pay goes to the farmer, ${100 - share / 100}% to the programme fund.`}>
      <div className="table-wrap">
        <table className="table" data-testid="listings-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Seller</th>
              <th className="num">Available</th>
              <th className="num">Price / t</th>
              <th>Buy</th>
            </tr>
          </thead>
          <tbody>
            {active.length === 0 && <EmptyRow colSpan={5}>No credits are listed right now.</EmptyRow>}
            {active.map((l) => {
              const amount = parseTonnes(amounts[l.id]);
              const cost = amount ? quoteCost(amount, l.pricePerTonneWei) : 0n;
              const own = sameAddress(l.seller, account);
              return (
                <tr key={l.id.toString()}>
                  <td>{l.id.toString()}</td>
                  <td>
                    <Addr address={l.seller} />
                  </td>
                  <td className="num">{formatTokenAmount(l.remaining)} VCC</td>
                  <td className="num">{formatEth(l.pricePerTonneWei)}</td>
                  <td>
                    <div className="buy-cell">
                      <input className="input input-sm" placeholder="Tonnes" value={amounts[l.id] ?? ""} onChange={(e) => setAmounts((x) => ({ ...x, [l.id]: e.target.value }))} />
                      <button className="btn btn-primary btn-sm" disabled={!canWrite || !amount || own || tx.busy} onClick={() => buy(l)}>
                        {cost ? `Pay ${formatEth(cost)}` : "Buy"}
                      </button>
                      {own && <span className="small muted">your listing</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TxStatus state={tx.state} chainId={chainId} />
    </Card>
  );
}

function Retire({ me, canWrite }) {
  const { chainId } = useWallet();
  const tx = useTx();
  const [tonnes, setTonnes] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [reason, setReason] = useState("");
  const amount = parseTonnes(tonnes);

  const submit = (e) => {
    e.preventDefault();
    tx.run(async (c, send) => send("Retire credits", () => c.token.retire(amount, beneficiary.trim(), reason.trim())), {
      title: "Credits retired",
      message: `${tonnes} t CO₂e retired for ${beneficiary.trim().replace(/\.$/, "")}. The credits are burned and a public certificate was recorded.`,
    });
  };

  return (
    <Card title="Retire credits to claim an offset" subtitle="Retiring burns the credits and records a public certificate, so the same tonne can never be sold or claimed again.">
      <form className="form" onSubmit={submit} data-testid="retire-form">
        <p className="small">You hold <strong>{me ? formatTokenAmount(me.vcc) : "0"} VCC</strong>.</p>
        <div className="form-row">
          <label className="field">
            <span>Tonnes to retire</span>
            <input className="input" value={tonnes} onChange={(e) => setTonnes(e.target.value)} placeholder="2" />
          </label>
          <label className="field">
            <span>Claimed by (beneficiary)</span>
            <input className="input" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="Kigali Green Coffee Co." />
          </label>
        </div>
        <label className="field">
          <span>What the offset covers (optional)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="2026 roasting emissions" />
        </label>
        <button className="btn btn-primary" disabled={!canWrite || !amount || !beneficiary.trim() || tx.busy}>
          Retire credits
        </button>
      </form>
      <TxStatus state={tx.state} chainId={chainId} />
    </Card>
  );
}

export function Market() {
  const { account, chainId } = useWallet();
  const { programme, me, loading } = useProgramme();
  const { canWrite } = useContracts();
  const withdrawTx = useTx();
  if (!programme) return loading ? <p className="muted">Loading the programme...</p> : null;
  const t = programme.totals;

  return (
    <div className="stack-lg">
      <header className="page-header">
        <h1>Funding &amp; market</h1>
        <p className="lead">
          Farmers are only ever paid from money that is already in the contract, never from a promise. Buyers either commit funding up front or buy listed credits.
        </p>
      </header>

      <div className="stat-grid">
        <Stat label="Committed funding locked" value={formatEth(t.totalCommittedWei)} />
        <Stat label="Paid by buyers" value={formatEth(t.totalVolumeWei)} />
        <Stat label="To farmers" value={formatEth(t.totalToFarmersWei)} note={`${programme.settings.farmerShareBps / 100}% of every sale`} />
        <Stat label="To the programme fund" value={formatEth(t.totalToProgrammeWei)} note="monitoring, verification, aggregation" />
      </div>

      <div className="grid-2 grid-even">
        <CommitFunding canWrite={canWrite} />
        <Retire me={me} canWrite={canWrite} />
      </div>
      <Commitments programme={programme} account={account} />
      <Listings programme={programme} account={account} canWrite={canWrite} />

      {me && me.pending > 0n && (
        <Card title="Money waiting for you" subtitle="Refunds from closed commitments, sales proceeds or programme fund income.">
          <button
            className="btn btn-primary"
            disabled={withdrawTx.busy}
            onClick={() =>
              withdrawTx.run(async (c, send) => send("Withdraw", () => c.market.withdraw()), { title: "Withdrawn", message: `${formatEth(me.pending)} was sent to your wallet.` })
            }
          >
            Withdraw {formatEth(me.pending)}
          </button>
          <TxStatus state={withdrawTx.state} chainId={chainId} />
        </Card>
      )}

      <Card title={`Retirement certificates (${programme.retirements.length})`}>
        <div className="table-wrap">
          <table className="table" data-testid="retirements-table">
            <thead>
              <tr>
                <th>Certificate</th>
                <th className="num">Tonnes</th>
                <th>Beneficiary</th>
                <th>Covers</th>
                <th>Retired by</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {programme.retirements.length === 0 && <EmptyRow colSpan={6}>No credits retired yet.</EmptyRow>}
              {programme.retirements.map((r) => (
                <tr key={r.id.toString()}>
                  <td>#{r.id.toString()}</td>
                  <td className="num">{formatTokenAmount(r.amount)}</td>
                  <td>{r.beneficiary}</td>
                  <td>{r.reason || <span className="muted">-</span>}</td>
                  <td>
                    <Addr address={r.retiredBy} />
                  </td>
                  <td>{formatDate(r.retiredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
