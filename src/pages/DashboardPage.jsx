import React, { useMemo } from "react";
import StatCard from "../components/StatCard";
import {
  computeMonthTotals,
  DEFAULT_SETTINGS,
  formatCurrency,
  formatPercent,
  getBillDueDate,
  getBillsDueLaterThisMonth,
  getBillsDueWithinDays,
  getIncomePayDate,
  monthKey,
  safeNumber,
} from "../lib/finance";

export default function DashboardPage({ data, settings, bills = [], incomes = [], loadError }) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const now = new Date();
  const currentMonth = monthKey(now);

  const summary = useMemo(() => {
    const totalCash = (data.accounts || []).reduce((sum, a) => sum + safeNumber(a.balance, 0), 0);
    const totalDebt = (data.creditCards || []).reduce((sum, c) => sum + Math.max(0, safeNumber(c.balance, 0)), 0);
    const totalLimit = (data.creditCards || []).reduce((sum, c) => sum + Math.max(0, safeNumber(c.limit, 0)), 0);
    const utilization = totalLimit > 0 ? (totalDebt / totalLimit) * 100 : 0;
    const monthIncome = (incomes || [])
      .filter((i) => monthKey(getIncomePayDate(i, now)) === currentMonth)
      .reduce((sum, i) => sum + safeNumber(i.amount ?? i.expectedAmount, 0), 0);
    const monthBills = (bills || [])
      .filter((b) => monthKey(getBillDueDate(b, now)) === currentMonth)
      .reduce((sum, b) => sum + safeNumber(b.amount, 0), 0);

    const dueSoon = getBillsDueWithinDays(bills, 7, now);
    const dueLater = getBillsDueLaterThisMonth(bills, now, 7);
    const cashflow = computeMonthTotals(bills, incomes, { now });

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
      dueLater,
      cashflow,
      overUtilized,
    };
  }, [bills, cfg.utilizationThreshold, currentMonth, data.accounts, data.creditCards, incomes, now]);

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
        <StatCard label="Bills Remaining" value={formatCurrency(summary.cashflow.totalBillsUnpaid, cfg.currency)} />
        <StatCard label="Income Received" value={formatCurrency(summary.cashflow.totalIncomeReceived, cfg.currency)} />
        <StatCard
          label="Projected Month End"
          value={formatCurrency(summary.cashflow.projectedRemaining, cfg.currency)}
        />
      </div>

      <div className="twoCol">
        <section className="card section">
          <h3>Bills due in next 7 days</h3>
          {loadError ? <div className="errorText">{loadError}</div> : null}
          {summary.dueSoon.length === 0 ? (
            <div className="muted">No bills due in the next week.</div>
          ) : (
            <ul className="cleanList">
              {summary.dueSoon.map((b) => (
                <li key={b.id} className="listRow compactTriplet">
                  <span>{b.merchant || b.name}</span>
                  <span>{new Date(b.nextDueDate).toLocaleDateString()}</span>
                  <strong>{formatCurrency(b.amount, cfg.currency)}</strong>
                </li>
              ))}
            </ul>
          )}
          <div className="muted" style={{ marginTop: 8 }}>
            Due later this month: {summary.dueLater.length}
          </div>
        </section>

        <section className="card section">
          <h3>Cashflow Snapshot</h3>
          <ul className="cleanList">
            <li className="listRow">
              <span>Income expected</span>
              <strong>{formatCurrency(summary.cashflow.totalIncomeExpected, cfg.currency)}</strong>
            </li>
            <li className="listRow">
              <span>Bills paid</span>
              <strong>{formatCurrency(summary.cashflow.totalBillsPaid, cfg.currency)}</strong>
            </li>
            <li className="listRow">
              <span>Bills unpaid</span>
              <strong>{formatCurrency(summary.cashflow.totalBillsUnpaid, cfg.currency)}</strong>
            </li>
            <li className="listRow">
              <span>Remaining from received paychecks</span>
              <strong>{formatCurrency(summary.cashflow.remainingFromReceived, cfg.currency)}</strong>
            </li>
            <li className="listRow">
              <span>Projected remaining by month end</span>
              <strong>{formatCurrency(summary.cashflow.projectedRemaining, cfg.currency)}</strong>
            </li>
          </ul>
          <h4 style={{ marginTop: 10 }}>Next events</h4>
          {summary.cashflow.events.length === 0 ? (
            <div className="muted">No upcoming events this month.</div>
          ) : (
            <ul className="cleanList">
              {summary.cashflow.events.map((e) => (
                <li key={e.id} className="listRow compactTriplet">
                  <span>{e.type === "income" ? `Paycheck: ${e.label}` : `Bill: ${e.label}`}</span>
                  <span>{e.date.toLocaleDateString()}</span>
                  <strong>{formatCurrency(e.amount, cfg.currency)}</strong>
                </li>
              ))}
            </ul>
          )}
          <h4 style={{ marginTop: 10 }}>Credit utilization alerts</h4>
          {summary.overUtilized.length === 0 ? (
            <div className="muted">All cards are under the alert threshold.</div>
          ) : (
            <ul className="cleanList">
              {summary.overUtilized.map((c) => (
                <li key={c.id} className="listRow compactTriplet">
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
