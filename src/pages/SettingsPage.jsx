import React, { useEffect, useRef, useState } from "react";
import Modal from "../components/Modal";
import PageHeader from "../components/ui/PageHeader";
import SectionHeader from "../components/ui/SectionHeader";
import SurfaceCard from "../components/ui/SurfaceCard";
import InsightCard from "../components/ui/InsightCard";
import Icon from "../components/ui/Icons";
import { MenuRow, TransactionRow } from "../components/ui/Rows";
import { routeHref } from "../lib/hashRouter";
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
  onSignOut,
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
      const link = document.createElement("a");
      link.href = url;
      link.download = `budgetcommand-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      onToast("Data export ready.");
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
      onToast("Legacy snapshot imported.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to import legacy snapshot.", "error");
    }
  }

  async function runRecurringMigration() {
    try {
      await importExistingBillsAsRecurringTemplates(uid, selectedMonth);
      onToast("Imported existing bills as recurring templates.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to import recurring templates.", "error");
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
      onToast("Bank account linked and synced.");
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
      <PageHeader
        eyebrow="More"
        title="Manage the workspace"
        subtitle="Profile, linked accounts, settings, and premium-style controls."
        left={<div className="iconButton"><Icon name="more" size={18} /></div>}
        right={<a href={routeHref("dashboard")} className="iconButton" aria-label="Back to dashboard"><Icon name="dashboard" size={18} /></a>}
      />

      <InsightCard
        icon="crown"
        tone="accent"
        eyebrow="BudgetCommand Plus"
        title="Command your money with fewer loose ends"
        body="Review linked account health, recurring automation, and premium-style insights from one More tab."
        action={<a href={routeHref("bills-income")} className="pillButton">Review recurring</a>}
      />

      <SurfaceCard>
        <SectionHeader eyebrow="Profile" title="Your workspace" subtitle="Quick entry points for the areas people expect under More." />
        <div className="menuList">
          <MenuRow icon="user" title="Profile" subtitle="Private Firebase-authenticated workspace" actionLabel="Connected" onClick={persistSettings} />
          <MenuRow icon="budget" title="Manage Budget" subtitle="Open spending plans and budget health" href={routeHref("budget")} />
          <MenuRow icon="tag" title="Categories, Tags & Rules" subtitle="Category overrides live on transactions today" href={routeHref("transactions")} />
          <MenuRow icon="link" title="Linked Accounts" subtitle="Plaid institutions, account health, and sync status" onClick={handleSyncAll} actionLabel={plaidItems.length ? `${plaidItems.length} linked` : "None"} />
          <MenuRow icon="bell" title="Notifications & Alerts" subtitle="Utilization threshold and finance nudges" onClick={persistSettings} />
          <MenuRow icon="palette" title="App Appearance" subtitle="Dark mode is the default command center look" onClick={persistSettings} />
          <MenuRow icon="crown" title="Premium Membership" subtitle="Actionable cards and command-center workflows" onClick={persistSettings} />
          <MenuRow icon="help" title="Help & Privacy" subtitle="Export, import, or keep your data close" onClick={exportJson} />
          <MenuRow icon="card" title="Credit Cards" subtitle="Manage revolving balances and utilization" href={routeHref("credit-cards")} />
          <MenuRow icon="budget" title="Loans" subtitle="Track balances and monthly obligations" href={routeHref("loans")} />
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader
          eyebrow="Linked Accounts"
          title="Bank connections"
          subtitle="Grouped account health with one-tap sync actions."
          action={
            <div className="row">
              <button type="button" className="pillButton" onClick={handleLinkAccount} disabled={plaidLoading}>
                <Icon name="link" size={16} />
                Link
              </button>
              <button type="button" className="pillButton" onClick={handleSyncAll} disabled={plaidLoading || plaidItems.length === 0}>
                <Icon name="sync" size={16} />
                Sync
              </button>
            </div>
          }
        />
        {plaidMessage ? <div className="sectionSubtitle" style={{ marginBottom: 14 }}>{plaidMessage}</div> : null}
        {plaidSyncState ? (
          <div className="summaryGrid three" style={{ marginBottom: 16 }}>
            <div className="summaryCell"><span className="dataLabel">Status</span><strong>{plaidSyncState.syncStatus || "idle"}</strong></div>
            <div className="summaryCell"><span className="dataLabel">Last sync</span><strong>{plaidSyncState.lastGlobalSyncAt || "-"}</strong></div>
            <div className="summaryCell"><span className="dataLabel">Transactions</span><strong>{plaidSyncState.transactionCount || 0}</strong></div>
          </div>
        ) : null}
        {plaidSyncState?.lastError ? <div className="errorText" style={{ marginBottom: 12 }}>{plaidSyncState.lastError}</div> : null}
        <div className="stackedList">
          {linkedAccounts.length === 0 ? (
            <div className="sectionSubtitle">Linked accounts will appear here after sync.</div>
          ) : (
            linkedAccounts.map((account) => (
              <TransactionRow
                key={account.accountId || account.id}
                name={`${account.institutionName ? `${account.institutionName} • ` : ""}${account.name}`}
                subtitle={`${account.type || "-"}${account.mask ? ` • ${account.mask}` : ""}`}
                amount={formatCurrency(account.currentBalance ?? account.availableBalance ?? 0, cfg.currency)}
                amountTone={(account.currentBalance ?? account.availableBalance ?? 0) < 0 ? "negative" : "positive"}
                icon="wallet"
              />
            ))
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader eyebrow="Preferences" title="App settings" subtitle="Keep the real controls available inside the new More page." />
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
            <select value={localSettings.currency} onChange={(e) => setLocalSettings({ ...localSettings, currency: e.target.value })}>
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
        <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
          <button type="button" className="primary" onClick={persistSettings}>Save Settings</button>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader eyebrow="Manual Accounts" title="Editable account cards" subtitle="Touch-friendly rows for your manual balances." action={<button type="button" className="pillButton" onClick={startAddAccount}>Add account</button>} />
        <div className="stackedList">
          {accounts.length === 0 ? (
            <div className="sectionSubtitle">No manual accounts yet.</div>
          ) : (
            accounts.map((account) => (
              <TransactionRow
                key={account.id}
                name={account.name}
                subtitle={account.type}
                amount={formatCurrency(account.balance, cfg.currency)}
                amountTone={safeNumber(account.balance, 0) < 0 ? "negative" : "positive"}
                icon="wallet"
                action={
                  <button type="button" className="iconButton" onClick={() => startEditAccount(account)} aria-label="Edit account">
                    <Icon name="dots" size={16} />
                  </button>
                }
              />
            ))
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader eyebrow="Tools" title="Data tools" subtitle="Export, import, or run migrations without leaving the app." />
        <div className="menuList">
          <MenuRow icon="sync" title="Import existing bills as recurring templates" subtitle="Move historical bills into recurring setup" onClick={runRecurringMigration} />
          <MenuRow icon="sync" title="Import legacy snapshot" subtitle="Idempotent legacy import from prior data" onClick={runLegacyImport} />
          <MenuRow icon="help" title="Export data (JSON)" subtitle="Download a full local snapshot" onClick={exportJson} />
          <MenuRow icon="help" title="Import data (JSON)" subtitle="Restore data from a previous export" onClick={() => fileRef.current?.click()} />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = "";
          }}
        />
      </SurfaceCard>

      <div style={{ paddingBottom: 10 }}>
        <button type="button" className="ghostButton" style={{ width: "100%" }} onClick={onSignOut}>
          <Icon name="logout" size={16} />
          Log Out
        </button>
      </div>

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
        <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
          {editingId ? (
            <button type="button" onClick={() => removeAccount(editingId)}>Delete</button>
          ) : <span />}
          <button type="button" className="primary" onClick={saveAccount}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
