import { useState } from "react";
import { isAddress } from "ethers";
import { useWallet } from "../wallet/WalletContext.jsx";
import { useProgramme } from "../wallet/ProgrammeContext.jsx";
import { useContracts } from "../wallet/useContracts.js";
import { useTx } from "../wallet/useTx.js";
import { Alert, Card } from "../components/ui.jsx";
import { TxStatus } from "../components/TxStatus.jsx";
import { Addr, FileHashInput, Hash, Locked, StatusBadge } from "../components/bits.jsx";
import { formatHectares, formatKg, formatPeriod, formatTokenAmount } from "../lib/format.js";
import { hectaresToX100, locationHash, maxReadingFor, previewIssuance, ROLE_LABELS, sameAddress, toPeriod } from "../lib/verdana.js";

function RoleSummary({ me }) {
  const { isConnected } = useWallet();
  if (!isConnected) return <Alert tone="info" title="Connect a wallet">Connect the wallet of a field agent or verifier to use this console. Anyone can still read every record on the Farms &amp; Reports page.</Alert>;
  if (!me) return null;
  const roles = Object.entries(me.roles).filter(([, v]) => v).map(([k]) => ROLE_LABELS[k]);
  return (
    <Alert tone={roles.length ? "success" : "warning"} title={roles.length ? `Your roles: ${roles.join(", ")}` : "This wallet has no programme role"}>
      {roles.length
        ? "The smart contract checks these roles on every action. A different verifier must approve each report you submit."
        : "Only approved field agents and MRV verifiers can act here. The admin grants roles on the Admin page. You can still try an action to see the contract refuse it."}
    </Alert>
  );
}

function RegisterFarm({ me, programme }) {
  const { chainId } = useWallet();
  const tx = useTx();
  const [form, setForm] = useState({ farmer: "", grid: "", area: "", region: "" });
  const [landHash, setLandHash] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const areaX100 = hectaresToX100(form.area);
  const valid = isAddress(form.farmer) && form.grid.trim() && areaX100 && form.region.trim() && landHash;

  const submit = (e) => {
    e.preventDefault();
    tx.run(
      async (c, send) => send("Register farm", () => c.registry.registerFarm(form.farmer, locationHash(form.grid), landHash, areaX100, form.region.trim())),
      { title: "Farm registered", message: `${form.region} (${formatHectares(areaX100)}) is now enrolled in the programme.` }
    );
  };

  return (
    <Card title="1. Register a farm" subtitle="Field agents enrol a farm after documenting land rights and recording the farmer's consent.">
      {!me?.roles.registrar && <p className="role-note">Requires the field agent (registrar) role.</p>}
      <form className="form" onSubmit={submit} data-testid="register-farm-form">
        <label className="field">
          <span>Farmer's wallet address</span>
          <input className="input mono" value={form.farmer} onChange={set("farmer")} placeholder="0x..." />
        </label>
        <div className="form-row">
          <label className="field">
            <span>Grid cell (stored only as a hash)</span>
            <input className="input" value={form.grid} onChange={set("grid")} placeholder="geohash:kxt8f" />
          </label>
          <label className="field">
            <span>Area (hectares)</span>
            <input className="input" type="number" min="0" step="0.01" value={form.area} onChange={set("area")} placeholder="2.5" />
          </label>
        </div>
        <label className="field">
          <span>Region</span>
          <input className="input" value={form.region} onChange={set("region")} placeholder="Musanze, Rwanda" />
        </label>
        <FileHashInput label="Signed land-rights and consent record" hint="e.g. samples/land-records/farm-1-consent.json" value={landHash} onChange={setLandHash} testId="land-record-input" />
        {areaX100 && (
          <p className="small muted">
            Plausibility cap for this farm: up to {formatKg(maxReadingFor(areaX100, programme.settings.maxKgPerHectarePerPeriod))} gross removals per quarter.
          </p>
        )}
        <button className="btn btn-primary" disabled={!valid || tx.busy}>
          Register farm
        </button>
      </form>
      <TxStatus state={tx.state} chainId={chainId} />
    </Card>
  );
}

