import React, { useMemo } from "react";
import StatCard from "../components/StatCard";
import {
  computeMonthTotals,
  DEFAULT_SETTINGS,
  formatCurrency,
  formatPercent,
  getEffectiveTransactionCategory,
  getBillDueDate,
  getBillsDueLaterThisMonth,
  getBillsDueWithinDays,
  getIncomePayDate,
  getPastDueBills,
  getRecentSyncedTransactions,
  monthKey,
  safeNumber,
  summarizeCashFlowFromTransactions,
  summarizeSpendingByCategory,
} from "../lib/finance";

export default function DashboardPage({
  data,
  settings,
  bills = [],
  incomes = [],
  transactions = [],
  recurringPayments = [],
  loadError,
}) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const now = new Date();
  const currentMonth = monthKey(now);

  const summary = useMemo(() => {
    const manualCash = (data.accounts || []).reduce((sum, a) => sum + safeNumber(a.balance, 0), 0);
    const linkedCash = (data.linkedAccounts || [])
      .filter((account) => account.type !== "credit")
      .reduce((sum, account) => sum + safeNumber(account.currentBalance, 0), 0);
    const totalCash = manualCash + linkedCash;
    const creditCardDebt = (data.creditCards || []).reduce(
      (sum, c) => sum + Math.max(0, safeNumber(c.balance, 0)),
      0
    );
    const loanDebt = (data.loans || []).reduce(
      (sum, loan) => sum + Math.max(0, safeNumber(loan.balance, 0)),
      0
    );
    const totalDebt = creditCardDebt + loanDebt;
    const totalLimit = (data.creditCards || []).reduce((sum, c) => sum + Math.max(0, safeNumber(c.limit, 0)), 0);
    const utilization = totalLimit > 0 ? (creditCardDebt / totalLimit) * 100 : 0;
    const monthIncome = (incomes || [])
      .filter((i) => monthKey(getIncomePayDate(i, now)) === currentMonth)
      .reduce((sum, i) => sum + safeNumber(i.amount ?? i.expectedAmount, 0), 0);
    const monthBills = (bills || [])
      .filter((b) => monthKey(getBillDueDate(b, now)) === currentMonth)
      .reduce((sum, b) => sum + safeNumber(b.amount, 0), 0);

    const pastDue = getPastDueBills(bills, now);
    const dueSoon = getBillsDueWithinDays(bills, 7, now);
    const dueLater = getBillsDueLaterThisMonth(bills, now, 7);
    const cashflow = computeMonthTotals(bills, incomes, { now });
    const transactionCashFlow = summarizeCashFlowFromTransactions(transactions, currentMonth);
    const topSpending = summarizeSpendingByCategory(transactions, currentMonth, 5);
    const recentSyncedTransactions = getRecentSyncedTransactions(transactions, 5);

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
      manualCash,
      linkedCash,
      totalDebt,
      netWorth: totalCash - totalDebt,
      monthIncome,
      monthBills,
      utilization,
      pastDue,
      dueSoon,
      dueLater,
      cashflow,
      transactionCashFlow,
      topSpending,
      recentSyncedTransactions,
      overUtilized,
    };
  }, [
    bills,
    cfg.utilizationThreshold,
    currentMonth,
    data.accounts,
    data.creditCards,
    data.linkedAccounts,
    data.loans,
    incomes,
    now,
    transactions,
  ]);

  return (
    <div className="page">
      <h2>Dashboard</h2>
      <div className="statsGrid">
        <StatCard
          label="Total Cash"
          value={formatCurrency(summary.totalCash, cfg.currency)}
          subtitle={`Manual ${formatCurrency(summary.manualCash, cfg.currency)} | Linked ${formatCurrency(summary.linkedCash, cfg.currency)}`}
        />
        <StatCard label="Total Debt" value={formatCurrency(summary.totalDebt, cfg.currency)} />
        <StatCard label="Net Worth" value={formatCurrency(summary.netWorth, cfg.currency)} />
        <StatCard label="This Month Income" value={formatCurrency(summary.monthIncome, cfg.currency)} />
        <StatCard label="This Month Bills Due" value={formatCurrency(summary.monthBills, cfg.currency)} />
        <StatCard label="Credit Utilization" value={formatPercent(summary.utilization)} />
        <StatCard label="Bills Remaining" value={formatCurrency(summary.cashflow.totalBillsUnpaid, cfg.currency)} />
        <StatCard label="Income Received" value={formatCurrency(summary.cashflow.totalIncomeReceived, cfg.currency)} />
        <StatCard label="Linked Cash" value={formatCurrency(summary.linkedCash, cfg.currency)} />
        <StatCard
          label="Projected Month End"
          value={formatCurrency(summary.cashflow.projectedRemaining, cfg.currency)}
        />
        <StatCard
          label="This Month Outflow"
          value={formatCurrency(summary.transactionCashFlow.outflow, cfg.currency)}
        />
      </div>

      <div className="twoCol">
        <section className="card section">
          <h3>Unpaid bills</h3>
          {loadError ? <div className="errorText">{loadError}</div> : null}
          <h4 style={{ marginTop: 4 }}>Past Due</h4>
          {summary.pastDue.length === 0 ? <div className="muted">No past-due unpaid bills.</div> : null}
          {summary.pastDue.length > 0 ? (
            <ul className="cleanList">
              {summary.pastDue.map((b) => (
                <li key={b.id} className="listRow compactTriplet">
                  <span>{b.merchant || b.name}</span>
                  <span>{new Date(b.nextDueDate).toLocaleDateString()}</span>
                  <strong>{formatCurrency(b.amount, cfg.currency)}</strong>
                </li>
              ))}
            </ul>
          ) : null}
          <h4 style={{ marginTop: 10 }}>Due in next 7 days</h4>
          {summary.dueSoon.length === 0 ? <div className="muted">No bills due in the next week.</div> : null}
          {summary.dueSoon.length > 0 ? (
            <ul className="cleanList">
              {summary.dueSoon.map((b) => (
                <li key={`soon-${b.id}`} className="listRow compactTriplet">
                  <span>{b.merchant || b.name}</span>
                  <span>{new Date(b.nextDueDate).toLocaleDateString()}</span>
                  <strong>{formatCurrency(b.amount, cfg.currency)}</strong>
                </li>
              ))}
            </ul>
          ) : null}
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

      <div className="twoCol">
        <section className="card section">
          <h3>Recent synced activity</h3>
          {summary.recentSyncedTransactions.length === 0 ? (
            <div className="muted">Link an account to see recent bank activity here.</div>
          ) : (
            <ul className="cleanList">
              {summary.recentSyncedTransactions.map((transaction) => (
                <li key={transaction.id} className="listRow compactTriplet">
                  <span>{transaction.merchantName || transaction.payee || transaction.name}</span>
                  <span>{transaction.date || "-"}</span>
                  <strong>{formatCurrency(transaction.amount, cfg.currency)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card section">
          <h3>Spending and recurring</h3>
          <div className="muted" style={{ marginBottom: 8 }}>
            Category summary uses synced transaction data when available and respects manual category overrides.
          </div>
          {summary.topSpending.length === 0 ? (
            <div className="muted">No synced spending categories for this month yet.</div>
          ) : (
            <ul className="cleanList">
              {summary.topSpending.map((entry) => (
                <li key={entry.category} className="listRow compactTriplet">
                  <span>{entry.category}</span>
                  <span>This month</span>
                  <strong>{formatCurrency(entry.amount, cfg.currency)}</strong>
                </li>
              ))}
            </ul>
          )}
          <h4 style={{ marginTop: 10 }}>Recurring payment candidates</h4>
          {(recurringPayments || []).length === 0 ? (
            <div className="muted">Recurring candidates will appear after Plaid transaction syncs.</div>
          ) : (
            <ul className="cleanList">
              {recurringPayments.slice(0, 5).map((entry) => (
                <li key={entry.recurringId || entry.id} className="listRow compactTriplet">
                  <span>{entry.merchantName}</span>
                  <span>{entry.cadenceGuess || getEffectiveTransactionCategory(entry)}</span>
                  <strong>{formatCurrency(entry.averageAmount, cfg.currency)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
