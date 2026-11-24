import { useState } from "react";
import { isAddress } from "ethers";
import { useWallet } from "../wallet/WalletContext.jsx";
import { useProgramme } from "../wallet/ProgrammeContext.jsx";
import { useContracts } from "../wallet/useContracts.js";
import { useTx } from "../wallet/useTx.js";
import { Alert, Card } from "../components/ui.jsx";
import { TxStatus } from "../components/TxStatus.jsx";
import { Addr, Locked } from "../components/bits.jsx";
import { formatBps, formatKg } from "../lib/format.js";
import { methodologyId, ROLE_LABELS, ROLES } from "../lib/verdana.js";

export function Admin() {
  const { chainId } = useWallet();
  const { programme, me, loading } = useProgramme();
  const { canWrite } = useContracts();
  const roleTx = useTx();
  const methodTx = useTx();
  const pauseTx = useTx();
  const [roleForm, setRoleForm] = useState({ address: "", role: "verifier" });
  const [method, setMethod] = useState({ code: "", name: "", leakage: "10" });
  if (!programme) return loading ? <p className="muted">Loading the programme...</p> : null;
  const s = programme.settings;

  const changeRole = (grant) =>
    roleTx.run(
      async (c, send) =>
        send(`${grant ? "Grant" : "Revoke"} role`, () => (grant ? c.registry.grantRole : c.registry.revokeRole)(ROLES[roleForm.role], roleForm.address)),
      { title: grant ? "Role granted" : "Role revoked", message: `${ROLE_LABELS[roleForm.role]} ${grant ? "granted to" : "revoked from"} ${roleForm.address}. It takes effect immediately.` }
    );

  return (
    <div className="stack-lg">
      <header className="page-header">
        <h1>Programme admin</h1>
        <p className="lead">The programme operator manages who may act, which methodologies are approved, and the emergency pause. The admin cannot mint credits or touch anyone's funds.</p>
      </header>

      <Card title="Programme settings (read from the contracts)">
        <dl className="verify-details settings">
          <div>
            <dt>Plausibility cap</dt>
            <dd>{formatKg(s.maxKgPerHectarePerPeriod)} / ha / quarter</dd>
          </div>
          <div>
            <dt>Permanence buffer</dt>
            <dd>{formatBps(s.bufferBps)} of each issuance</dd>
          </div>
          <div>
            <dt>Farmer's share of sales</dt>
            <dd>{formatBps(s.farmerShareBps)} (fixed, minimum 70%)</dd>
          </div>
          <div>
            <dt>Programme fund</dt>
            <dd>
              <Addr address={s.programmeFund} />
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{s.paused ? "Paused" : "Running"}</dd>
          </div>
        </dl>
      </Card>

      {!canWrite ? (
        <Card className="card-locked">
          <Locked title="Connect the admin wallet">These actions need the programme admin role.</Locked>
        </Card>
      ) : (
        <>
          {!me?.roles.admin && (
            <Alert tone="warning" title="This wallet is not the programme admin">
              The contract will refuse these actions. You can try one to see the refusal.
            </Alert>
          )}
          <div className="grid-2 grid-even">
            <Card title="Grant or revoke a role" subtitle="Roles are checked by the contract on every action, and changes take effect immediately.">
              <div className="form">
                <label className="field">
                  <span>Wallet address</span>
                  <input className="input mono" value={roleForm.address} onChange={(e) => setRoleForm((f) => ({ ...f, address: e.target.value }))} placeholder="0x..." />
                </label>
                <label className="field">
                  <span>Role</span>
                  <select className="input" value={roleForm.role} onChange={(e) => setRoleForm((f) => ({ ...f, role: e.target.value }))}>
                    <option value="verifier">{ROLE_LABELS.verifier}</option>
                    <option value="registrar">{ROLE_LABELS.registrar}</option>
                  </select>
                </label>
                <div className="hero-actions">
                  <button className="btn btn-primary" disabled={!isAddress(roleForm.address) || roleTx.busy} onClick={() => changeRole(true)}>
                    Grant
                  </button>
                  <button className="btn btn-outline" disabled={!isAddress(roleForm.address) || roleTx.busy} onClick={() => changeRole(false)}>
                    Revoke
                  </button>
                </div>
              </div>
              <TxStatus state={roleTx.state} chainId={chainId} />
            </Card>

            <Card title="Approve a methodology" subtitle="Reports can only use approved methodologies. Leakage is capped at 50%.">
              <div className="form">
                <div className="form-row">
                  <label className="field">
                    <span>Code</span>
                    <input className="input" value={method.code} onChange={(e) => setMethod((m) => ({ ...m, code: e.target.value }))} placeholder="VDN-AGF-02" />
                  </label>
                  <label className="field">
                    <span>Leakage (%)</span>
                    <input className="input" type="number" min="0" max="50" value={method.leakage} onChange={(e) => setMethod((m) => ({ ...m, leakage: e.target.value }))} />
                  </label>
                </div>
                <label className="field">
                  <span>Name and version</span>
                  <input className="input" value={method.name} onChange={(e) => setMethod((m) => ({ ...m, name: e.target.value }))} placeholder="VDN-AGF-02 Woodlot restoration (demo)" />
                </label>
                <button
                  className="btn btn-primary"
                  disabled={!method.code.trim() || !method.name.trim() || methodTx.busy}
                  onClick={() =>
                    methodTx.run(
                      async (c, send) => send("Add methodology", () => c.registry.addMethodology(methodologyId(method.code), method.name.trim(), Math.round(Number(method.leakage) * 100))),
                      { title: "Methodology approved", message: `${method.name} can now be used in MRV reports.` }
                    )
                  }
                >
                  Approve methodology
                </button>
              </div>
              <TxStatus state={methodTx.state} chainId={chainId} />
            </Card>
          </div>

          <Card title="Emergency pause" subtitle="Stops registrations, reports and approvals. Sales, withdrawals and retirements keep working, so nobody's money is ever frozen.">
            <button
              className={`btn ${s.paused ? "btn-primary" : "btn-outline"}`}
              disabled={pauseTx.busy}
              onClick={() =>
                pauseTx.run(async (c, send) => send(s.paused ? "Unpause" : "Pause", () => (s.paused ? c.registry.unpause() : c.registry.pause())), {
                  title: s.paused ? "Programme resumed" : "Programme paused",
                })
              }
            >
              {s.paused ? "Unpause the programme" : "Pause the programme"}
            </button>
            <TxStatus state={pauseTx.state} chainId={chainId} />
          </Card>
        </>
      )}
    </div>
  );
}