function SubmitReport({ me, programme }) {
  const { chainId } = useWallet();
  const tx = useTx();
  const activeFarms = programme.farms.filter((f) => f.active);
  const activeMethods = programme.methodologies.filter((m) => m.active);
  const [form, setForm] = useState({ farmId: "", year: "2026", quarter: "3", methodologyId: "", gross: "", baseline: "" });
  const [evidence, setEvidence] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const farm = programme.farms.find((f) => f.id.toString() === form.farmId);
  const method = programme.methodologies.find((m) => m.id === (form.methodologyId || activeMethods[0]?.id));
  const preview = method && form.gross ? previewIssuance({ grossKg: form.gross, baselineKg: form.baseline || 0, leakageBps: method.leakageBps, bufferBps: programme.settings.bufferBps }) : null;
  const cap = farm ? maxReadingFor(farm.areaX100, programme.settings.maxKgPerHectarePerPeriod) : null;
  const overCap = cap !== null && form.gross && BigInt(form.gross) > cap;
  const isOwnFarm = farm && sameAddress(farm.farmer, me?.address);
  const valid = farm && method && form.gross && evidence;

  const submit = (e) => {
    e.preventDefault();
    tx.run(
      async (c, send) =>
        send("Submit MRV report", () =>
          c.registry.submitReading(farm.id, toPeriod(form.year, form.quarter), method.id, BigInt(form.gross), BigInt(form.baseline || 0), evidence)
        ),
      { title: "Report submitted", message: "It is now pending. A different verifier must review and approve it before any credit is issued." }
    );
  };

  return (
    <Card title="2. Submit an MRV report" subtitle="Remote sensing + field plots + the methodology's calculation. The report file stays off-chain; its SHA-256 is recorded.">
      {!me?.roles.verifier && <p className="role-note">Requires the MRV verifier role.</p>}
      <form className="form" onSubmit={submit} data-testid="submit-report-form">
        <div className="form-row form-row-wide-first">
          <label className="field">
            <span>Farm</span>
            <select className="input" value={form.farmId} onChange={set("farmId")}>
              <option value="">Choose a farm</option>
              {activeFarms.map((f) => (
                <option key={f.id.toString()} value={f.id.toString()}>
                  #{f.id.toString()} {f.region} ({formatHectares(f.areaX100)})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Year</span>
            <input className="input" type="number" value={form.year} onChange={set("year")} />
          </label>
          <label className="field">
            <span>Quarter</span>
            <select className="input" value={form.quarter} onChange={set("quarter")}>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Methodology</span>
          <select className="input" value={form.methodologyId || activeMethods[0]?.id || ""} onChange={set("methodologyId")}>
            {activeMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} (leakage {m.leakageBps / 100}%)
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label className="field">
            <span>Gross removals (kg CO₂e)</span>
            <input className="input" type="number" min="0" value={form.gross} onChange={set("gross")} placeholder="11250" />
          </label>
          <label className="field">
            <span>Baseline (kg CO₂e)</span>
            <input className="input" type="number" min="0" value={form.baseline} onChange={set("baseline")} placeholder="1250" />
          </label>
        </div>
        <FileHashInput label="MRV report file" hint="e.g. samples/mrv-reports/farm-1-2026Q3.json" value={evidence} onChange={setEvidence} testId="evidence-input" />

        {preview && (
          <div className="calc" data-testid="issuance-preview">
            <div><span>Additional (gross - baseline)</span><strong>{formatKg(preview.additional)}</strong></div>
            <div><span>Leakage deduction ({method.leakageBps / 100}%)</span><strong>- {formatKg(preview.leakage)}</strong></div>
            <div className="calc-total"><span>Net verified</span><strong>{formatKg(preview.net)}</strong></div>
            <div><span>Permanence buffer ({programme.settings.bufferBps / 100}%)</span><strong>{formatKg(preview.buffer)}</strong></div>
            <div className="calc-total"><span>Farmer receives on approval</span><strong>{formatTokenAmount(preview.farmer * 10n ** 15n, 18, 3)} VCC</strong></div>
          </div>
        )}
        {preview && !preview.additionalityOk && <Alert tone="warning" title="No additionality">Gross removals must exceed the baseline. The contract will refuse this report.</Alert>}
        {overCap && <Alert tone="warning" title="Above the plausibility cap">This farm can report at most {formatKg(cap)} per quarter. The contract will refuse this report.</Alert>}
        {isOwnFarm && <Alert tone="warning" title="This is your own farm">Farmers can never verify their own farm. The contract will refuse this report.</Alert>}
        <button className="btn btn-primary" disabled={!valid || tx.busy}>
          Submit report
        </button>
      </form>
      <TxStatus state={tx.state} chainId={chainId} />
    </Card>
  );
}

function PendingReports({ me, programme, account }) {
  const { chainId } = useWallet();
  const tx = useTx();
  const [reasons, setReasons] = useState({});
  const pending = programme.readings.filter((r) => r.status === "Pending");

  const approve = (r) =>
    tx.run(async (c, send) => send(`Approve report #${r.id}`, () => c.registry.approveReading(r.id)), {
      title: `Report #${r.id} approved`,
      message: "Credits were issued: the farmer's share to the farmer and the buffer share to the permanence pool.",
    });
  const reject = (r) =>
    tx.run(async (c, send) => send(`Reject report #${r.id}`, () => c.registry.rejectReading(r.id, reasons[r.id] ?? "")), {
      title: `Report #${r.id} rejected`,
      message: "No credits were issued. The quarter is free for a corrected report.",
    });

  return (
    <Card title="3. Review pending reports" subtitle="The two-verifier rule: the verifier who submitted a report cannot approve it.">
      {!me?.roles.verifier && <p className="role-note">Requires the MRV verifier role.</p>}
      {pending.length === 0 && <p className="muted">No reports are waiting for review.</p>}
      <div className="review-list">
        {pending.map((r) => {
          const farm = programme.farms.find((f) => f.id === r.farmId);
          const mine = sameAddress(r.submittedBy, account);
          return (
            <div className="review-item" key={r.id.toString()} data-testid={`pending-${r.id}`}>
              <div className="review-head">
                <strong>
                  Report #{r.id.toString()} · Farm #{r.farmId.toString()} {farm?.region} · {formatPeriod(r.period)}
                </strong>
                <StatusBadge status={r.status} />
              </div>
              <p className="small">
                Gross {formatKg(r.grossKg)} - baseline {formatKg(r.baselineKg)} → <strong>net {formatKg(r.netKg)}</strong> · evidence <Hash value={r.evidenceHash} /> · submitted by <Addr address={r.submittedBy} />
              </p>
              {mine && <p className="small warn-text">You submitted this report, so the contract will refuse your approval. Switch to a different verifier's wallet.</p>}
              <div className="review-actions">
                <button className="btn btn-primary btn-sm" onClick={() => approve(r)} disabled={tx.busy}>
                  Approve and issue credits
                </button>
                <input
                  className="input input-sm"
                  placeholder="Reason for rejection"
                  value={reasons[r.id] ?? ""}
                  onChange={(e) => setReasons((x) => ({ ...x, [r.id]: e.target.value }))}
                />
                <button className="btn btn-outline btn-sm" onClick={() => reject(r)} disabled={tx.busy || !(reasons[r.id] ?? "").trim()}>
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <TxStatus state={tx.state} chainId={chainId} />
    </Card>
  );
}

function RecordReversal({ me, programme }) {
  const { chainId } = useWallet();
  const tx = useTx();
  const [farmId, setFarmId] = useState("");
  const [lost, setLost] = useState("");
  const [reason, setReason] = useState("");
  const credited = programme.farms.filter((f) => f.issuedKg > f.reversedKg);
  const farm = programme.farms.find((f) => f.id.toString() === farmId);

  const submit = (e) => {
    e.preventDefault();
    tx.run(async (c, send) => send("Record reversal", () => c.registry.recordReversal(farm.id, BigInt(lost), reason)), {
      title: "Reversal recorded",
      message: "The farm was deactivated and the same tonnage was cancelled from the buffer pool. Credits that buyers hold are unaffected.",
    });
  };

  return (
    <Card title="4. Record a reversal (permanence)" subtitle="If credited trees are lost (fire, felling), the loss is covered by cancelling credits from the buffer pool.">
      {!me?.roles.verifier && <p className="role-note">Requires the MRV verifier role.</p>}
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <label className="field">
            <span>Farm</span>
            <select className="input" value={farmId} onChange={(e) => setFarmId(e.target.value)}>
              <option value="">Choose a credited farm</option>
              {credited.map((f) => (
                <option key={f.id.toString()} value={f.id.toString()}>
                  #{f.id.toString()} {f.region} (credited {formatKg(f.issuedKg - f.reversedKg)})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>CO₂e lost (kg)</span>
            <input className="input" type="number" min="0" value={lost} onChange={(e) => setLost(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>What happened</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="0.2 ha cleared, confirmed by field visit" />
        </label>
        <p className="small muted">Buffer pool: {formatTokenAmount(programme.totals.bufferPool)} VCC.</p>
        <button className="btn btn-outline" disabled={!farm || !lost || !reason.trim() || tx.busy}>
          Record reversal
        </button>
      </form>
      <TxStatus state={tx.state} chainId={chainId} />
    </Card>
  );
}

export function Verifier() {
  const { account } = useWallet();
  const { programme, me, loading } = useProgramme();
  const { canWrite } = useContracts();
  if (!programme) return loading ? <p className="muted">Loading the programme...</p> : null;
  const meWithAddress = me ? { ...me, address: account } : null;

  return (
    <div className="stack-lg">
      <header className="page-header">
        <h1>Verifier Console</h1>
        <p className="lead">For field agents and MRV verifiers. Every rule shown here is enforced by the registry contract, not by this website.</p>
      </header>
      <RoleSummary me={me} />
      {canWrite ? (
        <>
          <div className="grid-2 grid-even">
            <RegisterFarm me={meWithAddress} programme={programme} />
            <SubmitReport me={meWithAddress} programme={programme} />
          </div>
          <PendingReports me={meWithAddress} programme={programme} account={account} />
          <RecordReversal me={meWithAddress} programme={programme} />
        </>
      ) : (
        <Card className="card-locked">
          <Locked title="Connect a wallet on a supported network">Use the Connect Wallet button. The console needs a wallet to sign transactions.</Locked>
        </Card>
      )}
    </div>
  );
}
