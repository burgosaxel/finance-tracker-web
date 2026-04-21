import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";
import { deleteEntity, upsertEntity } from "../lib/db";
import { DEFAULT_SETTINGS, formatCurrency, safeNumber } from "../lib/finance";
import { buildAccountDirectory } from "../lib/planner";

const EMPTY_ACCOUNT = {
  name: "",
  type: "checking",
  balance: 0,
  institutionName: "",
  linkedAccountId: "",
};

export default function AccountsPage({
  uid,
  settings,
  accounts,
  linkedAccounts,
  onToast,
  onError,
}) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_ACCOUNT);

  const manualAccounts = useMemo(
    () => [...(accounts || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [accounts]
  );

  const combinedAccounts = useMemo(
    () => buildAccountDirectory(accounts, linkedAccounts),
    [accounts, linkedAccounts]
  );

  const linkedOptions = useMemo(
    () =>
      [...(linkedAccounts || [])]
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [linkedAccounts]
  );

  const effectiveManualAccounts = useMemo(() => {
    const combinedById = new Map(combinedAccounts.map((account) => [account.id, account]));
    return manualAccounts.map((account) => ({
      ...account,
      effective: combinedById.get(account.id) || account,
    }));
  }, [combinedAccounts, manualAccounts]);

  function startAdd() {
    setEditingId(null);
    setForm(EMPTY_ACCOUNT);
    setOpen(true);
  }

  function startEdit(account) {
    setEditingId(account.id);
    setForm({
      ...EMPTY_ACCOUNT,
      id: account.id,
      name: account.name || "",
      type: account.type || "checking",
      balance: account.balance ?? 0,
      institutionName: account.institutionName || "",
      linkedAccountId: account.linkedAccountId || "",
    });
    setOpen(true);
  }

  async function saveAccount() {
    if (!form.name.trim()) return;
    try {
      await upsertEntity(
        uid,
        "accounts",
        {
          name: form.name.trim(),
          type: form.type || "checking",
          balance: safeNumber(form.balance, 0),
          institutionName: form.institutionName || "",
          linkedAccountId: form.linkedAccountId || "",
        },
        editingId || undefined
      );
      setOpen(false);
      onToast("Account saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save account.", "error");
    }
  }

  async function removeAccount(id) {
    try {
      await deleteEntity(uid, "accounts", id);
      onToast("Account deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete account.", "error");
    }
  }

  return (
    <div className="page">
      <section className="card section">
        <div className="row">
          <div>
            <h2>Accounts</h2>
            <div className="muted pageIntro">
              Manual accounts own bill assignments. Linking one to a live connected account makes the manual account inherit the linked name, type, institution, and balances.
            </div>
          </div>
          <div className="spacer" />
          <button type="button" className="primary" onClick={startAdd}>Add account</button>
        </div>
      </section>

      <section className="card section">
        <h3>Planner account view</h3>
        <div className="summaryGrid three plannerSummaryGrid accountsOverviewGrid">
          {combinedAccounts.map((account) => (
            <div key={account.id} className="summaryCell compact">
              <span className="dataLabel">{account.name}</span>
              <strong>{formatCurrency(account.balance, cfg.currency)}</strong>
              <span className="muted compactSubtext">
                {account.institutionName || account.type}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card section">
        <h3>Manual account assignments</h3>
        <div className="plannerTableWrap desktopDataTable">
          <table className="plannerTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Linked account</th>
                <th>Type</th>
                <th>Balance</th>
                <th>Institution</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {effectiveManualAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">No manual accounts yet.</td>
                </tr>
              ) : null}
              {effectiveManualAccounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <div className="plannerBillTitle">{account.effective.name || account.name}</div>
                    {account.linkedAccountId ? (
                      <div className="muted compactSubtext">Manual alias: {account.name}</div>
                    ) : null}
                  </td>
                  <td>{account.effective.linkedName || "-"}</td>
                  <td>{account.effective.type}</td>
                  <td>{formatCurrency(account.effective.balance, cfg.currency)}</td>
                  <td>{account.effective.institutionName || "-"}</td>
                  <td>
                    <div className="row plannerRowActions">
                      <button type="button" onClick={() => startEdit(account)}>Edit</button>
                      <button type="button" onClick={() => removeAccount(account.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mobileDataList">
          {effectiveManualAccounts.length === 0 ? <div className="card section muted">No manual accounts yet.</div> : null}
          {effectiveManualAccounts.map((account) => (
            <article key={`mobile-manual-account-${account.id}`} className="card section dataItem">
              <div className="dataItemHeader">
                <div>
                  <h3 className="dataItemTitle">{account.effective.name || account.name}</h3>
                  <div className="muted compactSubtext">{account.linkedAccountId ? `Manual alias: ${account.name}` : "Manual account"}</div>
                </div>
                <span className="pill">{account.effective.type || "other"}</span>
              </div>

              <div className="summaryGrid two">
                <div className="summaryCell compact">
                  <span className="dataLabel">Linked account</span>
                  <strong>{account.effective.linkedName || "-"}</strong>
                </div>
                <div className="summaryCell compact">
                  <span className="dataLabel">Balance</span>
                  <strong>{formatCurrency(account.effective.balance, cfg.currency)}</strong>
                </div>
                <div className="summaryCell compact">
                  <span className="dataLabel">Institution</span>
                  <strong>{account.effective.institutionName || "-"}</strong>
                </div>
                <div className="summaryCell compact">
                  <span className="dataLabel">Type</span>
                  <strong>{account.effective.type}</strong>
                </div>
              </div>

              <div className="row dataActions" style={{ marginTop: 10 }}>
                <button type="button" onClick={() => startEdit(account)}>Edit</button>
                <button type="button" onClick={() => removeAccount(account.id)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card section">
        <h3>Linked accounts</h3>
        <div className="plannerTableWrap desktopDataTable">
          <table className="plannerTable">
            <thead>
              <tr>
                <th>Institution</th>
                <th>Account</th>
                <th>Type</th>
                <th>Current balance</th>
              </tr>
            </thead>
            <tbody>
              {linkedAccounts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">No linked accounts yet.</td>
                </tr>
              ) : null}
              {linkedAccounts.map((account) => (
                <tr key={account.accountId || account.id}>
                  <td>{account.institutionName || "-"}</td>
                  <td>{account.name}</td>
                  <td>{account.subtype || account.type || "-"}</td>
                  <td>{formatCurrency(account.currentBalance ?? account.availableBalance ?? 0, cfg.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mobileDataList">
          {linkedAccounts.length === 0 ? <div className="card section muted">No linked accounts yet.</div> : null}
          {linkedAccounts.map((account) => (
            <article key={`mobile-linked-account-${account.accountId || account.id}`} className="card section dataItem">
              <div className="dataItemHeader">
                <div>
                  <h3 className="dataItemTitle">{account.name}</h3>
                  <div className="muted compactSubtext">{account.institutionName || "-"}</div>
                </div>
                <span className="pill">{account.subtype || account.type || "-"}</span>
              </div>

              <div className="summaryGrid two">
                <div className="summaryCell compact">
                  <span className="dataLabel">Institution</span>
                  <strong>{account.institutionName || "-"}</strong>
                </div>
                <div className="summaryCell compact">
                  <span className="dataLabel">Current balance</span>
                  <strong>{formatCurrency(account.currentBalance ?? account.availableBalance ?? 0, cfg.currency)}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Modal title={editingId ? "Edit account" : "Add account"} open={open} onClose={() => setOpen(false)}>
        <div className="formGrid">
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}>
              <option value="checking">checking</option>
              <option value="savings">savings</option>
              <option value="cash">cash</option>
              <option value="other">other</option>
            </select>
          </label>
          <label>
            Balance
            <input type="number" value={form.balance} onChange={(e) => setForm((prev) => ({ ...prev, balance: e.target.value }))} />
          </label>
          <label>
            Institution
            <input
              value={form.institutionName || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, institutionName: e.target.value }))}
            />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Linked account
            <select
              value={form.linkedAccountId || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, linkedAccountId: e.target.value }))}
            >
              <option value="">No linked account</option>
              {linkedOptions.map((account) => {
                const linkedId = account.accountId || account.id;
                return (
                  <option key={linkedId} value={linkedId}>
                    {account.name} {account.institutionName ? `(${account.institutionName})` : ""}
                  </option>
                );
              })}
            </select>
          </label>
          {form.linkedAccountId ? (
            <div className="muted compactSubtext" style={{ gridColumn: "1 / -1" }}>
              Linked account data overrides the manual account's displayed name, type, institution, and balance in the planner.
            </div>
          ) : null}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveAccount}>Save account</button>
        </div>
      </Modal>
    </div>
  );
}
