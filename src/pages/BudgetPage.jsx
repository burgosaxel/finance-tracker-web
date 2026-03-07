import React, { useMemo, useState } from "react";
import { getBudgetDocIdForMonth, upsertEntity } from "../lib/db";
import { DEFAULT_SETTINGS, formatCurrency, monthKey, safeNumber } from "../lib/finance";

export default function BudgetPage({ uid, budgets, bills, income, transactions, settings, onToast, onError }) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [selectedMonth, setSelectedMonth] = useState(monthKey());

  const monthBudget = useMemo(
    () => (budgets || []).find((b) => b.id === selectedMonth) || { id: selectedMonth, categories: {} },
    [budgets, selectedMonth]
  );

  const monthIncome = useMemo(
    () =>
      (income || [])
        .filter((i) => String(i.nextPayDate || "").slice(0, 7) === selectedMonth)
        .reduce((sum, i) => sum + safeNumber(i.expectedAmount, 0), 0),
    [income, selectedMonth]
  );

  const categoryNames = useMemo(() => {
    const fromBills = (bills || []).map((b) => b.category).filter(Boolean);
    const fromTx = (transactions || [])
      .filter((t) => String(t.date || "").slice(0, 7) === selectedMonth)
      .map((t) => t.category)
      .filter(Boolean);
    const existing = Object.keys(monthBudget.categories || {});
    return [...new Set([...fromBills, ...fromTx, ...existing])].sort();
  }, [bills, monthBudget.categories, selectedMonth, transactions]);

  const [assignedDraft, setAssignedDraft] = useState({});

  const rows = useMemo(() => {
    return categoryNames.map((name) => {
      const assigned =
        assignedDraft[name] !== undefined
          ? safeNumber(assignedDraft[name], 0)
          : safeNumber(monthBudget.categories?.[name], 0);
      const activity = (transactions || [])
        .filter((t) => String(t.date || "").slice(0, 7) === selectedMonth)
        .filter((t) => t.category === name)
        .reduce((sum, t) => sum + (safeNumber(t.amount, 0) < 0 ? Math.abs(safeNumber(t.amount, 0)) : -safeNumber(t.amount, 0)), 0);
      return {
        name,
        assigned,
        activity,
        available: assigned - activity,
      };
    });
  }, [assignedDraft, categoryNames, monthBudget.categories, selectedMonth, transactions]);

  const totals = useMemo(() => {
    const totalAssigned = rows.reduce((s, r) => s + r.assigned, 0);
    return {
      totalAssigned,
      toBeBudgeted: monthIncome - totalAssigned,
    };
  }, [monthIncome, rows]);

  async function saveBudget() {
    try {
      const nextCategories = {};
      rows.forEach((r) => {
        nextCategories[r.name] = safeNumber(r.assigned, 0);
      });
      await upsertEntity(
        uid,
        "budgets",
        {
          month: selectedMonth,
          categories: nextCategories,
        },
        getBudgetDocIdForMonth(selectedMonth)
      );
      onToast("Budget saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save budget.", "error");
    }
  }

  return (
    <div className="page">
      <div className="row">
        <h2>Budget</h2>
        <div className="spacer" />
        <label>
          Month
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
        </label>
        <button type="button" className="primary" onClick={saveBudget}>Save Month Budget</button>
      </div>
      <p className="muted pageIntro">
        Plan your month by assigning dollars to categories and comparing assigned amounts against activity.
      </p>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="card section"><strong>Month Income:</strong> {formatCurrency(monthIncome, cfg.currency)}</div>
        <div className="card section"><strong>Total Assigned:</strong> {formatCurrency(totals.totalAssigned, cfg.currency)}</div>
        <div className="card section"><strong>To Be Budgeted:</strong> {formatCurrency(totals.toBeBudgeted, cfg.currency)}</div>
      </div>

      <div className="tableWrap card">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Assigned</th>
              <th>Activity</th>
              <th>Available</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="muted">No categories yet. Add bills/transactions first.</td></tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>
                  <input
                    type="number"
                    value={r.assigned}
                    onChange={(e) => setAssignedDraft({ ...assignedDraft, [r.name]: e.target.value })}
                  />
                </td>
                <td>{formatCurrency(r.activity, cfg.currency)}</td>
                <td>{formatCurrency(r.available, cfg.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
