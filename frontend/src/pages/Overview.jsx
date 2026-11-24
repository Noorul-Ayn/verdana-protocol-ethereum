import { Link } from "react-router-dom";
import { useProgramme } from "../wallet/ProgrammeContext.jsx";
import { Card } from "../components/ui.jsx";
import { Stat } from "../components/bits.jsx";
import { CoinsIcon, FileIcon, LeafIcon, SatelliteIcon, ScaleIcon, ShieldIcon, UsersIcon } from "../components/Icons.jsx";
import { formatBps, formatEth, formatKg, formatTokenAmount } from "../lib/format.js";

const STEPS = [
  { icon: UsersIcon, title: "1. Enrol", text: "A field agent registers the farm with its land rights and the farmer's signed consent. Farmers pay nothing to join." },
  { icon: SatelliteIcon, title: "2. Monitor", text: "Remote sensing tracks canopy and land-use change; field plots measure the trees. Together they feed an approved methodology." },
  { icon: ScaleIcon, title: "3. Verify", text: "Only removals above the baseline count, minus leakage. A second, independent verifier must approve before any credit exists." },
  { icon: CoinsIcon, title: "4. Fund", text: "Buyers lock money on-chain in advance for future tonnes (committed funding) or buy on the open market." },
  { icon: LeafIcon, title: "5. Share", text: "Every sale is split by a public rule: 80% to the farmer, 20% to the programme. Withdrawal is the mobile-money payout point." },
];

const SAFEGUARDS = [
  "Only approved MRV verifiers can submit reports, and a different verifier must approve each one",
  "A farmer can never verify their own farm",
  "No credit without additionality: removals must exceed the baseline; leakage is deducted",
  "Reports must use an approved methodology and stay under a per-hectare plausibility cap",
  "One registration per plot and one report per farm per quarter: no double claiming",
  "Every farm needs a land-rights and consent record; every report a SHA-256 evidence fingerprint",
  "10% of every issuance goes to a permanence buffer that covers lost trees",
  "Committed funds cannot be withdrawn before their end date; the farmer's share can never drop below 70%",
  "Retired credits are burned with a public certificate, so a tonne can't be claimed twice",
];

export function Overview() {
  const { programme, loading } = useProgramme();
  const t = programme?.totals;
  const dash = loading ? "..." : "-";

  return (
    <div className="stack-lg">
      <section className="hero">
        <div>
          <p className="eyebrow">Climate-finance access and coordination</p>
          <h1>Making protecting trees economically meaningful to the people living alongside them.</h1>
          <p className="lead">
            For a smallholder farmer, cutting a tree pays today, while keeping it standing rarely pays at all. Carbon
            finance could change that, but measurement, verification, aggregation and access to buyers are out of reach
            for individual farmers. Verdana brings dispersed farms into one programme, records independently verified
            removals, locks buyers' money up front and shares every sale transparently.
          </p>
          <div className="hero-actions">
            <Link to="/farms" className="btn btn-primary btn-lg">
              Explore farms &amp; reports
            </Link>
            <Link to="/market" className="btn btn-outline btn-lg">
              Funding &amp; market
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <p className="hero-panel-title">Where the money goes, per sale</p>
          <div className="split-bar" aria-label="80% to the farmer, 20% to the programme fund">
            <span style={{ width: `${(programme?.settings.farmerShareBps ?? 8000) / 100}%` }}>
              Farmer {formatBps(programme?.settings.farmerShareBps ?? 8000)}
            </span>
            <span>Programme {formatBps(10000 - (programme?.settings.farmerShareBps ?? 8000))}</span>
          </div>
          <p className="small muted">
            The programme share pays for monitoring, verification and aggregation. It is fixed in the marketplace contract
            and can never leave the farmer with less than 70%.
          </p>
          <p className="hero-panel-title">Of every verified tonne</p>
          <div className="split-bar split-bar-alt" aria-label="90% issued to the farmer, 10% to the buffer pool">
            <span style={{ width: `${100 - (programme?.settings.bufferBps ?? 1000) / 100}%` }}>
              Farmer {100 - (programme?.settings.bufferBps ?? 1000) / 100}%
            </span>
            <span>Buffer {formatBps(programme?.settings.bufferBps ?? 1000)}</span>
          </div>
          <p className="small muted">The buffer pool insures buyers against reversals such as fire or felling.</p>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>The programme, live from the blockchain</h2>
          <p className="muted">Every number below is read directly from the smart contracts.</p>
        </div>
        <div className="stat-grid stat-grid-4" data-testid="programme-stats">
          <Stat label="Farms enrolled" value={t ? t.farmCount.toString() : dash} testId="stat-farms" />
          <Stat
            label="MRV reports approved"
            value={programme ? programme.readings.filter((r) => r.status === "Approved").length : dash}
            note={programme ? `${programme.readings.length} submitted in total` : null}
          />
          <Stat label="Net CO₂e verified" value={t ? formatKg(t.totalIssuedKg) : dash} note="after baseline and leakage" testId="stat-verified" />
          <Stat label="Credits in circulation" value={t ? `${formatTokenAmount(t.totalSupply)} VCC` : dash} note="1 VCC = 1 tonne CO₂e" testId="stat-supply" />
          <Stat label="Retired (offsets claimed)" value={t ? `${formatTokenAmount(t.totalRetired)} VCC` : dash} testId="stat-retired" />
          <Stat label="Permanence buffer" value={t ? `${formatTokenAmount(t.bufferPool)} VCC` : dash} note={t ? `${formatTokenAmount(t.totalCancelled)} VCC cancelled for reversals` : null} />
          <Stat label="Paid to farmers" value={t ? formatEth(t.totalToFarmersWei) : dash} testId="stat-paid" />
          <Stat label="Committed funding locked" value={t ? formatEth(t.totalCommittedWei) : dash} note="waiting for verified tonnes" testId="stat-committed" />
        </div>
      </section>

      <Card title="How Verdana works">
        <ol className="steps steps-5">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Icon aria-hidden="true" />
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid-2">
        <Card title="What the smart contracts guarantee" subtitle="Enforced in code, so no single person or data source can create credits on their own.">
          <ul className="check-list">
            {SAFEGUARDS.map((s) => (
              <li key={s}>
                <ShieldIcon aria-hidden="true" /> {s}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="What blockchain is (and isn't) doing here">
          <p>
            Carbon value comes from trees that stay standing and from credible measurement, not from a token. The blockchain is
            the <strong>trust and accountability layer</strong>: a shared record of who is enrolled, which evidence was
            approved by whom, how many credits exist, who was paid what, and which credits were retired.
          </p>
          <p>
            Documents stay off-chain (privacy); only their SHA-256 fingerprints are recorded, so anyone can later check a report
            or consent record has not been altered.
          </p>
          <p>
            <Link to="/farms" className="inline-link">
              <FileIcon aria-hidden="true" /> Check a document against the chain
            </Link>
          </p>
          <p className="small muted">
            Demo data: the methodology, farms and reports are illustrative. A real programme would use a recognised methodology
            and accredited third-party verifiers.
          </p>
        </Card>
      </div>
    </div>
  );
}
