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
      <section className="card section pageHero heroDebt">
        <div className="pageHeader">
          <div className="pageHeaderContent">
            <div className="pageEyebrow">Long-term debt tracking</div>
            <h2>Loans</h2>
            <p className="muted pageIntro">
              Track lender balances, monthly obligations, and payoff posture with the same clean structure used across the app.
            </p>
          </div>
          <div className="pageActions">
            <button type="button" className="primary" onClick={startAdd}>
              Add Loan
            </button>
          </div>
        </div>
        <div className="statsGrid compactStats">
          <StatCard label="Loan Balance" value={formatCurrency(totals.totalBalance, cfg.currency)} />
          <StatCard label="Monthly Payments" value={formatCurrency(totals.totalMonthlyPayment, cfg.currency)} />
        </div>
      </section>

      <section className="card section moduleAccounts">
        <div className="sectionHeader">
          <div>
            <h3>Loan accounts</h3>
            <div className="muted compactSubtext">A clear ledger of lender balances, due-day timing, and status.</div>
          </div>
        </div>
        <div className="tableWrap card desktopDataTable">
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
      </section>

      <div className="mobileDataList">
        {rows.length === 0 ? <div className="card section muted">No loans yet.</div> : null}
        {rows.map((loan) => (
          <article key={`mobile-${loan.id}`} className="card section dataItem">
            <div className="dataItemHeader">
              <h3 className="dataItemTitle">{loan.lender}</h3>
              <span className="pill">{loan.status || "active"}</span>
            </div>
            <div className="summaryGrid two">
              <div className="summaryCell"><span className="dataLabel">Balance</span><strong>{formatCurrency(loan.balance, cfg.currency)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Monthly Payment</span><strong>{formatCurrency(loan.monthlyPayment, cfg.currency)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Interest Rate</span><strong>{loan.interestRate === null ? "-" : formatPercent(loan.interestRate)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Due Day</span><strong>{loan.dueDay || "-"}</strong></div>
            </div>
            {loan.notes ? <div className="muted compactSubtext">{loan.notes}</div> : null}
            <div className="row dataActions">
              <button type="button" onClick={() => startEdit(loan)}>Edit</button>
              <button type="button" onClick={() => remove(loan.id)}>Delete</button>
            </div>
          </article>
        ))}
      </div>

      <article className="card section dataItem moduleTotals">
        <h3 className="dataItemTitle">Totals</h3>
        <div className="summaryGrid two">
          <div className="summaryCell">
            <span className="dataLabel">Total Loan Balance</span>
            <strong>{formatCurrency(totals.totalBalance, cfg.currency)}</strong>
          </div>
          <div className="summaryCell">
            <span className="dataLabel">Total Monthly Payment</span>
            <strong>{formatCurrency(totals.totalMonthlyPayment, cfg.currency)}</strong>
          </div>
        </div>
      </article>

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
