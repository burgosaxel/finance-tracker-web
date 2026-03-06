import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";
import StatCard from "../components/StatCard";
import { deleteEntity, upsertEntity } from "../lib/db";
import { DEFAULT_SETTINGS, formatCurrency, formatPercent, safeNumber } from "../lib/finance";

const EMPTY_LOAN = {
  lender: "",
  balance: 0,
  monthlyPayment: 0,
  interestRate: "",
  dueDay: "",
  status: "active",
  notes: "",
};

export default function LoansPage({ uid, loans, settings, onToast, onError }) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_LOAN);
  const [editingId, setEditingId] = useState(null);

  const rows = useMemo(
    () =>
      [...(loans || [])]
        .map((loan) => ({
          ...loan,
          lender: loan.lender || loan.name || "",
          balance: safeNumber(loan.balance, 0),
          monthlyPayment: safeNumber(loan.monthlyPayment, 0),
          interestRate:
            loan.interestRate === null || loan.interestRate === undefined || loan.interestRate === ""
              ? null
              : safeNumber(loan.interestRate, 0),
          dueDay: loan.dueDay ? Number(loan.dueDay) : null,
          status: loan.status || "active",
        }))
        .sort((a, b) => b.balance - a.balance),
    [loans]
  );

  const totals = useMemo(
    () => ({
      totalBalance: rows.reduce((sum, loan) => sum + loan.balance, 0),
      totalMonthlyPayment: rows.reduce((sum, loan) => sum + loan.monthlyPayment, 0),
    }),
    [rows]
  );

  function startAdd() {
    setEditingId(null);
    setForm(EMPTY_LOAN);
    setOpen(true);
  }

  function startEdit(loan) {
    setEditingId(loan.id);
    setForm({
      lender: loan.lender || loan.name || "",
      balance: loan.balance ?? 0,
      monthlyPayment: loan.monthlyPayment ?? 0,
      interestRate: loan.interestRate ?? "",
      dueDay: loan.dueDay ?? "",
      status: loan.status || "active",
      notes: loan.notes || "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.lender.trim()) return;
    try {
      await upsertEntity(
        uid,
        "loans",
        {
          lender: form.lender.trim(),
          balance: safeNumber(form.balance, 0),
          monthlyPayment: safeNumber(form.monthlyPayment, 0),
          interestRate:
            form.interestRate === "" || form.interestRate === null || form.interestRate === undefined
              ? null
              : safeNumber(form.interestRate, 0),
          dueDay: form.dueDay ? Number(form.dueDay) : null,
          status: form.status?.trim() || "active",
          notes: form.notes?.trim() || "",
        },
        editingId || undefined
      );
      setOpen(false);
      onToast("Loan saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save loan.", "error");
    }
  }

  async function remove(id) {
    try {
      await deleteEntity(uid, "loans", id);
      onToast("Loan deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete loan.", "error");
    }
  }

  return (
    <div className="page">
      <div className="row">
        <h2>Loans</h2>
        <div className="spacer" />
        <button type="button" className="primary" onClick={startAdd}>
          Add Loan
        </button>
      </div>

      <div className="statsGrid">
        <StatCard label="Total Loan Balance" value={formatCurrency(totals.totalBalance, cfg.currency)} />
        <StatCard
          label="Total Monthly Loan Payments"
          value={formatCurrency(totals.totalMonthlyPayment, cfg.currency)}
        />
      </div>

      <div className="tableWrap card">
        <table>
          <thead>
            <tr>
              <th>Lender</th>
              <th>Balance</th>
              <th>Monthly Payment</th>
              <th>Interest</th>
              <th>Due Day</th>
              <th>Status</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  No loans yet.
                </td>
              </tr>
            ) : null}
            {rows.map((loan) => (
              <tr key={loan.id}>
                <td>{loan.lender}</td>
                <td>{formatCurrency(loan.balance, cfg.currency)}</td>
                <td>{formatCurrency(loan.monthlyPayment, cfg.currency)}</td>
                <td>{loan.interestRate === null ? "-" : formatPercent(loan.interestRate)}</td>
                <td>{loan.dueDay || "-"}</td>
                <td>{loan.status || "active"}</td>
                <td>{loan.notes || "-"}</td>
                <td className="row">
                  <button type="button" onClick={() => startEdit(loan)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => remove(loan.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal title={editingId ? "Edit Loan" : "Add Loan"} open={open} onClose={() => setOpen(false)}>
        <div className="formGrid">
          <label>
            Lender
            <input value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} />
          </label>
          <label>
            Balance
            <input
              type="number"
              value={form.balance}
              onChange={(e) => setForm({ ...form, balance: e.target.value })}
            />
          </label>
          <label>
            Monthly Payment
            <input
              type="number"
              value={form.monthlyPayment}
              onChange={(e) => setForm({ ...form, monthlyPayment: e.target.value })}
            />
          </label>
          <label>
            Interest Rate %
            <input
              type="number"
              value={form.interestRate}
              onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
            />
          </label>
          <label>
            Due Day
            <input
              type="number"
              min="1"
              max="31"
              value={form.dueDay}
              onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
            />
          </label>
          <label>
            Status
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="paid off">Paid off</option>
              <option value="paused">Paused</option>
            </select>
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Notes
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={save}>
            Save
          </button>
        </div>
      </Modal>
    </div>
  );
}
