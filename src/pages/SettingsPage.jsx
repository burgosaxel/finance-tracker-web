import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../components/Modal";
import ActionMenu from "../components/ActionMenu";
import {
  createManualItem,
  deleteEntity,
  exportAllUserData,
  importAllUserData,
  importExistingBillsAsRecurringTemplates,
  importLegacySnapshot,
  linkRecurringPayment,
  saveSettings,
  unlinkRecurringPayment,
  updateRecurringPaymentStatus,
  upsertEntity,
} from "../lib/db";
import { DEFAULT_SETTINGS, formatCurrency, getManualMatchCandidates, safeNumber } from "../lib/finance";
import {
  analyzeRecurringPayments,
  createLinkToken,
  exchangePublicToken,
  openPlaidLink,
  syncPlaidTransactions,
} from "../lib/plaid";

const EMPTY_ACCOUNT = {
  name: "",
  type: "checking",
  balance: 0,
};

const EMPTY_CREATE_ITEM = {
  manualType: "bill",
  name: "",
  amount: 0,
  dueDay: 1,
  payDay: 1,
};

export default function SettingsPage({
  uid,
  settings,
  accounts,
  linkedAccounts = [],
  plaidItems = [],
  plaidSyncState = null,
  recurringPayments = [],
  bills = [],
  income = [],
  loans = [],
  creditCards = [],
  onToast,
  onError,
  selectedMonth,
}) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [localSettings, setLocalSettings] = useState(cfg);
  const [preferencesCollapsed, setPreferencesCollapsed] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT);
  const [editingId, setEditingId] = useState(null);
  const [plaidLoading, setPlaidLoading] = useState(false);
  const [plaidMessage, setPlaidMessage] = useState("");
  const [recurringLinkOpen, setRecurringLinkOpen] = useState(false);
  const [selectedRecurring, setSelectedRecurring] = useState(null);
  const [selectedRecurringTarget, setSelectedRecurringTarget] = useState("");
  const [recurringVisibleCount, setRecurringVisibleCount] = useState("20");
  const [createRecurringItemMode, setCreateRecurringItemMode] = useState(false);
  const [createRecurringItemForm, setCreateRecurringItemForm] = useState(EMPTY_CREATE_ITEM);
  const [accountPlaidLinkOpen, setAccountPlaidLinkOpen] = useState(false);
  const [selectedManualAccount, setSelectedManualAccount] = useState(null);
  const [selectedPlaidAccountId, setSelectedPlaidAccountId] = useState("");
  const fileRef = useRef(null);

  const recurringCandidates = useMemo(
    () =>
      getManualMatchCandidates({
        bills,
        income,
        loans,
        creditCards,
        selectedMonth,
      }),
    [bills, income, loans, creditCards, selectedMonth]
  );

  const recurringCandidateByKey = useMemo(() => {
    return recurringCandidates.reduce((map, candidate) => {
      map.set([candidate.manualType, candidate.manualId, candidate.monthId || ""].join("|"), candidate);
      return map;
    }, new Map());
  }, [recurringCandidates]);

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

  async function saveManualAccountPlaidLink() {
    if (!selectedManualAccount) return;
    try {
      await upsertEntity(
        uid,
        "accounts",
        {
          ...selectedManualAccount,
          plaidAccountId: selectedPlaidAccountId || "",
        },
        selectedManualAccount.id
      );
      onToast(selectedPlaidAccountId ? "Plaid account linked." : "Plaid account link removed.");
      setAccountPlaidLinkOpen(false);
      setSelectedManualAccount(null);
      setSelectedPlaidAccountId("");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to update Plaid account link.", "error");
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
      const { linkToken } = await createLinkToken();
      const { publicToken, metadata } = await openPlaidLink(linkToken);
      setPlaidMessage("Exchanging token securely...");
      const result = await exchangePublicToken(publicToken, metadata);
      const institution = result?.institutionName || metadata?.institution?.name || "Bank account";
      const accountMessage = result?.accountSync?.success
        ? `${result.accountSync.accountCount} account${result.accountSync.accountCount === 1 ? "" : "s"} synced`
        : `account sync failed: ${result?.accountSync?.error || "unknown error"}`;
      const transactionMessage = result?.transactionSync?.success
        ? `${result.transactionSync.added} added, ${result.transactionSync.modified} modified, ${result.transactionSync.removed} removed`
        : `transaction sync failed: ${result?.transactionSync?.error || "unknown error"}`;
      if (!result?.accountSync?.success || !result?.transactionSync?.success) {
        onToast("Bank account linked, but sync is incomplete.", "error");
        setPlaidMessage(`${institution} linked. ${accountMessage}. ${transactionMessage}.`);
      } else {
        onToast("Bank account connected successfully.");
        setPlaidMessage(
          `${institution} connected successfully. ${accountMessage}. ${transactionMessage}.`
        );
      }
    } catch (error) {
      setPlaidMessage("");
      onError?.(error?.message || String(error));
      onToast("Failed to link bank account.", "error");
    } finally {
      setPlaidLoading(false);
    }
  }

  async function handleManualSync() {
    setPlaidLoading(true);
    setPlaidMessage("Syncing linked accounts and transactions...");
    try {
      const result = await syncPlaidTransactions();
      const itemCount = result?.items?.length || 0;
      const transactionCount = result?.items?.reduce(
        (sum, item) => sum + Number(item.added || 0) + Number(item.modified || 0),
        0
      ) || 0;
      const removalCount = result?.items?.reduce((sum, item) => sum + Number(item.removed || 0), 0) || 0;
      onToast("Linked data synced.");
      setPlaidMessage(
        `Synced ${itemCount} linked item${itemCount === 1 ? "" : "s"} and processed ${transactionCount} transaction update${transactionCount === 1 ? "" : "s"} (${removalCount} removed).`
      );
    } catch (error) {
      setPlaidMessage("");
      onError?.(error?.message || String(error));
      onToast("Failed to sync linked data.", "error");
    } finally {
      setPlaidLoading(false);
    }
  }

  async function handleRecurringAnalysis() {
    setPlaidLoading(true);
    setPlaidMessage("Analyzing recurring transaction patterns...");
    try {
      const result = await analyzeRecurringPayments();
      onToast("Recurring analysis complete.");
      setPlaidMessage(
        `Detected ${result?.detectedCount || 0} recurring pattern${result?.detectedCount === 1 ? "" : "s"} across ${result?.recurringTransactionCount || 0} transaction${result?.recurringTransactionCount === 1 ? "" : "s"}.`
      );
    } catch (error) {
      setPlaidMessage("");
      onError?.(error?.message || String(error));
      onToast("Failed to analyze recurring payments.", "error");
    } finally {
      setPlaidLoading(false);
    }
  }

  const visibleRecurringPayments = useMemo(() => {
    const scoped = (recurringPayments || [])
      .filter((item) => item.status !== "ignored")
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    if (recurringVisibleCount === "all") return scoped;
    return scoped.slice(0, Number(recurringVisibleCount));
  }, [recurringPayments, recurringVisibleCount]);

  function openAccountPlaidLink(account) {
    setSelectedManualAccount(account);
    setSelectedPlaidAccountId(account.plaidAccountId || "");
    setAccountPlaidLinkOpen(true);
  }
  function openRecurringLink(recurringItem) {
    setSelectedRecurring(recurringItem);
    setSelectedRecurringTarget(
      recurringItem?.linkedManualType && recurringItem?.linkedManualId
        ? [recurringItem.linkedManualType, recurringItem.linkedManualId, recurringItem.linkedManualMonthId || ""].join("|")
        : ""
    );
    setCreateRecurringItemMode(false);
    setCreateRecurringItemForm({
      manualType: recurringItem?.typeGuess === "income" ? "income" : "bill",
      name: recurringItem?.displayName || recurringItem?.merchantName || recurringItem?.normalizedMerchant || "",
      amount: Math.abs(safeNumber(recurringItem?.averageAmount, 0)),
      dueDay: 1,
      payDay: 1,
    });
    setRecurringLinkOpen(true);
  }

  function closeRecurringLink() {
    setRecurringLinkOpen(false);
    setSelectedRecurring(null);
    setSelectedRecurringTarget("");
    setCreateRecurringItemMode(false);
  }

  async function confirmRecurring(recurringItem) {
    try {
      await updateRecurringPaymentStatus(uid, recurringItem.id || recurringItem.recurringId, "confirmed");
      onToast("Recurring item confirmed.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to confirm recurring item.", "error");
    }
  }

  async function ignoreRecurring(recurringItem) {
    try {
      await updateRecurringPaymentStatus(uid, recurringItem.id || recurringItem.recurringId, "ignored");
      onToast("Recurring item ignored.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to ignore recurring item.", "error");
    }
  }

  async function saveRecurringLink() {
    if (!selectedRecurring) return;
    try {
      if (createRecurringItemMode) {
        const created = await createManualItem(uid, {
          ...createRecurringItemForm,
          monthId: selectedMonth,
          amount: Math.abs(safeNumber(createRecurringItemForm.amount, 0)),
        });
        await linkRecurringPayment(uid, selectedRecurring, created);
      } else {
        const target = recurringCandidateByKey.get(selectedRecurringTarget);
        if (!target) return;
        await linkRecurringPayment(uid, selectedRecurring, target);
      }
      onToast("Recurring item linked.");
      closeRecurringLink();
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to link recurring item.", "error");
    }
  }

  async function removeRecurringLink(recurringItem) {
    try {
      await unlinkRecurringPayment(uid, recurringItem);
      onToast("Recurring link removed.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to unlink recurring item.", "error");
    }
  }

  function recurringManualLabel(item) {
    if (!item?.linkedManualType || !item?.linkedManualId) return "";
    const candidate = recurringCandidates.find(
      (entry) =>
        entry.manualType === item.linkedManualType
        && entry.manualId === item.linkedManualId
        && (entry.monthId || "") === (item.linkedManualMonthId || "")
    );
    return candidate?.label || "";
  }

  function recurringNextExpectedLabel(item) {
    const value = item?.nextExpectedDate;
    if (!value) return "-";
    if (value?.toDate) return value.toDate().toLocaleDateString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
  }

  return (
    <div className="page">
      <section className="dashboard-hero pageHero heroSettings">
        <div className="pageHeader">
          <div className="pageHeaderContent">
            <div className="pageEyebrow">Preferences and integrations</div>
            <h2>Settings</h2>
            <p className="muted pageIntro">
              Configure app defaults, manage linked accounts, review sync health, and control recurring detection from one place.
            </p>
          </div>
        </div>
      </section>

      <section className="data-panel section moduleSettings">
        <button type="button" className="collapseToggle" onClick={() => setPreferencesCollapsed((value) => !value)}>
          <span>App Preferences</span>
          <span className="muted">{preferencesCollapsed ? ">" : "v"}</span>
        </button>
        {!preferencesCollapsed ? (
          <>
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
          </>
        ) : null}
      </section>
      <section className="data-panel section moduleConnections">
        <div className="row">
          <div>
            <h3>Linked Bank Accounts</h3>
            <div className="muted pageIntro">
              Connect a bank account with Plaid, sync balances and transactions, and review linked account health.
            </div>
          </div>
          <div className="spacer" />
          <button
            type="button"
            onClick={handleManualSync}
            disabled={plaidLoading || plaidItems.length === 0}
          >
            Sync Linked Accounts
          </button>
          <button
            type="button"
            onClick={handleRecurringAnalysis}
            disabled={plaidLoading || linkedAccounts.length === 0}
          >
            Analyze Recurring
          </button>
          <button type="button" className="primary" onClick={handleLinkAccount} disabled={plaidLoading}>
            Connect Bank Account
          </button>
        </div>
        {plaidMessage ? <div className="muted">{plaidMessage}</div> : null}
        {plaidSyncState ? (
          <div className="statsGrid compactStats summaryStrip" style={{ marginTop: 8 }}>
            <div className="data-panel inlineMetric">
              <span className="dataLabel">Status</span>
              <strong>{plaidSyncState.syncStatus || "idle"}</strong>
            </div>
            <div className="data-panel inlineMetric">
              <span className="dataLabel">Last sync</span>
              <strong>{plaidSyncState.lastGlobalSyncAt || "-"}</strong>
            </div>
            <div className="data-panel inlineMetric">
              <span className="dataLabel">Accounts</span>
              <strong>{plaidSyncState.accountCount || 0}</strong>
            </div>
            <div className="data-panel inlineMetric">
              <span className="dataLabel">Transactions</span>
              <strong>{plaidSyncState.transactionCount || 0}</strong>
            </div>
          </div>
        ) : null}
        {plaidSyncState?.lastError ? <div className="errorText">{plaidSyncState.lastError}</div> : null}

        <div className="twoCol">
          <div className="data-panel">
            <h4>Linked Institutions</h4>
            {plaidItems.length === 0 ? <div className="muted">No Plaid items linked yet.</div> : null}
            <ul className="cleanList">
              {plaidItems.map((item) => (
                <li key={item.plaidItemId || item.itemId} className="listRow compactTriplet">
                  <span>{item.institutionName || item.institution || "Linked institution"}</span>
                  <span>{item.status || "linked"}</span>
                  <strong>{item.lastSyncAt ? new Date(item.lastSyncAt).toLocaleString() : item.linkedAt ? new Date(item.linkedAt).toLocaleDateString() : "-"}</strong>
                </li>
              ))}
            </ul>
          </div>

          <div className="data-panel">
            <h4>Linked Accounts</h4>
            {linkedAccounts.length === 0 ? <div className="muted">No synced linked accounts yet.</div> : null}
            <ul className="cleanList">
              {linkedAccounts.map((account) => (
                <li key={account.id || account.accountId} className="listRow compactTriplet">
                  <span>
                    {account.institutionName ? `${account.institutionName} - ` : ""}
                    {account.name}
                    {account.mask ? ` ****${account.mask}` : ""}
                  </span>
                  <span>{account.subtype || account.type || "account"}</span>
                  <strong>
                    {account.availableBalance === null || account.availableBalance === undefined
                      ? formatCurrency(account.currentBalance, localSettings.currency || "USD")
                      : `${formatCurrency(account.availableBalance, localSettings.currency || "USD")} avail`}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="data-panel section moduleRecurring">
        <div className="row">
          <div>
            <h3>Detected Recurring</h3>
            <div className="muted pageIntro">
              Repeated Plaid transactions are grouped into likely subscriptions, bills, payments, and income so you can confirm or link them to manual items.
            </div>
          </div>
          <div className="spacer" />
          <div className="data-panel">
            <strong>Active:</strong> {(recurringPayments || []).filter((item) => item.status !== "ignored" && item.active !== false).length}
          </div>
        </div>
        {recurringPayments.length === 0 ? <div className="muted">No recurring patterns detected yet.</div> : null}
        <div className="tableWrap premiumTableWrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Cadence</th>
                <th>Average</th>
                <th>Next expected</th>
                <th>Type</th>
                <th>Status</th>
                <th>Linked</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleRecurringPayments.length === 0 ? (
                <tr><td colSpan={8} className="muted">No recurring patterns detected yet.</td></tr>
              ) : null}
              {visibleRecurringPayments.map((item) => (
                <tr key={item.id || item.recurringId}>
                  <td>{item.displayName || item.merchantName || item.normalizedMerchant || "-"}</td>
                  <td>{item.cadenceGuess || "-"}</td>
                  <td>{formatCurrency(Math.abs(safeNumber(item.averageAmount, 0)), localSettings.currency || "USD")}</td>
                  <td>{recurringNextExpectedLabel(item)}</td>
                  <td>{item.typeGuess || "-"}</td>
                  <td>{item.status || "-"}</td>
                  <td>{recurringManualLabel(item) || "-"}</td>
                  <td>
                    <ActionMenu
                      items={[
                        { label: "Confirm", hidden: item.status === "confirmed", onClick: () => confirmRecurring(item) },
                        { label: recurringManualLabel(item) ? "Change Link" : "Link Item", onClick: () => openRecurringLink(item) },
                        {
                          label: "Remove Link",
                          hidden: !recurringManualLabel(item),
                          onClick: () => removeRecurringLink(item),
                        },
                        { label: "Ignore", hidden: item.status === "ignored", onClick: () => ignoreRecurring(item) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="data-panel section moduleTools">
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

      <Modal title="Link Recurring Item" open={recurringLinkOpen} onClose={closeRecurringLink}>
        <div className="formGrid">
          <label className="checkboxRow">
            <input type="checkbox" checked={createRecurringItemMode} onChange={(e) => setCreateRecurringItemMode(e.target.checked)} />
            Create new manual item instead of linking to an existing one
          </label>
          {!createRecurringItemMode ? (
            <label>
              Manual item
              <select value={selectedRecurringTarget} onChange={(e) => setSelectedRecurringTarget(e.target.value)}>
                <option value="">Select an item</option>
                <optgroup label="Bills">
                  {recurringCandidates.filter((candidate) => candidate.manualType === "bill").map((candidate) => {
                    const key = [candidate.manualType, candidate.manualId, candidate.monthId || ""].join("|");
                    return <option key={key} value={key}>{candidate.label}</option>;
                  })}
                </optgroup>
                <optgroup label="Income">
                  {recurringCandidates.filter((candidate) => candidate.manualType === "income").map((candidate) => {
                    const key = [candidate.manualType, candidate.manualId, candidate.monthId || ""].join("|");
                    return <option key={key} value={key}>{candidate.label}</option>;
                  })}
                </optgroup>
                <optgroup label="Loans">
                  {recurringCandidates.filter((candidate) => candidate.manualType === "loan").map((candidate) => {
                    const key = [candidate.manualType, candidate.manualId, candidate.monthId || ""].join("|");
                    return <option key={key} value={key}>{candidate.label}</option>;
                  })}
                </optgroup>
                <optgroup label="Credit Cards">
                  {recurringCandidates.filter((candidate) => candidate.manualType === "creditCard").map((candidate) => {
                    const key = [candidate.manualType, candidate.manualId, candidate.monthId || ""].join("|");
                    return <option key={key} value={key}>{candidate.label}</option>;
                  })}
                </optgroup>
              </select>
            </label>
          ) : (
            <>
              <label>
                Type
                <select value={createRecurringItemForm.manualType} onChange={(e) => setCreateRecurringItemForm({ ...createRecurringItemForm, manualType: e.target.value })}>
                  <option value="bill">Bill</option>
                  <option value="income">Income</option>
                  <option value="loan">Loan</option>
                  <option value="creditCard">Credit Card</option>
                  <option value="account">Account</option>
                </select>
              </label>
              <label>
                Name
                <input value={createRecurringItemForm.name} onChange={(e) => setCreateRecurringItemForm({ ...createRecurringItemForm, name: e.target.value })} />
              </label>
              <label>
                Amount
                <input type="number" value={createRecurringItemForm.amount} onChange={(e) => setCreateRecurringItemForm({ ...createRecurringItemForm, amount: e.target.value })} />
              </label>
              {createRecurringItemForm.manualType === "income" ? (
                <label>
                  Pay Day
                  <input type="number" min="1" max="31" value={createRecurringItemForm.payDay} onChange={(e) => setCreateRecurringItemForm({ ...createRecurringItemForm, payDay: e.target.value })} />
                </label>
              ) : (
                <label>
                  Due Day
                  <input type="number" min="1" max="31" value={createRecurringItemForm.dueDay} onChange={(e) => setCreateRecurringItemForm({ ...createRecurringItemForm, dueDay: e.target.value })} />
                </label>
              )}
            </>
          )}
          {selectedRecurring ? (
            <div className="data-panel">
              <strong>{selectedRecurring.displayName || selectedRecurring.merchantName || selectedRecurring.normalizedMerchant}</strong>
              <div className="muted">
                {selectedRecurring.cadenceGuess || "unknown"} - {formatCurrency(selectedRecurring.averageAmount, localSettings.currency || "USD")}
              </div>
            </div>
          ) : null}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveRecurringLink}>Save Link</button>
        </div>
      </Modal>

      <Modal title="Link Plaid Account" open={accountPlaidLinkOpen} onClose={() => { setAccountPlaidLinkOpen(false); setSelectedManualAccount(null); setSelectedPlaidAccountId(""); }}>
        <div className="formGrid">
          <label>
            Manual account
            <input value={selectedManualAccount?.name || ""} disabled />
          </label>
          <label>
            Plaid account
            <select value={selectedPlaidAccountId} onChange={(e) => setSelectedPlaidAccountId(e.target.value)}>
              <option value="">No linked Plaid account</option>
              {linkedAccounts.map((account) => (
                <option key={account.id || account.accountId} value={account.id || account.accountId}>
                  {(account.institutionName ? account.institutionName + " - " : "") + account.name + (account.mask ? " ****" + account.mask : "")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveManualAccountPlaidLink}>Save Link</button>
        </div>
      </Modal>
    </div>
  );
}


