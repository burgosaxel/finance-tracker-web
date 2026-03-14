import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";
import {
  applyMatchingRules,
  clearTransactionMatch,
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
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchTx, setMatchTx] = useState(null);
  const [selectedTargetKey, setSelectedTargetKey] = useState("");
  const [createRule, setCreateRule] = useState(false);
  const [ruleType, setRuleType] = useState("merchant_contains");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleAutoApply, setRuleAutoApply] = useState(true);

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
    setMatchOpen(true);
  }

  function closeMatch() {
    setMatchOpen(false);
    setMatchTx(null);
    setSelectedTargetKey("");
    setCreateRule(false);
    setRulePattern("");
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
    const target = candidateByKey.get(selectedTargetKey);
    if (!matchTx || !target) return;
    try {
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

  return (
    <div className="page">
      <section className="card section pageHero heroActivity">
        <div className="pageHeader">
          <div className="pageHeaderContent">
            <div className="pageEyebrow">Activity review</div>
            <h2>Transactions</h2>
            <p className="muted pageIntro">
              Review money movement, filter the ledger, and connect Plaid transactions to your manual planner without replacing it.
            </p>
          </div>
          <div className="pageActions">
            <button type="button" onClick={runRules}><Settings size={16} /> Apply Rules</button>
            <button type="button" className="primary" onClick={startAdd}><Plus size={16} /> Add Transaction</button>
          </div>
        </div>
        <div className="filtersBar">
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
      </section>

      <div className="tableWrap card desktopDataTable moduleActivity">
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
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="muted">No transactions for this filter.</td></tr>
            ) : null}
            {rows.map((t) => {
              const suggestions = (t.source || "") === "plaid" && t.matchStatus !== "matched"
                ? getTransactionMatchSuggestions(t, manualCandidates, matchingRules, 3)
                : [];
              const matchedLabel = getMatchedManualLabel(t, manualCandidates);
              const matchedByLabel = matchSourceLabel(t);
              return (
                <tr key={t.id}>
                  <td>{t.date || "-"}</td>
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
                  <td className={safeNumber(t.amount, 0) < 0 ? "neg" : "pos"}>
                    {formatCurrency(t.amount, cfg.currency)}
                  </td>
                  <td>
                    {accounts.find((a) => a.id === t.accountId)?.name || "-"}
                    {t.institutionName ? <div className="muted">{t.institutionName}</div> : null}
                  </td>
                  <td>
                    <span className={`pill ${t.matchStatus === "matched" ? "" : t.matchStatus === "ignored" ? "warn" : ""}`}>
                      {matchStatusLabel(t)}
                    </span>
                    {matchedLabel ? (
                      <div className="matchConfirmed">
                        <strong>Matched to: {matchedLabel}</strong>
                        {matchedByLabel ? <div className="muted">{matchedByLabel}</div> : null}
                      </div>
                    ) : null}
                    {t.linkedManualType === "bill" ? <div className="muted">Suggested follow-up: mark bill paid</div> : null}
                    {t.linkedManualType === "income" ? <div className="muted">Suggested follow-up: mark income received</div> : null}
                  </td>
                  <td>{t.notes || "-"}</td>
                  <td className="row">
                    {(t.source || "") === "plaid" && t.matchStatus !== "matched" ? (
                      <button type="button" onClick={() => startMatch(t)}>Match</button>
                    ) : null}
                    {(t.source || "") === "plaid" && t.matchStatus !== "ignored" && t.matchStatus !== "matched" ? (
                      <button type="button" onClick={() => ignoreTransaction(t)}>Ignore</button>
                    ) : null}
                    {(t.source || "") === "plaid" && t.matchStatus === "matched" ? (
                      <button type="button" onClick={() => unmatchTransaction(t)}>Unmatch</button>
                    ) : null}
                    {(t.source || "") === "plaid" && t.matchStatus === "ignored" ? (
                      <button type="button" onClick={() => unmatchTransaction(t)}>Restore</button>
                    ) : null}
                    <button type="button" onClick={() => startEdit(t)}>Edit</button>
                    <button type="button" onClick={() => remove(t.id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mobileDataList">
        {rows.length === 0 ? <div className="card section muted">No transactions for this filter.</div> : null}
        {rows.map((t) => {
          const suggestions = (t.source || "") === "plaid" && t.matchStatus !== "matched"
            ? getTransactionMatchSuggestions(t, manualCandidates, matchingRules, 3)
            : [];
          const matchedLabel = getMatchedManualLabel(t, manualCandidates);
          const matchedByLabel = matchSourceLabel(t);
          return (
            <article key={`mobile-${t.id}`} className="card section dataItem">
              <div className="dataItemHeader">
                <h3 className="dataItemTitle">{t.merchantName || t.payee}</h3>
                <span className={safeNumber(t.amount, 0) < 0 ? "neg" : "pos"}>
                  {formatCurrency(t.amount, cfg.currency)}
                </span>
              </div>
              <div className="dataGrid">
                <div className="dataRow"><span className="dataLabel">Date</span><span className="dataValue">{t.date || "-"}</span></div>
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
                {(t.source || "") === "plaid" && t.matchStatus !== "matched" ? (
                  <button type="button" onClick={() => startMatch(t)}>Match</button>
                ) : null}
                {(t.source || "") === "plaid" && t.matchStatus !== "ignored" && t.matchStatus !== "matched" ? (
                  <button type="button" onClick={() => ignoreTransaction(t)}>Ignore</button>
                ) : null}
                {(t.source || "") === "plaid" && t.matchStatus === "matched" ? (
                  <button type="button" onClick={() => unmatchTransaction(t)}>Unmatch</button>
                ) : null}
                {(t.source || "") === "plaid" && t.matchStatus === "ignored" ? (
                  <button type="button" onClick={() => unmatchTransaction(t)}>Restore</button>
                ) : null}
                <button type="button" onClick={() => startEdit(t)}>Edit</button>
                <button type="button" onClick={() => remove(t.id)}>Delete</button>
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
          {matchTx ? (
            <div className="card section">
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
