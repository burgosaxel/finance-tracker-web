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
    const recurringActive = (recurringPayments || [])
      .filter((entry) => entry?.active !== false && entry?.status !== "ignored")
      .sort((a, b) => {
        const left = a?.nextExpectedDate?.toDate ? a.nextExpectedDate.toDate().getTime() : Number.MAX_SAFE_INTEGER;
        const right = b?.nextExpectedDate?.toDate ? b.nextExpectedDate.toDate().getTime() : Number.MAX_SAFE_INTEGER;
        return left - right;
      });
    const recurringConfirmed = recurringActive.filter((entry) => entry.status === "confirmed");
    const recurringSuggested = recurringActive.filter((entry) => entry.status !== "confirmed");

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
      creditCardDebt,
      loanDebt,
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
      recurringActive,
      recurringConfirmed,
      recurringSuggested,
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
    recurringPayments,
    transactions,
  ]);

  return (
    <div className="page">
      <section className="card section pageHero">
        <div className="pageHeader">
          <div className="pageHeaderContent">
            <div className="pageEyebrow">Financial command center</div>
            <h2>Dashboard</h2>
            <p className="muted pageIntro">
              A structured view of balance-sheet health, this month's obligations, and the operational signals that need attention.
            </p>
          </div>
        </div>
      </section>

      <section className="dashboardSection">
        <div className="sectionHeader">
          <div>
            <h3>Financial Overview</h3>
            <div className="muted compactSubtext">The highest-value metrics in the workspace, emphasized first.</div>
          </div>
        </div>
        <div className="dashboardHeroGrid">
          <StatCard
            className="heroStat heroStatPrimary"
            label="Net Worth"
            value={formatCurrency(summary.netWorth, cfg.currency)}
            subtitle={`Cash ${formatCurrency(summary.totalCash, cfg.currency)} | Debt ${formatCurrency(summary.totalDebt, cfg.currency)}`}
          />
          <StatCard
            className="heroStat"
            label="Total Cash"
            value={formatCurrency(summary.totalCash, cfg.currency)}
            subtitle={`Manual ${formatCurrency(summary.manualCash, cfg.currency)} | Linked ${formatCurrency(summary.linkedCash, cfg.currency)}`}
          />
          <StatCard
            className="heroStat heroStatDanger"
            label="Total Debt"
            value={formatCurrency(summary.totalDebt, cfg.currency)}
            subtitle={`Cards ${formatCurrency(summary.creditCardDebt, cfg.currency)} | Loans ${formatCurrency(summary.loanDebt, cfg.currency)}`}
          />
        </div>
      </section>

      <section className="dashboardSection">
        <div className="sectionHeader">
          <div>
            <h3>Monthly Overview</h3>
            <div className="muted compactSubtext">This month's income, required bills, and unpaid obligations.</div>
          </div>
        </div>
        <div className="dashboardMetricGrid">
          <StatCard label="This Month Income" value={formatCurrency(summary.monthIncome, cfg.currency)} />
          <StatCard label="Bills Due This Month" value={formatCurrency(summary.monthBills, cfg.currency)} />
          <StatCard label="Bills Remaining" value={formatCurrency(summary.cashflow.totalBillsUnpaid, cfg.currency)} />
        </div>
      </section>

      <section className="dashboardSection">
        <div className="sectionHeader">
          <div>
            <h3>Financial Health</h3>
            <div className="muted compactSubtext">Operational metrics that affect leverage and month-end position.</div>
          </div>
        </div>
        <div className="dashboardMetricGrid">
          <StatCard label="Credit Utilization" value={formatPercent(summary.utilization)} />
          <StatCard
            label="Projected Month End Balance"
            value={formatCurrency(summary.cashflow.projectedRemaining, cfg.currency)}
          />
          <StatCard
            label="Monthly Outflow"
            value={formatCurrency(summary.transactionCashFlow.outflow, cfg.currency)}
          />
        </div>
      </section>

      <section className="dashboardSection">
        <div className="sectionHeader">
          <div>
            <h3>Insights</h3>
            <div className="muted compactSubtext">Recurring patterns, overdue items, upcoming bills, and recent activity.</div>
          </div>
        </div>
        <div className="dashboardInsightsGrid">
          <section className="card section insightCard">
            <div className="sectionHeader">
              <div>
                <h4>Recurring Items Detected</h4>
                <div className="muted compactSubtext">
                  {summary.recurringConfirmed.length} confirmed | {summary.recurringSuggested.length} suggested
                </div>
              </div>
              <span className="statusBadge subtle">{summary.recurringActive.length}</span>
            </div>
            {summary.recurringActive.length === 0 ? (
              <div className="muted">Recurring candidates will appear after Plaid transaction syncs.</div>
            ) : (
              <ul className="cleanList">
                {summary.recurringActive.slice(0, 4).map((entry) => (
                  <li key={entry.recurringId || entry.id} className="listRow compactTriplet">
                    <span>
                      {entry.displayName || entry.merchantName}
                      <div className="muted">
                        {entry.status === "confirmed" ? "Confirmed" : "Suggested"}
                        {entry.linkedManualType ? ` | linked to ${entry.linkedManualType}` : ""}
                      </div>
                    </span>
                    <span>
                      {entry.cadenceGuess || "unknown"}
                      <div className="muted">{entry.typeGuess || "unknown"}</div>
                    </span>
                    <strong>{formatCurrency(entry.averageAmount, cfg.currency)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card section insightCard">
            <div className="sectionHeader">
              <div>
                <h4>Past Due Bills</h4>
                <div className="muted compactSubtext">Unpaid bills already past their due date.</div>
              </div>
              <span className={`statusBadge ${summary.pastDue.length ? "" : "subtle"}`}>{summary.pastDue.length}</span>
            </div>
            {loadError ? <div className="errorText">{loadError}</div> : null}
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
          </section>

          <section className="card section insightCard">
            <div className="sectionHeader">
              <div>
                <h4>Upcoming Bills</h4>
                <div className="muted compactSubtext">Due in the next 7 days, with a look ahead to the rest of the month.</div>
              </div>
              <span className="statusBadge subtle">{summary.dueSoon.length}</span>
            </div>
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
            <div className="muted compactSubtext" style={{ marginTop: 8 }}>
              Due later this month: {summary.dueLater.length}
            </div>
          </section>

          <section className="card section insightCard">
            <div className="sectionHeader">
              <div>
                <h4>Recent Transactions</h4>
                <div className="muted compactSubtext">Latest synced bank activity from linked accounts.</div>
              </div>
              <span className="statusBadge subtle">{summary.recentSyncedTransactions.length}</span>
            </div>
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
        </div>
      </section>

      <section className="dashboardSection">
        <div className="sectionHeader">
          <div>
            <h3>Operational Snapshot</h3>
            <div className="muted compactSubtext">Cash flow detail, upcoming events, utilization pressure, and category spend.</div>
          </div>
        </div>
        <div className="twoCol">
          <section className="card section">
            <h4>Cashflow Snapshot</h4>
            <ul className="cleanList">
              <li className="listRow">
                <span>Income expected</span>
                <strong>{formatCurrency(summary.cashflow.totalIncomeExpected, cfg.currency)}</strong>
              </li>
              <li className="listRow">
                <span>Income received</span>
                <strong>{formatCurrency(summary.cashflow.totalIncomeReceived, cfg.currency)}</strong>
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
          </section>

          <section className="card section">
            <h4>Signals</h4>
            <h4 style={{ marginTop: 0 }}>Next Events</h4>
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
            <h4 style={{ marginTop: 14 }}>Credit Utilization Alerts</h4>
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
            <h4 style={{ marginTop: 14 }}>Top Spending</h4>
            {summary.topSpending.length === 0 ? (
              <div className="muted">No synced spending categories for this month yet.</div>
            ) : (
              <ul className="cleanList">
                {summary.topSpending.map((entry) => (
                  <li key={entry.label || entry.category} className="listRow compactTriplet">
                    <span>{entry.label || entry.category}</span>
                    <span>This month</span>
                    <strong>{formatCurrency(entry.amount, cfg.currency)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
