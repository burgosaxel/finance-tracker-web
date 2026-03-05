import React, { useMemo } from "react";
import StatCard from "../components/StatCard";
import {
  billStatus,
  computeNextDueDate,
  DEFAULT_SETTINGS,
  formatCurrency,
  formatPercent,
  monthKey,
  safeNumber,
} from "../lib/finance";

export default function DashboardPage({ data, settings }) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const now = new Date();
  const currentMonth = monthKey(now);

  const summary = useMemo(() => {
    const totalCash = (data.accounts || []).reduce((sum, a) => sum + safeNumber(a.balance, 0), 0);
    const totalDebt = (data.creditCards || []).reduce((sum, c) => sum + Math.max(0, safeNumber(c.balance, 0)), 0);
    const totalLimit = (data.creditCards || []).reduce((sum, c) => sum + Math.max(0, safeNumber(c.limit, 0)), 0);
    const utilization = totalLimit > 0 ? (totalDebt / totalLimit) * 100 : 0;
    const monthIncome = (data.income || [])
      .filter((i) => monthKey(new Date(i.nextPayDate || now)) === currentMonth)
      .reduce((sum, i) => sum + safeNumber(i.expectedAmount, 0), 0);
    const monthBills = (data.bills || [])
      .filter((b) => monthKey(computeNextDueDate(b.dueDay, now)) === currentMonth)
      .reduce((sum, b) => sum + safeNumber(b.amount, 0), 0);

    const dueSoon = (data.bills || [])
      .map((b) => ({ ...b, nextDueDate: computeNextDueDate(b.dueDay, now), status: billStatus(b, now) }))
      .filter((b) => b.status === "dueSoon")
      .sort((a, b) => a.nextDueDate - b.nextDueDate);

    const overUtilized = (data.creditCards || [])
      .map((c) => {
        const limit = safeNumber(c.limit, 0);
        const balance = safeNumber(c.balance, 0);
        return { ...c, util: limit > 0 ? (balance / limit) * 100 : 0 };
      })
      .filter((c) => c.util > cfg.utilizationThreshold)
      .sort((a, b) => b.util - a.util);

    return {
      totalCash,
      totalDebt,
      netWorth: totalCash - totalDebt,
      monthIncome,
      monthBills,
      utilization,
      dueSoon,
      overUtilized,
    };
  }, [cfg.utilizationThreshold, currentMonth, data.accounts, data.bills, data.creditCards, data.income]);

  return (
    <div className="page">
      <h2>Dashboard</h2>
      <div className="statsGrid">
        <StatCard label="Total Cash" value={formatCurrency(summary.totalCash, cfg.currency)} />
        <StatCard label="Total Debt" value={formatCurrency(summary.totalDebt, cfg.currency)} />
        <StatCard label="Net Worth" value={formatCurrency(summary.netWorth, cfg.currency)} />
        <StatCard label="This Month Income" value={formatCurrency(summary.monthIncome, cfg.currency)} />
        <StatCard label="This Month Bills Due" value={formatCurrency(summary.monthBills, cfg.currency)} />
        <StatCard label="Credit Utilization" value={formatPercent(summary.utilization)} />
      </div>

      <div className="twoCol">
        <section className="card section">
          <h3>Bills due in next 7 days</h3>
          {summary.dueSoon.length === 0 ? (
            <div className="muted">No bills due in the next week.</div>
          ) : (
            <ul className="cleanList">
              {summary.dueSoon.map((b) => (
                <li key={b.id} className="listRow">
                  <span>{b.name}</span>
                  <span>{new Date(b.nextDueDate).toLocaleDateString()}</span>
                  <strong>{formatCurrency(b.amount, cfg.currency)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card section">
          <h3>Credit utilization alerts</h3>
          {summary.overUtilized.length === 0 ? (
            <div className="muted">All cards are under the alert threshold.</div>
          ) : (
            <ul className="cleanList">
              {summary.overUtilized.map((c) => (
                <li key={c.id} className="listRow">
                  <span>{c.name}</span>
                  <span>{formatPercent(c.util)}</span>
                  <strong>{formatCurrency(c.balance, cfg.currency)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
