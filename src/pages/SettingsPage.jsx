import React, { useEffect, useRef, useState } from "react";
import Modal from "../components/Modal";
import {
  deleteEntity,
  exportAllUserData,
  importAllUserData,
  importExistingBillsAsRecurringTemplates,
  importLegacySnapshot,
  saveSettings,
  upsertEntity,
} from "../lib/db";
import { DEFAULT_SETTINGS, formatCurrency, safeNumber } from "../lib/finance";
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  openPlaidLink,
  syncPlaidAccounts,
  syncPlaidTransactions,
} from "../lib/plaid";

const EMPTY_ACCOUNT = {
  name: "",
  type: "checking",
  balance: 0,
};

export default function SettingsPage({
  uid,
  settings,
  accounts,
  linkedAccounts = [],
  plaidItems = [],
  plaidSyncState = null,
  onToast,
  onError,
  selectedMonth,
}) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [localSettings, setLocalSettings] = useState(cfg);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT);
  const [editingId, setEditingId] = useState(null);
  const [plaidLoading, setPlaidLoading] = useState(false);
  const [plaidMessage, setPlaidMessage] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    setLocalSettings(cfg);
  }, [cfg.currency, cfg.monthStartDay, cfg.recommendedPaymentRate, cfg.utilizationThreshold]);

  async function persistSettings() {
    try {
      await saveSettings(uid, {
        utilizationThreshold: safeNumber(localSettings.utilizationThreshold, 30),
        currency: localSettings.currency || "USD",
        monthStartDay: Math.max(1, Math.min(31, safeNumber(localSettings.monthStartDay, 1))),
        recommendedPaymentRate: safeNumber(localSettings.recommendedPaymentRate, 0.03),
      });
      onToast("Settings saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save settings.", "error");
    }
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
    try {
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

  async function exportJson() {
    try {
      const payload = await exportAllUserData(uid);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `budgetcommand-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to export data.", "error");
    }
  }

  async function handleImportFile(file) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await importAllUserData(uid, payload);
      onToast("JSON import complete.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to import JSON data.", "error");
    }
  }

  async function runLegacyImport() {
    try {
      await importLegacySnapshot(uid);
      onToast("Legacy snapshot imported (idempotent).");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to import legacy snapshot.", "error");
    }
  }

  async function runRecurringMigration() {
    try {
      await importExistingBillsAsRecurringTemplates(uid, selectedMonth);
      onToast("Imported existing bills/income into recurring templates.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to import existing data as recurring templates.", "error");
    }
  }

  async function handleLinkAccount() {
    setPlaidLoading(true);
    setPlaidMessage("Creating secure Plaid link session...");
    try {
      const { linkToken } = await createPlaidLinkToken();
      const { publicToken, metadata } = await openPlaidLink(linkToken);
      setPlaidMessage("Exchanging token and running first sync...");
      await exchangePlaidPublicToken(publicToken, metadata);
      onToast("Bank account linked and initial sync completed.");
      setPlaidMessage("Linked account successfully.");
    } catch (error) {
      setPlaidMessage("");
      onError?.(error?.message || String(error));
      onToast("Failed to link bank account.", "error");
    } finally {
      setPlaidLoading(false);
    }
  }

  async function handleSyncAll() {
    setPlaidLoading(true);
    setPlaidMessage("Syncing linked accounts and transactions...");
    try {
      for (const item of plaidItems) {
        await syncPlaidAccounts(item.plaidItemId || item.itemId);
      }
      await syncPlaidTransactions();
      onToast("Plaid data synced.");
      setPlaidMessage("Sync complete.");
    } catch (error) {
      setPlaidMessage("");
      onError?.(error?.message || String(error));
      onToast("Failed to sync Plaid data.", "error");
    } finally {
      setPlaidLoading(false);
    }
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
          <div>
            <h3>Linked Bank Accounts</h3>
            <div className="muted pageIntro">
              Connect accounts with Plaid to sync balances, transactions, and recurring-payment candidates.
            </div>
          </div>
          <div className="spacer" />
          <button type="button" className="primary" onClick={handleLinkAccount} disabled={plaidLoading}>
            Link Bank Account
          </button>
          <button type="button" onClick={handleSyncAll} disabled={plaidLoading || plaidItems.length === 0}>
            Sync Linked Data
          </button>
        </div>
        {plaidMessage ? <div className="muted">{plaidMessage}</div> : null}
        {plaidSyncState ? (
          <div className="row" style={{ marginTop: 8 }}>
            <div className="card section">
              <strong>Status:</strong> {plaidSyncState.syncStatus || "idle"}
            </div>
            <div className="card section">
              <strong>Last sync:</strong> {plaidSyncState.lastGlobalSyncAt || "-"}
            </div>
            <div className="card section">
              <strong>Transactions:</strong> {plaidSyncState.transactionCount || 0}
            </div>
          </div>
        ) : null}
        {plaidSyncState?.lastError ? <div className="errorText">{plaidSyncState.lastError}</div> : null}

        <div className="twoCol">
          <div className="card section">
            <h4>Linked Institutions</h4>
            {plaidItems.length === 0 ? <div className="muted">No Plaid items linked yet.</div> : null}
            <ul className="cleanList">
              {plaidItems.map((item) => (
                <li key={item.plaidItemId || item.itemId} className="listRow compactTriplet">
                  <span>{item.institutionName || "Linked institution"}</span>
                  <span>{item.status || "linked"}</span>
                  <strong>{item.lastSyncAt ? new Date(item.lastSyncAt).toLocaleDateString() : "-"}</strong>
                </li>
              ))}
            </ul>
          </div>

          <div className="card section">
            <h4>Synced Accounts</h4>
            {linkedAccounts.length === 0 ? <div className="muted">Linked accounts will appear here after sync.</div> : null}
            <ul className="cleanList">
              {linkedAccounts.map((account) => (
                <li key={account.accountId || account.id} className="listRow compactTriplet">
                  <span>
                    {account.institutionName ? `${account.institutionName}: ` : ""}
                    {account.name}
                    {account.mask ? ` •${account.mask}` : ""}
                  </span>
                  <span>{account.type || "-"}</span>
                  <strong>{formatCurrency(account.currentBalance ?? account.availableBalance ?? 0, cfg.currency)}</strong>
                </li>
              ))}
            </ul>
          </div>
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
          <button type="button" onClick={runRecurringMigration}>Import existing bills as recurring templates</button>
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
                handleImportFile(file);
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
