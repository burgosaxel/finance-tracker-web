import React, { useRef, useState } from "react";
import Modal from "../components/Modal";
import {
  deleteEntity,
  exportAllUserData,
  importAllUserData,
  importLegacySnapshot,
  saveSettings,
  upsertEntity,
} from "../lib/db";
import { DEFAULT_SETTINGS, safeNumber } from "../lib/finance";

const EMPTY_ACCOUNT = {
  name: "",
  type: "checking",
  balance: 0,
};

export default function SettingsPage({ uid, settings, accounts, onToast }) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [localSettings, setLocalSettings] = useState(cfg);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT);
  const [editingId, setEditingId] = useState(null);
  const fileRef = useRef(null);

  async function persistSettings() {
    await saveSettings(uid, {
      utilizationThreshold: safeNumber(localSettings.utilizationThreshold, 30),
      currency: localSettings.currency || "USD",
      monthStartDay: Math.max(1, Math.min(31, safeNumber(localSettings.monthStartDay, 1))),
      recommendedPaymentRate: safeNumber(localSettings.recommendedPaymentRate, 0.03),
    });
    onToast("Settings saved.");
  }

  function startAddAccount() {
    setEditingId(null);
    setAccountForm(EMPTY_ACCOUNT);
    setAccountOpen(true);
  }

  function startEditAccount(account) {
    setEditingId(account.id);
    setAccountForm({ ...EMPTY_ACCOUNT, ...account });
    setAccountOpen(true);
  }

  async function saveAccount() {
    if (!accountForm.name.trim()) return;
    await upsertEntity(
      uid,
      "accounts",
      {
        ...accountForm,
        name: accountForm.name.trim(),
        balance: safeNumber(accountForm.balance, 0),
      },
      editingId || undefined
    );
    setAccountOpen(false);
    onToast("Account saved.");
  }

  async function removeAccount(id) {
    await deleteEntity(uid, "accounts", id);
    onToast("Account deleted.");
  }

  async function exportJson() {
    const payload = await exportAllUserData(uid);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file) {
    const text = await file.text();
    const payload = JSON.parse(text);
    await importAllUserData(uid, payload);
    onToast("JSON import complete.");
  }

  async function runLegacyImport() {
    await importLegacySnapshot(uid);
    onToast("Legacy snapshot imported (idempotent).");
  }

  return (
    <div className="page">
      <h2>Settings</h2>

      <section className="card section">
        <h3>App Preferences</h3>
        <div className="formGrid">
          <label>
            Utilization Threshold (%)
            <input
              type="number"
              value={localSettings.utilizationThreshold}
              onChange={(e) => setLocalSettings({ ...localSettings, utilizationThreshold: e.target.value })}
            />
          </label>
          <label>
            Currency
            <select
              value={localSettings.currency}
              onChange={(e) => setLocalSettings({ ...localSettings, currency: e.target.value })}
            >
              <option value="USD">USD</option>
            </select>
          </label>
          <label>
            Month Start Day
            <input
              type="number"
              min="1"
              max="31"
              value={localSettings.monthStartDay}
              onChange={(e) => setLocalSettings({ ...localSettings, monthStartDay: e.target.value })}
            />
          </label>
          <label>
            Recommended Credit Card Payment Rate
            <input
              type="number"
              step="0.01"
              value={localSettings.recommendedPaymentRate}
              onChange={(e) => setLocalSettings({ ...localSettings, recommendedPaymentRate: e.target.value })}
            />
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="primary" onClick={persistSettings}>Save Settings</button>
        </div>
      </section>

      <section className="card section">
        <div className="row">
          <h3>Accounts</h3>
          <div className="spacer" />
          <button type="button" className="primary" onClick={startAddAccount}>Add Account</button>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr><td colSpan={4} className="muted">No accounts yet.</td></tr>
              ) : null}
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.type}</td>
                  <td>{a.balance}</td>
                  <td className="row">
                    <button type="button" onClick={() => startEditAccount(a)}>Edit</button>
                    <button type="button" onClick={() => removeAccount(a.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card section">
        <h3>Data Tools</h3>
        <div className="row">
          <button type="button" onClick={runLegacyImport}>Import legacy snapshot</button>
          <button type="button" onClick={exportJson}>Export data (JSON)</button>
          <button type="button" onClick={() => fileRef.current?.click()}>Import data (JSON)</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleImportFile(file).catch((err) => onToast(err.message || String(err), "error"));
              }
              e.target.value = "";
            }}
          />
        </div>
      </section>

      <Modal title={editingId ? "Edit Account" : "Add Account"} open={accountOpen} onClose={() => setAccountOpen(false)}>
        <div className="formGrid">
          <label>Name<input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} /></label>
          <label>
            Type
            <select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}>
              <option value="checking">checking</option>
              <option value="savings">savings</option>
              <option value="cash">cash</option>
              <option value="other">other</option>
            </select>
          </label>
          <label>Balance<input type="number" value={accountForm.balance} onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveAccount}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
