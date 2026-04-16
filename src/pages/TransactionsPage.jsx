import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";
import PageHeader from "../components/ui/PageHeader";
import SectionHeader from "../components/ui/SectionHeader";
import SurfaceCard from "../components/ui/SurfaceCard";
import SearchField from "../components/ui/SearchField";
import InsightCard from "../components/ui/InsightCard";
import ChipTabs from "../components/ui/ChipTabs";
import Icon from "../components/ui/Icons";
import { MenuRow, TransactionRow } from "../components/ui/Rows";
import { deleteEntity, updateTransactionOverrides, upsertEntity } from "../lib/db";
import {
  getAutomationReviewSummary,
  getTransactionDisplayName,
  isTransactionCardPayment,
  isTransactionTransfer,
} from "../lib/automation";
import {
  DEFAULT_SETTINGS,
  formatCurrency,
  getEffectiveTransactionCategory,
  monthKey,
  safeNumber,
} from "../lib/finance";

const EMPTY_TX = {
  date: new Date().toISOString().slice(0, 10),
  payee: "",
  category: "",
  amount: 0,
  accountId: "",
  notes: "",
  userMerchantRename: "",
  ignoredFromAnalytics: false,
};

export default function TransactionsPage({ uid, transactions, accounts, settings, onToast, onError }) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_TX);
  const [monthFilter, setMonthFilter] = useState(monthKey());
  const [accountFilter, setAccountFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const categories = useMemo(
    () => [...new Set((transactions || []).map((transaction) => getEffectiveTransactionCategory(transaction)).filter(Boolean))].sort(),
    [transactions]
  );

  const rows = useMemo(
    () =>
      (transactions || [])
        .filter((transaction) => monthKey(new Date(transaction.date || new Date())) === monthFilter)
        .filter((transaction) => !accountFilter || transaction.accountId === accountFilter)
        .filter((transaction) => !categoryFilter || getEffectiveTransactionCategory(transaction) === categoryFilter)
        .filter((transaction) => {
          const haystack = `${getTransactionDisplayName(transaction)} ${transaction.notes || ""} ${getEffectiveTransactionCategory(transaction)}`.toLowerCase();
          return haystack.includes(query.toLowerCase());
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [transactions, monthFilter, accountFilter, categoryFilter, query]
  );

  const groups = useMemo(() => {
    const grouped = new Map();
    rows.forEach((transaction) => {
      const key = String(transaction.date || "").slice(0, 7) || "Unknown";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(transaction);
    });
    return [...grouped.entries()].map(([month, monthRows]) => ({
      month,
      label: new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
        new Date(`${month}-01T00:00:00`)
      ),
      total: monthRows.reduce((sum, transaction) => {
        const amount = safeNumber(transaction.amount, 0);
        return amount < 0 ? sum + Math.abs(amount) : sum;
      }, 0),
      rows: monthRows,
    }));
  }, [rows]);

  const accountNameById = useMemo(
    () =>
      (accounts || []).reduce((map, account) => {
        map[account.id] = account.name || account.institution || account.id;
        return map;
      }, {}),
    [accounts]
  );

  const automationReview = useMemo(
    () => getAutomationReviewSummary({ transactions: rows }),
    [rows]
  );
  const reviewCount = automationReview.transactionReviews.length;

  function startAdd() {
    setEditingId(null);
    setForm(EMPTY_TX);
    setOpen(true);
  }

  function startEdit(transaction) {
    setEditingId(transaction.id);
    setForm({ ...EMPTY_TX, ...transaction });
    setOpen(true);
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
          sourceType: form.sourceType || form.source || "manual",
          reviewRequired: false,
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

  async function markTransactionIgnored(transaction, ignoredFromAnalytics = true) {
    try {
      await updateTransactionOverrides(uid, transaction.id, {
        ignoredFromAnalytics,
        reviewRequired: false,
      });
      onToast(ignoredFromAnalytics ? "Transaction ignored from analytics." : "Transaction restored.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to update transaction override.", "error");
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Transactions"
        title="Review the money movement"
        subtitle="Search, filter, and clean up your latest activity."
        left={<div className="iconButton"><Icon name="transactions" size={18} /></div>}
        right={
          <button type="button" className="iconButton" onClick={startAdd} aria-label="Add transaction">
            <Icon name="plus" size={18} />
          </button>
        }
      />

      <SurfaceCard>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search merchants, notes, or categories"
          action={
            <button type="button" className="iconButton" onClick={() => setShowFilters((value) => !value)} aria-label="Toggle filters">
              <Icon name="filter" size={16} />
            </button>
          }
        />
        {showFilters ? (
          <div className="stackedList" style={{ marginTop: 16 }}>
            <div className="summaryGrid two">
              <label>
                <span className="sectionEyebrow">Month</span>
                <input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
              </label>
              <label>
                <span className="sectionEyebrow">Account</span>
                <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                  <option value="">All accounts</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ChipTabs
              items={[
                { id: "", label: "All categories" },
                ...categories.slice(0, 5).map((category) => ({ id: category, label: category })),
              ]}
              value={categoryFilter}
              onChange={setCategoryFilter}
            />
          </div>
        ) : null}
      </SurfaceCard>

      <InsightCard
        icon="spark"
        eyebrow="Smart Review"
        title="Review latest transactions"
        body={
          reviewCount > 0
            ? `${reviewCount} transaction${reviewCount === 1 ? "" : "s"} could use a category override or merchant cleanup.`
            : "Your latest transactions already look clean."
        }
        action={<button type="button" className="pillButton" onClick={() => setShowFilters(true)}>Open filters</button>}
      />

      <SurfaceCard>
        <SectionHeader
          eyebrow="Automation Review"
          title="Transfers, card payments, and uncategorized items"
          subtitle={
            automationReview.transactionReviews.length
              ? "Only low-confidence items are surfaced here."
              : "This filter has no pending automation review."
          }
        />
        {automationReview.transactionReviews.length === 0 ? (
          <div className="sectionSubtitle">No ambiguous transfers, uncategorized activity, or card payment reviews here.</div>
        ) : (
          <div className="stackedList">
            {automationReview.transactionReviews.slice(0, 6).map((transaction) => (
              <TransactionRow
                key={`review-${transaction.id}`}
                name={getTransactionDisplayName(transaction)}
                subtitle={
                  isTransactionTransfer(transaction)
                    ? "Transfer review required"
                    : isTransactionCardPayment(transaction)
                      ? "Card payment review"
                      : `Needs category or merchant cleanup • ${accountNameById[transaction.accountId] || "Unassigned"}`
                }
                amount={formatCurrency(transaction.amount, cfg.currency)}
                amountTone={safeNumber(transaction.amount, 0) < 0 ? "negative" : "positive"}
                icon="transactions"
                action={
                  <div className="row">
                    <button type="button" className="iconButton" onClick={() => startEdit(transaction)} aria-label="Edit transaction">
                      <Icon name="dots" size={16} />
                    </button>
                    <button type="button" className="iconButton" onClick={() => markTransactionIgnored(transaction, true)} aria-label="Ignore transaction">
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </SurfaceCard>

      {groups.length === 0 ? (
        <SurfaceCard>
          <div className="sectionTitle">No transactions for this filter</div>
          <div className="sectionSubtitle" style={{ marginTop: 6 }}>
            Adjust the month, account, or category filters to widen the ledger view.
          </div>
        </SurfaceCard>
      ) : (
        groups.map((group) => (
          <SurfaceCard key={group.month}>
            <SectionHeader
              eyebrow="Ledger"
              title={group.label}
              subtitle={`${group.rows.length} items`}
              action={<div className="sectionTitle">{formatCurrency(group.total, cfg.currency)}</div>}
            />
            <div className="stackedList">
              {group.rows.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  name={getTransactionDisplayName(transaction)}
                  subtitle={`${transaction.date || "-"} • ${getEffectiveTransactionCategory(transaction)} • ${accountNameById[transaction.accountId] || "Unassigned"}${isTransactionTransfer(transaction) ? " • Transfer" : isTransactionCardPayment(transaction) ? " • Card payment" : ""}`}
                  amount={formatCurrency(transaction.amount, cfg.currency)}
                  amountTone={safeNumber(transaction.amount, 0) < 0 ? "negative" : "positive"}
                  icon="transactions"
                  action={
                    <button type="button" className="iconButton" onClick={() => startEdit(transaction)} aria-label="Edit transaction">
                      <Icon name="dots" size={16} />
                    </button>
                  }
                />
              ))}
            </div>
          </SurfaceCard>
        ))
      )}

      <SurfaceCard>
        <SectionHeader eyebrow="Actions" title="Transaction tools" subtitle="A touch-friendly action list instead of inline desktop controls." />
        <div className="menuList">
          <MenuRow icon="tag" title="Rename merchant" subtitle="Open a transaction and adjust the payee name." onClick={() => setOpen(true)} />
          <MenuRow icon="tag" title="Add tags or notes" subtitle="Use notes today, tag-level analysis later." onClick={() => setOpen(true)} />
          <MenuRow icon="filter" title="Ignore or categorize" subtitle="Category override support is available in the transaction editor." onClick={() => setOpen(true)} />
        </div>
      </SurfaceCard>

      <Modal title={editingId ? "Edit Transaction" : "Add Transaction"} open={open} onClose={() => setOpen(false)}>
        <div className="formGrid">
          <label>Date<input type="date" value={form.date || ""} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>Payee<input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} /></label>
          <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <label>Category Override<input value={form.userCategoryOverride || ""} onChange={(e) => setForm({ ...form, userCategoryOverride: e.target.value })} /></label>
          <label>Merchant Rename<input value={form.userMerchantRename || ""} onChange={(e) => setForm({ ...form, userMerchantRename: e.target.value })} /></label>
          <label>Amount<input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label>
            Account
            <select value={form.accountId || ""} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ignore from analytics
            <select value={form.ignoredFromAnalytics ? "yes" : "no"} onChange={(e) => setForm({ ...form, ignoredFromAnalytics: e.target.value === "yes" })}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <label style={{ gridColumn: "1 / -1" }}>Notes<textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
          {editingId ? (
            <button type="button" onClick={() => remove(editingId)}>
              Delete
            </button>
          ) : <span />}
          <button type="button" className="primary" onClick={save}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
