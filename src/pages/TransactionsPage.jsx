import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";
import ActionMenu from "../components/ActionMenu";
import {
  applyMatchingRules,
  clearAllMatchingRules,
  clearTransactionMatch,
  createManualItem,
  deleteEntity,
  ignoreTransactionMatch,
  matchTransactionToManualItem,
  upsertEntity,
} from "../lib/db";
import {
  DEFAULT_SETTINGS,
  formatCurrency,
  formatCategoryLabel,
  getEffectiveTransactionCategory,
  getManualMatchCandidates,
  getMatchedManualLabel,
  getTransactionMatchSuggestions,
  monthKey,
  safeNumber,
} from "../lib/finance";
import { Plus, Settings } from "lucide-react";

const EMPTY_TX = {
  date: new Date().toISOString().slice(0, 10),
  payee: "",
  category: "",
  amount: 0,
  accountId: "",
  notes: "",
};

const EMPTY_CREATE_ITEM = {
  manualType: "bill",
  name: "",
  amount: 0,
  dueDay: 1,
  payDay: 1,
};

function encodeTarget(candidate) {
  return [candidate.manualType, candidate.manualId, candidate.monthId || ""].join("|");
}

function matchStatusLabel(transaction) {
  if ((transaction.source || "manual") !== "plaid") return "Manual";
  if (transaction.matchStatus === "matched") return "Matched";
  if (transaction.matchStatus === "ignored") return "Ignored";
  return "Unmatched";
}

function matchSourceLabel(transaction) {
  if (transaction?.matchedBy === "rule") return "Rule match";
  if (transaction?.matchedBy === "manual") return "Manual match";
  return "";
}

