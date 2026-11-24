import { useState } from "react";
import { parseEther, parseUnits } from "ethers";
import { useWallet } from "../wallet/WalletContext.jsx";
import { useProgramme } from "../wallet/ProgrammeContext.jsx";
import { useContracts } from "../wallet/useContracts.js";
import { useTx } from "../wallet/useTx.js";
import { Alert, Card } from "../components/ui.jsx";
import { TxStatus } from "../components/TxStatus.jsx";
import { Addr, EmptyRow, Locked, Stat, StatusBadge } from "../components/bits.jsx";
import { formatDate, formatEth, formatHectares, formatKg, formatPeriod, formatTokenAmount } from "../lib/format.js";
import { quoteCost, sameAddress, splitPayment } from "../lib/verdana.js";

/** "2.5" tonnes -> credit units, or null when invalid. */
export function parseTonnes(value) {
  try {
    const units = parseUnits(String(value || "").trim() || "0", 18);
    return units > 0n ? units : null;
  } catch {
    return null;
  }
}

/** Approves the marketplace first if it can't already move `amount` credits. */
export async function ensureAllowance(c, send, me, amount) {
  if (me.allowance >= amount) return;
  await send("Step 1 of 2: allow the marketplace to move your credits", async () => c.token.approve(await c.market.getAddress(), amount));
}

function SellToOfftakes({ programme, me }) {
  const { chainId } = useWallet();
  const tx = useTx();
  const [amounts, setAmounts] = useState({});
  const now = Date.now() / 1000;
  const open = programme.offtakes.filter((o) => o.active && o.expiresAt > now);
  const share = programme.settings.farmerShareBps;

  const sell = (o) => {
    const amount = parseTonnes(amounts[o.id]);
    tx.run(
      async (c, send) => {
        await ensureAllowance(c, send, me, amount);
        return send(me.allowance >= amount ? "Sell into committed funding" : "Step 2 of 2: sell into committed funding", () => c.market.sellToOfftake(o.id, amount));
      },
      {
        title: "Sold: you've been paid",
        message: `Your share (${share / 100}%) is waiting in "Earnings to withdraw" above.`,
      }
    );
  };

  return (
    <Card title="Sell into committed funding" subtitle="Buyers have already locked this money on-chain. Sell your verified credits and you are paid at once, at the agreed price.">
      {open.length === 0 && <p className="muted">No committed funding is open right now.</p>}
      <div className="review-list">
        {open.map((o) => {
          const amount = parseTonnes(amounts[o.id]);
          const cost = amount ? quoteCost(amount, o.pricePerTonneWei) : 0n;
          const { farmer } = splitPayment(cost, share);
          return (
            <div className="review-item" key={o.id.toString()} data-testid={`offtake-${o.id}`}>
              <div className="review-head">
                <strong>
                  Commitment #{o.id.toString()} · {formatEth(o.pricePerTonneWei)} per tonne
                </strong>
                <span className="small muted">until {formatDate(o.expiresAt)}</span>
              </div>
              <p className="small">
                Wants {formatTokenAmount(o.remaining)} more tonnes · {formatEth(o.depositWei)} locked · buyer <Addr address={o.buyer} />
              </p>
              <div className="review-actions">
                <input className="input input-sm" placeholder="Tonnes to sell" value={amounts[o.id] ?? ""} onChange={(e) => setAmounts((x) => ({ ...x, [o.id]: e.target.value }))} />
                <button className="btn btn-primary btn-sm" disabled={!amount || tx.busy || amount > me.vcc} onClick={() => sell(o)}>
                  Sell and get paid
                </button>
                {amount && <span className="small">You receive <strong>{formatEth(farmer)}</strong> ({share / 100}% of {formatEth(cost)})</span>}
              </div>
            </div>
          );
        })}
      </div>
      <TxStatus state={tx.state} chainId={chainId} />
    </Card>
  );
}

