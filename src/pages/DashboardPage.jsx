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
import { TrendingUp, DollarSign, CreditCard, PiggyBank, Calendar, AlertTriangle, BarChart3, Wallet } from "lucide-react";

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
      <section className="dashboard-hero">
        <div className="dashboard-hero-intro">
          <div className="dashboard-kicker">Financial command center</div>
          <p className="dashboard-subtitle">
            A structured view of balance-sheet health, this month's obligations, and the operational signals that need attention.
          </p>
        </div>
        <h2 className="dashboard-title">Dashboard</h2>
      </section>

      <section className="section-block dashboardSection dashboardBlock dashboardBlockOverview">
        <div className="sectionHeader">
          <div>
            <h3 className="section-title">Financial Overview</h3>
            <div className="section-copy">The highest-value metrics in the workspace, emphasized first.</div>
          </div>
        </div>
        <div className="metric-grid-primary">
          <StatCard
            className="heroStat heroStatPrimary metric-card green-accent"
            icon={TrendingUp}
            label="Net Worth"
            value={formatCurrency(summary.netWorth, cfg.currency)}
            subtitle={`Cash ${formatCurrency(summary.totalCash, cfg.currency)} | Debt ${formatCurrency(summary.totalDebt, cfg.currency)}`}
          />
          <StatCard
            className="heroStat metric-card"
            icon={Wallet}
            label="Total Cash"
            value={formatCurrency(summary.totalCash, cfg.currency)}
            subtitle={`Manual ${formatCurrency(summary.manualCash, cfg.currency)} | Linked ${formatCurrency(summary.linkedCash, cfg.currency)}`}
          />
          <StatCard
            className="heroStat heroStatDanger metric-card red-accent"
            icon={CreditCard}
            label="Total Debt"
            value={formatCurrency(summary.totalDebt, cfg.currency)}
            subtitle={`Cards ${formatCurrency(summary.creditCardDebt, cfg.currency)} | Loans ${formatCurrency(summary.loanDebt, cfg.currency)}`}
          />
        </div>
      </section>

      <section className="section-block dashboardSection dashboardBlock dashboardBlockMonthly">
        <div className="sectionHeader">
          <div>
            <h3 className="section-title">Monthly Overview</h3>
            <div className="section-copy">This month's income, required bills, and unpaid obligations.</div>
          </div>
        </div>
        <div className="metric-grid-secondary">
          <StatCard icon={PiggyBank} className="metric-card green-accent" label="This Month Income" value={formatCurrency(summary.monthIncome, cfg.currency)} />
          <StatCard icon={Calendar} className="metric-card" label="Bills Due This Month" value={formatCurrency(summary.monthBills, cfg.currency)} />
          <StatCard icon={AlertTriangle} className="metric-card red-accent" label="Bills Remaining" value={formatCurrency(summary.cashflow.totalBillsUnpaid, cfg.currency)} />
        </div>
      </section>

      <section className="section-block dashboardSection dashboardBlock dashboardBlockHealth">
        <div className="sectionHeader">
          <div>
            <h3 className="section-title">Financial Health</h3>
            <div className="section-copy">Operational metrics that affect leverage and month-end position.</div>
          </div>
        </div>
        <div className="metric-grid-secondary">
          <StatCard icon={BarChart3} className="metric-card" label="Credit Utilization" value={formatPercent(summary.utilization)} />
          <StatCard
            icon={TrendingUp}
            className="metric-card green-accent"
            label="Projected Month End Balance"
            value={formatCurrency(summary.cashflow.projectedRemaining, cfg.currency)}
          />
          <StatCard
            icon={DollarSign}
            className="metric-card"
            label="Monthly Outflow"
            value={formatCurrency(summary.transactionCashFlow.outflow, cfg.currency)}
          />
        </div>
      </section>

      <section className="section-block dashboardSection dashboardBlock dashboardBlockInsights">
        <div className="sectionHeader">
          <div>
            <h3 className="section-title">Insights</h3>
            <div className="section-copy">Recurring patterns, overdue items, upcoming bills, and recent activity.</div>
          </div>
        </div>
        <div className="dashboardInsightsGrid">
          <section className="data-panel insightCard moduleRecurring">
            <div className="card-header">
              <div>
                <div className="panel-title">Recurring Items Detected</div>
                <div className="panel-copy">
                  {summary.recurringConfirmed.length} confirmed | {summary.recurringSuggested.length} suggested
                </div>
              </div>
              <span className="pill-count">{summary.recurringActive.length}</span>
            </div>
            {summary.recurringActive.length === 0 ? (
              <div className="muted">Recurring candidates will appear after Plaid transaction syncs.</div>
            ) : (
              <div className="row-list">
                {summary.recurringActive.slice(0, 4).map((entry) => (
                  <div key={entry.recurringId || entry.id} className="row-list-item">
                    <div>
                      <div className="primary">{entry.displayName || entry.merchantName}</div>
                      <div className="secondary">
                        {entry.status === "confirmed" ? "Confirmed" : "Suggested"}
                        {entry.linkedManualType ? ` | linked to ${entry.linkedManualType}` : ""}
                      </div>
                    </div>
                    <div className="secondary recurring-cadence-label">{`${entry.cadenceGuess || "unknown"} ${entry.typeGuess || "unknown"}`}</div>
                    <div className="amount">{formatCurrency(entry.averageAmount, cfg.currency)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="data-panel insightCard moduleAlert">
            <div className="card-header">
              <div>
                <div className="panel-title">Past Due Bills</div>
                <div className="panel-copy">Unpaid bills already past their due date.</div>
              </div>
              <span className={`pill-count ${summary.pastDue.length ? "status-danger" : ""}`}>{summary.pastDue.length}</span>
            </div>
            {loadError ? <div className="errorText">{loadError}</div> : null}
            {summary.pastDue.length === 0 ? <div className="muted">No past-due unpaid bills.</div> : null}
            {summary.pastDue.length > 0 ? (
              <div className="row-list">
                {summary.pastDue.map((b) => (
                  <div key={b.id} className="row-list-item">
                    <div className="primary">{b.merchant || b.name}</div>
                    <div className="secondary">{new Date(b.nextDueDate).toLocaleDateString()}</div>
                    <div className="amount negative">{formatCurrency(b.amount, cfg.currency)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="data-panel insightCard moduleUpcoming">
            <div className="card-header">
              <div>
                <div className="panel-title">Upcoming Bills</div>
                <div className="panel-copy">Due in the next 7 days, with a look ahead to the rest of the month.</div>
              </div>
              <span className="pill-count">{summary.dueSoon.length}</span>
            </div>
            {summary.dueSoon.length === 0 ? <div className="muted">No bills due in the next week.</div> : null}
            {summary.dueSoon.length > 0 ? (
              <div className="row-list">
                {summary.dueSoon.map((b) => (
                  <div key={`soon-${b.id}`} className="row-list-item">
                    <div className="primary">{b.merchant || b.name}</div>
                    <div className="secondary">{new Date(b.nextDueDate).toLocaleDateString()}</div>
                    <div className="amount negative">{formatCurrency(b.amount, cfg.currency)}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="panel-copy" style={{ marginTop: 8 }}>
              Due later this month: {summary.dueLater.length}
            </div>
          </section>

          <section className="data-panel insightCard moduleActivity">
            <div className="card-header">
              <div>
                <div className="panel-title">Recent Transactions</div>
                <div className="panel-copy">Latest synced bank activity from linked accounts.</div>
              </div>
              <span className="pill-count">{summary.recentSyncedTransactions.length}</span>
            </div>
            {summary.recentSyncedTransactions.length === 0 ? (
              <div className="muted">Link an account to see recent bank activity here.</div>
            ) : (
              <div className="row-list">
                {summary.recentSyncedTransactions.map((transaction) => (
                  <div key={transaction.id} className="row-list-item">
                    <div className="primary">{transaction.merchantName || transaction.payee || transaction.name}</div>
                    <div className="secondary">{transaction.date || "-"}</div>
                    <div className="amount">{formatCurrency(transaction.amount, cfg.currency)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      <section className="section-block dashboardSection dashboardBlock dashboardBlockSnapshot">
        <div className="sectionHeader">
          <div>
            <h3 className="section-title">Operational Snapshot</h3>
            <div className="section-copy">Cash flow detail, upcoming events, utilization pressure, and category spend.</div>
          </div>
        </div>
        <div className="twoCol">
          <section className="data-panel cashflow-snapshot">
            <div className="panel-title">Cashflow Snapshot</div>
            <div className="row-list">
              <div className="row-list-item"><div className="primary">Income expected</div><div /><div className="amount positive">{formatCurrency(summary.cashflow.totalIncomeExpected, cfg.currency)}</div></div>
              <div className="row-list-item"><div className="primary">Income received</div><div /><div className="amount positive">{formatCurrency(summary.cashflow.totalIncomeReceived, cfg.currency)}</div></div>
              <div className="row-list-item"><div className="primary">Bills paid</div><div /><div className="amount">{formatCurrency(summary.cashflow.totalBillsPaid, cfg.currency)}</div></div>
              <div className="row-list-item"><div className="primary">Bills unpaid</div><div /><div className="amount negative">{formatCurrency(summary.cashflow.totalBillsUnpaid, cfg.currency)}</div></div>
              <div className="row-list-item"><div className="primary">Remaining from received paychecks</div><div /><div className="amount positive">{formatCurrency(summary.cashflow.remainingFromReceived, cfg.currency)}</div></div>
              <div className="row-list-item"><div className="primary">Projected remaining by month end</div><div /><div className="amount positive">{formatCurrency(summary.cashflow.projectedRemaining, cfg.currency)}</div></div>
            </div>
          </section>

          <section className="data-panel signals-card">
            <div className="panel-title">Signals</div>
            <div className="section-block">
              <div>
                <div className="panel-title">Next Events</div>
                {summary.cashflow.events.length === 0 ? (
                  <div className="muted">No upcoming events this month.</div>
                ) : (
                  <div className="row-list">
                    {summary.cashflow.events.map((e) => (
                      <div key={e.id} className="row-list-item">
                        <div className="primary">{e.type === "income" ? `Paycheck: ${e.label}` : `Bill: ${e.label}`}</div>
                        <div className="secondary">{e.date.toLocaleDateString()}</div>
                        <div className={`amount ${e.type === "income" ? "positive" : "negative"}`}>{formatCurrency(e.amount, cfg.currency)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="panel-title">Credit Utilization Alerts</div>
                {summary.overUtilized.length === 0 ? (
                  <div className="muted">All cards are under the alert threshold.</div>
                ) : (
                  <div className="row-list">
                    {summary.overUtilized.map((c) => (
                      <div key={c.id} className="row-list-item">
                        <div className="primary">{c.name}</div>
                        <div className="secondary">{formatPercent(c.util)}</div>
                        <div className="amount negative">{formatCurrency(c.balance, cfg.currency)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="panel-title">Top Spending</div>
                {summary.topSpending.length === 0 ? (
                  <div className="muted">No synced spending categories for this month yet.</div>
                ) : (
                  <div className="row-list">
                    {summary.topSpending.map((entry) => (
                      <div key={entry.label || entry.category} className="row-list-item">
                        <div className="primary">{entry.label || entry.category}</div>
                        <div className="secondary">This month</div>
                        <div className="amount negative">{formatCurrency(entry.amount, cfg.currency)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}



