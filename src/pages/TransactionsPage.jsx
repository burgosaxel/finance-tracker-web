import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";
import { deleteEntity, upsertEntity } from "../lib/db";
import { DEFAULT_SETTINGS, formatCurrency, monthKey, safeNumber } from "../lib/finance";

const EMPTY_TX = {
  date: new Date().toISOString().slice(0, 10),
  payee: "",
  category: "",
  amount: 0,
  accountId: "",
  notes: "",
};

export default function TransactionsPage({ uid, transactions, accounts, settings, onToast, onError }) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_TX);
  const [monthFilter, setMonthFilter] = useState(monthKey());
  const [accountFilter, setAccountFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const categories = useMemo(() => {
    return [...new Set((transactions || []).map((t) => t.category).filter(Boolean))].sort();
  }, [transactions]);

  const rows = useMemo(() => {
    return (transactions || [])
      .filter((t) => monthKey(new Date(t.date || new Date())) === monthFilter)
      .filter((t) => !accountFilter || t.accountId === accountFilter)
      .filter((t) => !categoryFilter || t.category === categoryFilter)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, monthFilter, accountFilter, categoryFilter]);

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

  return (
    <div className="page">
      <div className="row">
        <h2>Transactions</h2>
        <div className="spacer" />
        <label>
          Month
          <input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
        </label>
        <label>
          Account
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
            <option value="">All</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label>
          Category
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="button" className="primary" onClick={startAdd}>Add Transaction</button>
      </div>

      <div className="tableWrap card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Payee</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Account</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="muted">No transactions for this filter.</td></tr>
            ) : null}
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{t.date || "-"}</td>
                <td>{t.payee}</td>
                <td>{t.category || "-"}</td>
                <td className={safeNumber(t.amount, 0) < 0 ? "neg" : "pos"}>
                  {formatCurrency(t.amount, cfg.currency)}
                </td>
                <td>{accounts.find((a) => a.id === t.accountId)?.name || "-"}</td>
                <td>{t.notes || "-"}</td>
                <td className="row">
                  <button type="button" onClick={() => startEdit(t)}>Edit</button>
                  <button type="button" onClick={() => remove(t.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal title={editingId ? "Edit Transaction" : "Add Transaction"} open={open} onClose={() => setOpen(false)}>
        <div className="formGrid">
          <label>Date<input type="date" value={form.date || ""} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>Payee<input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} /></label>
          <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
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
    </div>
  );
}