export default function TransactionsPage({
  uid,
  transactions,
  accounts,
  bills,
  income,
  loans,
  creditCards,
  matchingRules,
  settings,
  onToast,
  onError,
  selectedMonth,
}) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_TX);
  const [monthFilter, setMonthFilter] = useState(monthKey());
  const [accountFilter, setAccountFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState("20");
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchTx, setMatchTx] = useState(null);
  const [selectedTargetKey, setSelectedTargetKey] = useState("");
  const [createRule, setCreateRule] = useState(false);
  const [ruleType, setRuleType] = useState("merchant_contains");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleAutoApply, setRuleAutoApply] = useState(true);
  const [createItemMode, setCreateItemMode] = useState(false);
  const [createItemForm, setCreateItemForm] = useState(EMPTY_CREATE_ITEM);

  const manualCandidates = useMemo(
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

  const candidateByKey = useMemo(() => {
    return manualCandidates.reduce((map, candidate) => {
      map.set(encodeTarget(candidate), candidate);
      return map;
    }, new Map());
  }, [manualCandidates]);

  const categories = useMemo(() => {
    return [...new Set((transactions || []).map((t) => getEffectiveTransactionCategory(t)).filter(Boolean))].sort();
  }, [transactions]);

  const rows = useMemo(() => {
    return (transactions || [])
      .filter((t) => monthKey(new Date(t.date || new Date())) === monthFilter)
      .filter((t) => !accountFilter || t.accountId === accountFilter)
      .filter((t) => !categoryFilter || getEffectiveTransactionCategory(t) === categoryFilter)
      .filter((t) => !sourceFilter || (t.source || "manual") === sourceFilter)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, monthFilter, accountFilter, categoryFilter, sourceFilter]);

  const visibleRows = useMemo(() => {
    if (visibleCount === "all") return rows;
    return rows.slice(0, Number(visibleCount));
  }, [rows, visibleCount]);

  function startAdd() {
    setEditingId(null);
    setForm(EMPTY_TX);
    setOpen(true);
  }

  function startEdit(tx) {
    setEditingId(tx.id);
    setForm({ ...EMPTY_TX, ...tx });
    setOpen(true);
  }

  function startMatch(transaction, candidate = null) {
    setMatchTx(transaction);
    setSelectedTargetKey(candidate ? encodeTarget(candidate) : "");
    setCreateRule(false);
    setRuleType("merchant_contains");
    setRulePattern(transaction.merchantName || transaction.payee || transaction.name || "");
    setRuleAutoApply(true);
    setCreateItemMode(false);
    setCreateItemForm({
      manualType: "bill",
      name: transaction.merchantName || transaction.payee || transaction.name || "",
      amount: Math.abs(safeNumber(transaction.amount, 0)),
      dueDay: new Date(transaction.date || new Date()).getDate(),
      payDay: new Date(transaction.date || new Date()).getDate(),
    });
    setMatchOpen(true);
  }

  function closeMatch() {
    setMatchOpen(false);
    setMatchTx(null);
    setSelectedTargetKey("");
    setCreateRule(false);
    setRulePattern("");
    setCreateItemMode(false);
  }

  async function save() {
    if (!form.payee.trim()) return;
    try {
      await upsertEntity(
        uid,
        "transactions",
        {
          ...form,
          payee: form.payee.trim(),
          amount: safeNumber(form.amount, 0),
          source: form.source || "manual",
        },
        editingId || undefined
      );
      setOpen(false);
      onToast("Transaction saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save transaction.", "error");
    }
  }

  async function remove(id) {
    try {
      await deleteEntity(uid, "transactions", id);
      onToast("Transaction deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete transaction.", "error");
    }
  }

  async function saveMatch() {
    if (!matchTx) return;
    try {
      if (createItemMode) {
        const created = await createManualItem(uid, {
          ...createItemForm,
          monthId: selectedMonth,
          amount: Math.abs(safeNumber(createItemForm.amount, 0)),
        });
        await matchTransactionToManualItem(uid, matchTx, created, {
          matchedBy: "manual",
          createRule,
          rule: createRule
            ? {
                ruleType,
                pattern: rulePattern.trim(),
                autoApply: ruleAutoApply,
              }
            : null,
        });
      } else {
        const target = candidateByKey.get(selectedTargetKey);
        if (!target) return;
        await matchTransactionToManualItem(uid, matchTx, target, {
          matchedBy: "manual",
          createRule,
          rule: createRule
            ? {
                ruleType,
                pattern: rulePattern.trim(),
                autoApply: ruleAutoApply,
              }
            : null,
        });
      }
      onToast("Transaction matched.");
      closeMatch();
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to match transaction.", "error");
    }
  }

  async function ignoreTransaction(transaction) {
    try {
      await ignoreTransactionMatch(uid, transaction.id);
      onToast("Transaction ignored.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to ignore transaction.", "error");
    }
  }

  async function unmatchTransaction(transaction) {
    try {
      await clearTransactionMatch(uid, transaction);
      onToast("Transaction unmatched.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to unmatch transaction.", "error");
    }
  }

  async function runRules() {
    try {
      const applied = await applyMatchingRules(
        uid,
        rows,
        matchingRules,
        (rule) =>
          manualCandidates.find(
            (candidate) =>
              candidate.manualType === rule.targetManualType
              && candidate.manualId === rule.targetManualId
              && (candidate.monthId || "") === (rule.targetManualMonthId || "")
          ) || null
      );
      onToast(
        applied.length
          ? `Applied ${applied.length} matching rule${applied.length === 1 ? "" : "s"}.`
          : "No matching rules applied."
      );
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to apply matching rules.", "error");
    }
  }

  async function clearRules() {
    if (!window.confirm("Clear all matching rules? This will not delete transactions.")) return;
    try {
      const count = await clearAllMatchingRules(uid);
      onToast(count ? `Cleared ${count} matching rule${count === 1 ? "" : "s"}.` : "No matching rules to clear.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to clear matching rules.", "error");
    }
  }

  return (
    <div className="page">
      <section className="dashboard-hero pageHero heroActivity transactionsHero transactions-card">
        <div className="pageHeader">
          <div className="pageHeaderContent">
            <div className="pageEyebrow">Activity review</div>
            <h2>Transactions</h2>
            <p className="muted pageIntro">
              Review money movement, filter the ledger, and connect Plaid transactions to your manual planner without replacing it.
            </p>
          </div>
        </div>
        <div className="filters-wrapper">
          <div className="filtersBar transactionsFiltersBar transactions-filters">
          <div className="transactionsFilterFields filters-row">
          <label className="fieldGroup compactField">
            <span>Month</span>
            <input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
          </label>
          <label className="fieldGroup compactField">
            <span>Account</span>
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
              <option value="">All</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="fieldGroup compactField">
            <span>Category</span>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All</option>
              {categories.map((c) => <option key={c} value={c}>{formatCategoryLabel(c)}</option>)}
            </select>
          </label>
          <label className="fieldGroup compactField">
            <span>Source</span>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">All</option>
              <option value="manual">Manual</option>
              <option value="plaid">Plaid</option>
            </select>
          </label>
          </div>
          <div className="pageActions transactionsFilterActions filters-actions">
            <button type="button" onClick={runRules}><Settings size={16} /> Apply Rules</button>
            <button type="button" onClick={clearRules}>Clear Rules</button>
            <button type="button" className="primary" onClick={startAdd}><Plus size={16} /> Add Transaction</button>
          </div>
          </div>
        </div>
      </section>

      <div className="tableWrap card desktopDataTable premiumTableWrap moduleActivity data-panel">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Payee</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Account</th>
              <th>Match</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={8} className="muted">No transactions for this filter.</td></tr>
            ) : null}
            {visibleRows.map((t) => {
              const suggestions = (t.source || "") === "plaid" && t.matchStatus !== "matched"
                ? getTransactionMatchSuggestions(t, manualCandidates, matchingRules, 3)
                : [];
              const matchedLabel = getMatchedManualLabel(t, manualCandidates);
              const matchedByLabel = matchSourceLabel(t);
              return (
                <tr key={t.id}>
                  <td className="dateCell">{t.date || "-"}</td>
                  <td>
                    {t.merchantName || t.payee}
                    {t.pending ? <div className="muted">Pending</div> : null}
                    {suggestions.length ? (
                      <div className="matchSuggestionList">
                        {suggestions.map((candidate) => (
                          <button
                            type="button"
                            key={`${t.id}-${encodeTarget(candidate)}`}
                            className="suggestionButton"
                            onClick={() => startMatch(t, candidate)}
                          >
                            {candidate.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td>{formatCategoryLabel(getEffectiveTransactionCategory(t))}</td>
                  <td className={safeNumber(t.amount, 0) < 0 ? "value-negative" : "value-positive"}>
                    {formatCurrency(t.amount, cfg.currency)}
                  </td>
                  <td>
                    {accounts.find((a) => a.id === t.accountId)?.name || "-"}
                    {t.institutionName ? <div className="muted">{t.institutionName}</div> : null}
                  </td>
                  <td>
                    <span className={`status-pill ${t.matchStatus === "matched" ? "status-success" : t.matchStatus === "ignored" ? "status-warning" : ""}`}>
                      {matchStatusLabel(t)}
                    </span>
                    {matchedLabel ? (
                      <div className="matchConfirmed">
                        <strong>Matched to: {matchedLabel}</strong>
                        {matchedByLabel ? <div className="muted">{matchedByLabel}</div> : null}
                      </div>
                    ) : null}
                  </td>
                  <td>{t.notes || "-"}</td>
                  <td>
                    <ActionMenu
                      items={[
                        {
                          label: "Match",
                          hidden: (t.source || "") !== "plaid" || t.matchStatus === "matched",
                          onClick: () => startMatch(t),
                        },
                        {
                          label: "Ignore",
                          hidden: (t.source || "") !== "plaid" || t.matchStatus === "ignored" || t.matchStatus === "matched",
                          onClick: () => ignoreTransaction(t),
                        },
                        {
                          label: t.matchStatus === "matched" ? "Unmatch" : "Restore",
                          hidden: (t.source || "") !== "plaid" || (t.matchStatus !== "matched" && t.matchStatus !== "ignored"),
                          onClick: () => unmatchTransaction(t),
                        },
                        { label: "Edit", onClick: () => startEdit(t) },
                        { label: "Delete", tone: "danger", onClick: () => remove(t.id) },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="listFooter cardSectionFooter transactionListFooter desktopOnly">
          <div className="muted">Showing {visibleRows.length} of {rows.length} transactions</div>
          <label className="fieldGroup compactField inlineSelector">
            <span>Show</span>
            <select value={visibleCount} onChange={(e) => setVisibleCount(e.target.value)}>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mobileDataList">
        {visibleRows.length === 0 ? <div className="data-panel muted">No transactions for this filter.</div> : null}
        {visibleRows.map((t) => {
          const suggestions = (t.source || "") === "plaid" && t.matchStatus !== "matched"
            ? getTransactionMatchSuggestions(t, manualCandidates, matchingRules, 3)
            : [];
          const matchedLabel = getMatchedManualLabel(t, manualCandidates);
          const matchedByLabel = matchSourceLabel(t);
          return (
            <article key={`mobile-${t.id}`} className="data-panel dataItem">
              <div className="dataItemHeader">
                <h3 className="dataItemTitle">{t.merchantName || t.payee}</h3>
                <span className={safeNumber(t.amount, 0) < 0 ? "value-negative" : "value-positive"}>
                  {formatCurrency(t.amount, cfg.currency)}
                </span>
              </div>
              <div className="dataGrid">
                <div className="dataRow"><span className="dataLabel">Date</span><span className="dataValue dateCell">{t.date || "-"}</span></div>
                <div className="dataRow"><span className="dataLabel">Category</span><span className="dataValue">{formatCategoryLabel(getEffectiveTransactionCategory(t))}</span></div>
                <div className="dataRow"><span className="dataLabel">Account</span><span className="dataValue">{accounts.find((a) => a.id === t.accountId)?.name || "-"}</span></div>
                <div className="dataRow"><span className="dataLabel">Institution</span><span className="dataValue">{t.institutionName || "-"}</span></div>
                <div className="dataRow"><span className="dataLabel">Source</span><span className="dataValue">{t.source || "manual"}</span></div>
                <div className="dataRow"><span className="dataLabel">Status</span><span className="dataValue">{matchStatusLabel(t)}</span></div>
                <div className="dataRow"><span className="dataLabel">Matched To</span><span className="dataValue">{matchedLabel || "-"}</span></div>
                <div className="dataRow"><span className="dataLabel">Matched By</span><span className="dataValue">{matchedByLabel || "-"}</span></div>
                <div className="dataRow"><span className="dataLabel">Notes</span><span className="dataValue">{t.notes || "-"}</span></div>
              </div>
              {suggestions.length ? (
                <div className="matchSuggestionList">
                  {suggestions.map((candidate) => (
                    <button
                      type="button"
                      key={`${t.id}-${encodeTarget(candidate)}`}
                      className="suggestionButton"
                      onClick={() => startMatch(t, candidate)}
                    >
                      Match {candidate.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="row dataActions">
                <ActionMenu
                  items={[
                    {
                      label: "Match",
                      hidden: (t.source || "") !== "plaid" || t.matchStatus === "matched",
                      onClick: () => startMatch(t),
                    },
                    {
                      label: "Ignore",
                      hidden: (t.source || "") !== "plaid" || t.matchStatus === "ignored" || t.matchStatus === "matched",
                      onClick: () => ignoreTransaction(t),
                    },
                    {
                      label: t.matchStatus === "matched" ? "Unmatch" : "Restore",
                      hidden: (t.source || "") !== "plaid" || (t.matchStatus !== "matched" && t.matchStatus !== "ignored"),
                      onClick: () => unmatchTransaction(t),
                    },
                    { label: "Edit", onClick: () => startEdit(t) },
                    { label: "Delete", tone: "danger", onClick: () => remove(t.id) },
                  ]}
                />
              </div>
            </article>
          );
        })}
      </div>

      <Modal title={editingId ? "Edit Transaction" : "Add Transaction"} open={open} onClose={() => setOpen(false)}>
        <div className="formGrid">
          <label>Date<input type="date" value={form.date || ""} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>Payee<input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} /></label>
          <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <label>Category Override<input value={form.userCategoryOverride || ""} onChange={(e) => setForm({ ...form, userCategoryOverride: e.target.value })} /></label>
          <label>Amount<input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label>
            Account
            <select value={form.accountId || ""} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label>Notes<textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={save}>Save</button>
        </div>
      </Modal>

      <Modal title="Match Transaction" open={matchOpen} onClose={closeMatch}>
        <div className="formGrid">
          <label className="checkboxRow">
            <input type="checkbox" checked={createItemMode} onChange={(e) => setCreateItemMode(e.target.checked)} />
            Create new item instead of linking to an existing one
          </label>
          {!createItemMode ? (
            <label>
              Manual item
              <select value={selectedTargetKey} onChange={(e) => setSelectedTargetKey(e.target.value)}>
                <option value="">Select an item</option>
                <optgroup label="Bills">
                  {manualCandidates.filter((candidate) => candidate.manualType === "bill").map((candidate) => (
                    <option key={encodeTarget(candidate)} value={encodeTarget(candidate)}>
                      {candidate.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Income">
                  {manualCandidates.filter((candidate) => candidate.manualType === "income").map((candidate) => (
                    <option key={encodeTarget(candidate)} value={encodeTarget(candidate)}>
                      {candidate.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Loans">
                  {manualCandidates.filter((candidate) => candidate.manualType === "loan").map((candidate) => (
                    <option key={encodeTarget(candidate)} value={encodeTarget(candidate)}>
                      {candidate.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Credit Cards">
                  {manualCandidates.filter((candidate) => candidate.manualType === "creditCard").map((candidate) => (
                    <option key={encodeTarget(candidate)} value={encodeTarget(candidate)}>
                      {candidate.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          ) : (
            <>
              <label>
                New item type
                <select value={createItemForm.manualType} onChange={(e) => setCreateItemForm((prev) => ({ ...prev, manualType: e.target.value }))}>
                  <option value="bill">Bill</option>
                  <option value="income">Income</option>
                  <option value="loan">Loan</option>
                  <option value="creditCard">Credit Card</option>
                </select>
              </label>
              <label>
                Name
                <input value={createItemForm.name} onChange={(e) => setCreateItemForm((prev) => ({ ...prev, name: e.target.value }))} />
              </label>
              <label>
                Amount
                <input type="number" value={createItemForm.amount} onChange={(e) => setCreateItemForm((prev) => ({ ...prev, amount: e.target.value }))} />
              </label>
              {createItemForm.manualType === "bill" ? (
                <label>
                  Due Day
                  <input type="number" min="1" max="31" value={createItemForm.dueDay} onChange={(e) => setCreateItemForm((prev) => ({ ...prev, dueDay: e.target.value }))} />
                </label>
              ) : null}
              {createItemForm.manualType === "income" ? (
                <label>
                  Pay Day
                  <input type="number" min="1" max="31" value={createItemForm.payDay} onChange={(e) => setCreateItemForm((prev) => ({ ...prev, payDay: e.target.value }))} />
                </label>
              ) : null}
            </>
          )}
          {matchTx ? (
            <div className="data-panel">
              <strong>{matchTx.merchantName || matchTx.payee}</strong>
              <div className="muted">{formatCurrency(matchTx.amount, cfg.currency)} on {matchTx.date || "-"}</div>
            </div>
          ) : null}
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={createRule}
              onChange={(e) => setCreateRule(e.target.checked)}
            />
            Save a reusable matching rule
          </label>
          {createRule ? (
            <>
              <label>
                Rule type
                <select value={ruleType} onChange={(e) => setRuleType(e.target.value)}>
                  <option value="merchant_contains">Merchant contains</option>
                  <option value="exact_name">Exact name</option>
                  <option value="amount_and_name">Amount and name</option>
                </select>
              </label>
              <label>
                Pattern
                <input value={rulePattern} onChange={(e) => setRulePattern(e.target.value)} />
              </label>
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={ruleAutoApply}
                  onChange={(e) => setRuleAutoApply(e.target.checked)}
                />
                Auto-apply this rule to future unmatched Plaid transactions
              </label>
            </>
          ) : null}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveMatch}>Save Match</button>
        </div>
      </Modal>
    </div>
  );
}