function ListOnMarket({ programme, me, account }) {
  const { chainId } = useWallet();
  const tx = useTx();
  const cancelTx = useTx();
  const [tonnes, setTonnes] = useState("");
  const [price, setPrice] = useState("0.001");
  const amount = parseTonnes(tonnes);
  let priceWei = null;
  try {
    priceWei = parseEther(price || "0");
  } catch {
    priceWei = null;
  }
  const mine = programme.listings.filter((l) => sameAddress(l.seller, account));

  const list = (e) => {
    e.preventDefault();
    tx.run(
      async (c, send) => {
        await ensureAllowance(c, send, me, amount);
        return send(me.allowance >= amount ? "List credits" : "Step 2 of 2: list credits", () => c.market.createListing(amount, priceWei));
      },
      { title: "Credits listed", message: "They are held in escrow by the marketplace until sold or cancelled." }
    );
  };

  return (
    <Card title="Sell on the open market" subtitle={`Set your own price. Buyers pay in ETH; ${programme.settings.farmerShareBps / 100}% of every sale is yours.`}>
      <form className="form" onSubmit={list} data-testid="list-form">
        <div className="form-row">
          <label className="field">
            <span>Tonnes (VCC)</span>
            <input className="input" value={tonnes} onChange={(e) => setTonnes(e.target.value)} placeholder="3" />
          </label>
          <label className="field">
            <span>Price per tonne (ETH)</span>
            <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>
        <button className="btn btn-primary" disabled={!amount || !priceWei || amount > me.vcc || tx.busy}>
          List credits
        </button>
      </form>
      <TxStatus state={tx.state} chainId={chainId} />
      <table className="table">
        <thead>
          <tr>
            <th>Listing</th>
            <th className="num">Remaining</th>
            <th className="num">Price / t</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {mine.length === 0 && <EmptyRow colSpan={5}>You have no listings.</EmptyRow>}
          {mine.map((l) => (
            <tr key={l.id.toString()}>
              <td>#{l.id.toString()}</td>
              <td className="num">{formatTokenAmount(l.remaining)} VCC</td>
              <td className="num">{formatEth(l.pricePerTonneWei)}</td>
              <td>
                <StatusBadge status={l.active ? "Active" : "Closed"} />
              </td>
              <td className="num">
                {l.active && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={cancelTx.busy}
                    onClick={() =>
                      cancelTx.run(async (c, send) => send("Cancel listing", () => c.market.cancelListing(l.id)), {
                        title: "Listing cancelled",
                        message: "Unsold credits were returned to your wallet.",
                      })
                    }
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <TxStatus state={cancelTx.state} chainId={chainId} />
    </Card>
  );
}

export function Farmer() {
  const { account, chainId } = useWallet();
  const { programme, me, loading } = useProgramme();
  const { canWrite } = useContracts();
  const withdrawTx = useTx();
  if (!programme) return loading ? <p className="muted">Loading the programme...</p> : null;

  if (!canWrite || !me) {
    return (
      <div className="stack-lg">
        <header className="page-header">
          <h1>My Farm</h1>
        </header>
        <Card className="card-locked">
          <Locked title="Connect your wallet">Connect the wallet your farm is registered to, to see your credits, sell them and withdraw your earnings.</Locked>
        </Card>
      </div>
    );
  }

  const farms = programme.farms.filter((f) => me.farmIds.some((id) => id === f.id));
  const readings = programme.readings.filter((r) => me.farmIds.some((id) => id === r.farmId));

  return (
    <div className="stack-lg">
      <header className="page-header">
        <h1>My Farm</h1>
        <p className="lead">Your verified credits, your sales and your earnings. Each credit is one tonne of CO₂e your trees removed above the baseline.</p>
      </header>

      {farms.length === 0 && (
        <Alert tone="info" title="No farm is registered to this wallet">
          Farms are enrolled by a Verdana field agent. You can still sell or retire any credits this wallet holds.
        </Alert>
      )}

      <div className="stat-grid">
        <Stat label="Your credits" value={`${formatTokenAmount(me.vcc)} VCC`} note="1 VCC = 1 tonne CO₂e" testId="my-vcc" />
        <Stat label="Earnings to withdraw" value={formatEth(me.pending)} note="your share of sales so far" testId="my-pending" />
        <Stat label="Farms" value={farms.length} note={farms.map((f) => f.region).join(", ") || "none"} />
      </div>

      <Card title="Withdraw earnings" subtitle="In production, this is where an off-chain payout service converts to local currency and pays your mobile-money account.">
        <button
          className="btn btn-primary"
          data-testid="withdraw-button"
          disabled={me.pending === 0n || withdrawTx.busy}
          onClick={() =>
            withdrawTx.run(async (c, send) => send("Withdraw earnings", () => c.market.withdraw()), {
              title: "Earnings withdrawn",
              message: `${formatEth(me.pending)} was sent to your wallet.`,
            })
          }
        >
          Withdraw {formatEth(me.pending)}
        </button>
        <TxStatus state={withdrawTx.state} chainId={chainId} />
      </Card>

      {farms.map((f) => (
        <Card key={f.id.toString()} title={`Farm #${f.id} · ${f.region}`} subtitle={`${formatHectares(f.areaX100)} · registered ${formatDate(f.registeredAt)}`}>
          <p>
            <StatusBadge status={f.active ? "Active" : "Inactive"} /> Net verified {formatKg(f.issuedKg)}
            {f.reversedKg > 0n && ` · reversed ${formatKg(f.reversedKg)}`}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Period</th>
                <th className="num">Net</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {readings.filter((r) => r.farmId === f.id).length === 0 && <EmptyRow colSpan={4}>No reports yet.</EmptyRow>}
              {readings
                .filter((r) => r.farmId === f.id)
                .map((r) => (
                  <tr key={r.id.toString()}>
                    <td>#{r.id.toString()}</td>
                    <td>{formatPeriod(r.period)}</td>
                    <td className="num">{formatKg(r.netKg)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      ))}

      <SellToOfftakes programme={programme} me={me} />
      <ListOnMarket programme={programme} me={me} account={account} />
    </div>
  );
}
