import React, { useMemo, useState } from "react";
import StatCard from "../components/StatCard";
import { getBudgetDocIdForMonth, upsertEntity } from "../lib/db";
import { DEFAULT_SETTINGS, formatCurrency, monthKey, safeNumber } from "../lib/finance";
import { PiggyBank, DollarSign, TrendingUp } from "lucide-react";

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
      <section className="dashboard-hero pageHero heroPlan">
        <div className="pageHeader">
          <div className="pageHeaderContent">
            <div className="pageEyebrow">Monthly planning</div>
            <h2>Budget</h2>
            <p className="muted pageIntro">
              Plan your month by assigning dollars to categories and comparing assigned amounts against activity.
            </p>
          </div>
          <div className="pageActions">
            <label className="fieldGroup compactField">
              <span>Month</span>
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            </label>
            <button type="button" className="primary" onClick={saveBudget}>Save Month Budget</button>
          </div>
        </div>
        <div className="statsGrid compactStats">
          <StatCard icon={PiggyBank} className="metric-card green-accent" label="Month Income" value={formatCurrency(monthIncome, cfg.currency)} />
          <StatCard icon={DollarSign} className="metric-card" label="Total Assigned" value={formatCurrency(totals.totalAssigned, cfg.currency)} />
          <StatCard icon={TrendingUp} className="metric-card green-accent" label="To Be Budgeted" value={formatCurrency(totals.toBeBudgeted, cfg.currency)} />
        </div>
      </section>

      <section className="data-panel section modulePlan">
        <div className="sectionHeader">
          <div>
            <h3>Budget Categories</h3>
            <div className="muted compactSubtext">Assign monthly funding and compare it against recorded activity.</div>
          </div>
        </div>
        <div className="statsGrid compactStats summaryStrip">
          <div className="data-panel inlineMetric">
            <span className="dataLabel">Month Income</span>
            <strong>{formatCurrency(monthIncome, cfg.currency)}</strong>
          </div>
          <div className="data-panel inlineMetric">
            <span className="dataLabel">Assigned</span>
            <strong>{formatCurrency(totals.totalAssigned, cfg.currency)}</strong>
          </div>
          <div className="data-panel inlineMetric">
            <span className="dataLabel">Available to Assign</span>
            <strong>{formatCurrency(totals.toBeBudgeted, cfg.currency)}</strong>
          </div>
        </div>

        <div className="tableWrap card desktopDataTable premiumTableWrap">
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
      </section>

      <div className="mobileDataList">
        {rows.length === 0 ? <div className="data-panel muted">No categories yet. Add bills/transactions first.</div> : null}
        {rows.map((r) => (
          <article key={`budget-${r.name}`} className="data-panel dataItem">
            <div className="dataItemHeader">
              <h3 className="dataItemTitle">{r.name}</h3>
            </div>
            <div className="summaryGrid two">
              <label className="summaryCell">
                <span className="dataLabel">Assigned</span>
                <input
                  type="number"
                  value={r.assigned}
                  onChange={(e) => setAssignedDraft({ ...assignedDraft, [r.name]: e.target.value })}
                />
              </label>
              <div className="summaryCell">
                <span className="dataLabel">Activity</span>
                <strong>{formatCurrency(r.activity, cfg.currency)}</strong>
              </div>
              <div className="summaryCell">
                <span className="dataLabel">Available</span>
                <strong>{formatCurrency(r.available, cfg.currency)}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
