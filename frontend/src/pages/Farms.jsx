import { useState } from "react";
import { useProgramme } from "../wallet/ProgrammeContext.jsx";
import { Alert, Card } from "../components/ui.jsx";
import { Addr, EmptyRow, FileHashInput, Hash, StatusBadge } from "../components/bits.jsx";
import { CheckCircleIcon, WarningIcon } from "../components/Icons.jsx";
import { formatDate, formatHectares, formatKg, formatPeriod } from "../lib/format.js";
import { findDocument } from "../lib/verdana.js";

function methodName(programme, methodologyId) {
  return programme.methodologies.find((m) => m.id === methodologyId)?.name.split(" ")[0] ?? "unknown";
}

/** Drop a document to check that it is exactly the one recorded on-chain. */
function DocumentCheck({ programme }) {
  const [hash, setHash] = useState(null);
  const matches = hash ? findDocument(programme, hash) : [];

  return (
    <Card
      title="Check a document against the blockchain"
      subtitle="Drop an MRV report or a consent record. Your browser computes its SHA-256 and compares it with the fingerprints stored on-chain. The file is not uploaded anywhere."
    >
      <FileHashInput label="Document" hint="e.g. samples/mrv-reports/farm-1-2026Q3.json" value={hash} onChange={setHash} testId="doc-check-input" />
      {hash && matches.length > 0 && (
        <div className="verify-result verify-success" data-testid="doc-check-result">
          <CheckCircleIcon className="verify-icon" aria-hidden="true" />
          <div>
            <h3 className="verify-title">Document matches the on-chain record</h3>
            {matches.map((m) =>
              m.kind === "mrv" ? (
                <p key={`r${m.reading.id}`} className="verify-message">
                  MRV report #{m.reading.id.toString()} for farm #{m.reading.farmId.toString()} ({m.farm?.region}),{" "}
                  {formatPeriod(m.reading.period)}: {formatKg(m.reading.netKg)} net, status <strong>{m.reading.status}</strong>.
                </p>
              ) : (
                <p key={`f${m.farm.id}`} className="verify-message">
                  Land-rights and consent record of farm #{m.farm.id.toString()} ({m.farm.region}), registered{" "}
                  {formatDate(m.farm.registeredAt)}.
                </p>
              )
            )}
          </div>
        </div>
      )}
      {hash && matches.length === 0 && (
        <div className="verify-result verify-danger" data-testid="doc-check-result">
          <WarningIcon className="verify-icon" aria-hidden="true" />
          <div>
            <h3 className="verify-title">No matching record</h3>
            <p className="verify-message">
              This file's fingerprint is not recorded by Verdana. It is either a different document, or a copy that has been
              altered (changing even one character changes the SHA-256).
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

export function Farms() {
  const { programme, loading } = useProgramme();
  if (!programme) return loading ? <p className="muted">Loading the programme...</p> : null;

  const { farms, readings } = programme;
  return (
    <div className="stack-lg">
      <header className="page-header">
        <h1>Farms &amp; MRV reports</h1>
        <p className="lead">
          Every enrolled farm and every measurement, reporting and verification (MRV) report, read from the registry
          contract. Locations are stored as a hash of a coarse grid cell, never as exact coordinates.
        </p>
      </header>

      <Card title={`Enrolled farms (${farms.length})`}>
        <div className="table-wrap">
          <table className="table" data-testid="farms-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Region</th>
                <th className="num">Area</th>
                <th>Farmer</th>
                <th className="num">Net verified</th>
                <th className="num">Reversed</th>
                <th>Consent record</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {farms.length === 0 && <EmptyRow colSpan={8}>No farms yet. A field agent registers them in the Verifier Console.</EmptyRow>}
              {farms.map((f) => (
                <tr key={f.id.toString()}>
                  <td>{f.id.toString()}</td>
                  <td>{f.region}</td>
                  <td className="num">{formatHectares(f.areaX100)}</td>
                  <td>
                    <Addr address={f.farmer} />
                  </td>
                  <td className="num">{formatKg(f.issuedKg)}</td>
                  <td className="num">{formatKg(f.reversedKg)}</td>
                  <td>
                    <Hash value={f.landRecordHash} />
                  </td>
                  <td>
                    <StatusBadge status={f.active ? "Active" : "Inactive"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={`MRV reports (${readings.length})`}
        subtitle="Net = (gross - baseline) minus the methodology's leakage deduction. Credits exist only once a second verifier approves."
      >
        <div className="table-wrap">
          <table className="table" data-testid="readings-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Farm</th>
                <th>Period</th>
                <th>Method</th>
                <th className="num">Gross</th>
                <th className="num">Baseline</th>
                <th className="num">Net</th>
                <th>Submitted by</th>
                <th>Reviewed by</th>
                <th>Evidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {readings.length === 0 && <EmptyRow colSpan={11}>No reports yet.</EmptyRow>}
              {readings.map((r) => (
                <tr key={r.id.toString()}>
                  <td>{r.id.toString()}</td>
                  <td>#{r.farmId.toString()}</td>
                  <td>{formatPeriod(r.period)}</td>
                  <td>{methodName(programme, r.methodologyId)}</td>
                  <td className="num">{formatKg(r.grossKg)}</td>
                  <td className="num">{formatKg(r.baselineKg)}</td>
                  <td className="num">
                    <strong>{formatKg(r.netKg)}</strong>
                  </td>
                  <td>
                    <Addr address={r.submittedBy} />
                  </td>
                  <td>{r.reviewedBy !== "0x0000000000000000000000000000000000000000" ? <Addr address={r.reviewedBy} /> : <span className="muted">-</span>}</td>
                  <td>
                    <Hash value={r.evidenceHash} />
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <DocumentCheck programme={programme} />

      <Alert tone="info" title="Methodologies in use">
        {programme.methodologies.map((m) => (
          <span key={m.id} className="block">
            {m.name}: leakage deduction {m.leakageBps / 100}% {m.active ? "" : "(suspended)"}
          </span>
        ))}
      </Alert>
    </div>
  );
}
