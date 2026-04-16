import React, { useMemo } from "react";
import { routeHref } from "../lib/hashRouter";
import PageHeader from "../components/ui/PageHeader";
import SectionHeader from "../components/ui/SectionHeader";
import SurfaceCard from "../components/ui/SurfaceCard";
import InsightCard from "../components/ui/InsightCard";
import Icon from "../components/ui/Icons";
import { AccountRow, TransactionRow } from "../components/ui/Rows";
import { getAutomationReviewSummary, getTransactionDisplayName } from "../lib/automation";
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

function formatDayLabel(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function daysUntil(target, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function relativeDue(target, now = new Date()) {
  const delta = daysUntil(target, now);
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta > 1) return `in ${delta} days`;
  if (delta === -1) return "yesterday";
  return `${Math.abs(delta)} days ago`;
}

function makeSparkline(values) {
  const max = Math.max(...values, 1);
  return values.map((value, index) => ({
    id: `${index}-${value}`,
    height: `${Math.max(18, (value / max) * 100)}%`,
  }));
}

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
    const manualAccounts = data.accounts || [];
    const linkedAccounts = data.linkedAccounts || [];
    const creditCards = data.creditCards || [];
    const loans = data.loans || [];
    const manualCash = manualAccounts.reduce((sum, account) => sum + safeNumber(account.balance, 0), 0);
    const linkedCash = linkedAccounts
      .filter((account) => account.type !== "credit")
      .reduce((sum, account) => sum + safeNumber(account.currentBalance, 0), 0);
    const savings = [...manualAccounts, ...linkedAccounts]
      .filter((account) => String(account.type || "").includes("sav"))
      .reduce((sum, account) => sum + safeNumber(account.balance ?? account.currentBalance, 0), 0);
    const investments = [...manualAccounts, ...linkedAccounts]
      .filter((account) => /invest|broker|ira/i.test(String(account.type || account.subtype || account.name || "")))
      .reduce((sum, account) => sum + safeNumber(account.balance ?? account.currentBalance, 0), 0);
    const totalCash = manualCash + linkedCash;
    const cardBalance = creditCards.reduce((sum, card) => sum + Math.max(0, safeNumber(card.balance, 0)), 0);
    const loanBalance = loans.reduce((sum, loan) => sum + Math.max(0, safeNumber(loan.balance, 0)), 0);
    const totalDebt = cardBalance + loanBalance;
    const cashflow = computeMonthTotals(bills, incomes, { now });
    const txCashflow = summarizeCashFlowFromTransactions(transactions, currentMonth);
    const topSpending = summarizeSpendingByCategory(transactions, currentMonth, 4);
    const recentTransactions = getRecentSyncedTransactions(transactions, 4);
    const automationReview = getAutomationReviewSummary({ bills, income: incomes, transactions });
    const dueSoon = getBillsDueWithinDays(bills, 7, now);
    const dueLater = getBillsDueLaterThisMonth(bills, now, 7);
    const pastDue = getPastDueBills(bills, now);
    const nextIncome = cashflow.nextExpectedIncome
      ? {
          label: cashflow.nextExpectedIncome.source || cashflow.nextExpectedIncome.name || "Paycheck",
          date: getIncomePayDate(cashflow.nextExpectedIncome, now),
          amount: safeNumber(
            cashflow.nextExpectedIncome.amount ?? cashflow.nextExpectedIncome.expectedAmount,
            0
          ),
        }
      : null;
    const nextBill = cashflow.nextDueBill
      ? {
          label: cashflow.nextDueBill.merchant || cashflow.nextDueBill.name || "Upcoming bill",
          date: getBillDueDate(cashflow.nextDueBill, now),
          amount: safeNumber(cashflow.nextDueBill.amount, 0),
        }
      : null;

    const monthSpend = txCashflow.outflow;
    const trendBase = Math.max(txCashflow.inflow || 1, 1);
    const spendTrend = monthSpend / trendBase;
    const spark = makeSparkline([
      txCashflow.inflow * 0.24,
      monthSpend * 0.46,
      monthSpend * 0.71,
      monthSpend * 0.58,
      monthSpend * 0.82,
      monthSpend * 0.9,
      monthSpend || 12,
    ]);

    return {
      totalCash,
      cardBalance,
      totalDebt,
      savings,
      investments,
      netCash: totalCash - cardBalance,
      dueSoon,
      dueLater,
      pastDue,
      cashflow,
      txCashflow,
      topSpending,
      recentTransactions,
      automationReview,
      nextIncome,
      nextBill,
      monthSpend,
      spendTrend,
      spark,
      recurringPaymentsPreview: (recurringPayments || []).slice(0, 3),
    };
  }, [bills, currentMonth, data.accounts, data.creditCards, data.linkedAccounts, data.loans, incomes, now, recurringPayments, transactions]);

  const accountRows = [
    { icon: "wallet", label: "Checking", value: formatCurrency(summary.totalCash, cfg.currency), detail: "Manual and linked cash" },
    { icon: "card", label: "Card Balance", value: formatCurrency(summary.cardBalance, cfg.currency), detail: "Open revolving balances" },
    { icon: "cash", label: "Net Cash", value: formatCurrency(summary.netCash, cfg.currency), detail: "Cash after card balances" },
    { icon: "savings", label: "Savings", value: formatCurrency(summary.savings, cfg.currency), detail: "Reserve accounts" },
    { icon: "investment", label: "Investments", value: formatCurrency(summary.investments, cfg.currency), detail: "Long-term holdings" },
  ];

  const upcomingCards = [
    summary.nextIncome && {
      id: "income",
      eyebrow: "Next paycheck",
      title: summary.nextIncome.label,
      amount: formatCurrency(summary.nextIncome.amount, cfg.currency),
      detail: relativeDue(summary.nextIncome.date, now),
      icon: "income",
    },
    summary.nextBill && {
      id: "bill",
      eyebrow: "Due soon",
      title: summary.nextBill.label,
      amount: formatCurrency(summary.nextBill.amount, cfg.currency),
      detail: relativeDue(summary.nextBill.date, now),
      icon: "calendar",
    },
    summary.pastDue[0] && {
      id: "past-due",
      eyebrow: "Needs attention",
      title: summary.pastDue[0].merchant || summary.pastDue[0].name,
      amount: formatCurrency(summary.pastDue[0].amount, cfg.currency),
      detail: `${Math.abs(daysUntil(summary.pastDue[0].nextDueDate, now))} day${Math.abs(daysUntil(summary.pastDue[0].nextDueDate, now)) === 1 ? "" : "s"} overdue`,
      icon: "warning",
    },
  ].filter(Boolean);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Today"
        title={formatDayLabel(now)}
        subtitle="BudgetCommand keeps cash, recurring expenses, and the latest activity in one place."
        left={
          <a href={routeHref("settings")} className="iconButton" aria-label="Open more">
            <Icon name="menu" size={18} />
          </a>
        }
        right={
          <button type="button" className="iconButton" aria-label="Notifications">
            <Icon name="bell" size={18} />
          </button>
        }
      />

      <SurfaceCard className="heroCard">
        <div className="sectionEyebrow">Monthly Snapshot</div>
        <div className="heroValue">{formatCurrency(summary.monthSpend, cfg.currency)}</div>
        <div className="heroSubline">
          <span className={summary.spendTrend > 0.75 ? "statusPill warning" : "statusPill success"}>
            {summary.spendTrend > 0.75 ? "Higher spend pace" : "Controlled spend pace"}
          </span>
          <span>{formatCurrency(summary.txCashflow.inflow, cfg.currency)} income landed this month</span>
        </div>
        <div className="sparkline">
          {summary.spark.map((bar) => (
            <div key={bar.id} className="sparkBar" style={{ height: bar.height }} />
          ))}
        </div>
        <div className="heroFooter">
          <div className="heroFootCell">
            <div className="sectionEyebrow">Projected month end</div>
            <strong>{formatCurrency(summary.cashflow.projectedRemaining, cfg.currency)}</strong>
          </div>
          <div className="heroFootCell">
            <div className="sectionEyebrow">Payday signal</div>
            <strong>
              {summary.nextIncome
                ? `${summary.nextIncome.label} ${relativeDue(summary.nextIncome.date, now)}`
                : "No upcoming paycheck found"}
            </strong>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader eyebrow="Accounts" title="Money at a glance" subtitle="A grouped summary of core balances across your workspace." />
        <div className="metricList">
          {accountRows.map((row) => (
            <AccountRow key={row.label} {...row} chevron />
          ))}
        </div>
      </SurfaceCard>

      <div>
        <SectionHeader
          eyebrow="Upcoming"
          title="What’s next"
          subtitle="Fast-glance cards for the next money events."
        />
        <div className="horizontalScroll">
          {upcomingCards.length === 0 ? (
            <SurfaceCard className="miniCard">
              <div className="sectionEyebrow">Nothing queued</div>
              <div className="sectionTitle">You’re clear for now</div>
              <div className="sectionSubtitle">Upcoming paychecks and bills will appear here as your recurring items sync.</div>
            </SurfaceCard>
          ) : (
            upcomingCards.map((card) => (
              <SurfaceCard key={card.id} className="miniCard">
                <div className="sectionEyebrow">{card.eyebrow}</div>
                <div className="sectionTitle" style={{ marginTop: 6 }}>{card.title}</div>
                <div className="heroSubline" style={{ marginTop: 12 }}>
                  <span className="upcomingBadge">
                    <Icon name={card.icon} size={14} />
                    {card.detail}
                  </span>
                </div>
                <div className="heroValue" style={{ fontSize: "1.8rem", marginTop: 14 }}>{card.amount}</div>
              </SurfaceCard>
            ))
          )}
        </div>
      </div>

      <div className="stackedList">
        <InsightCard
          icon="recurring"
          tone="accent"
          eyebrow="Actionable"
          title="Review subscriptions and recurring charges"
          body={
            summary.recurringPaymentsPreview.length > 0
              ? `${summary.recurringPaymentsPreview.length} recurring merchants are ready for review.`
              : "Plaid recurring candidates will appear here after sync."
          }
          action={<a href={routeHref("bills-income")} className="pillButton">Open recurring</a>}
        />
        <InsightCard
          icon="tag"
          eyebrow="Clean-up"
          title="Categorize the latest transactions"
          body={
            summary.automationReview.totalReviews > 0
              ? `${summary.automationReview.totalReviews} items need review across recurring, transfers, or category cleanup.`
              : summary.recentTransactions.length > 0
                ? "Stay ahead of merchant cleanup and category drift."
                : "Link an account or add transactions to begin review."
          }
          action={<a href={routeHref("transactions")} className="pillButton">Review</a>}
        />
        <InsightCard
          icon="budget"
          eyebrow="Planning"
          title="Budget health and cash flow forecast"
          body={`You have ${summary.dueSoon.length} bills due in the next 7 days and ${summary.dueLater.length} later this month.`}
          action={<a href={routeHref("budget")} className="pillButton">See spending</a>}
        />
      </div>

      <SurfaceCard>
        <SectionHeader
          eyebrow="Recent Activity"
          title="Latest synced transactions"
          subtitle="A quick preview before you dive into the full ledger."
          action={<a href={routeHref("transactions")} className="pillButton">View all</a>}
        />
        {summary.recentTransactions.length === 0 ? (
          <div className="sectionSubtitle">Link an account to see recent bank activity here.</div>
        ) : (
          <div className="stackedList">
            {summary.recentTransactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                name={getTransactionDisplayName(transaction)}
                subtitle={`${transaction.date || "-"} • ${transaction.source || "synced"}`}
                amount={formatCurrency(transaction.amount, cfg.currency)}
                amountTone={safeNumber(transaction.amount, 0) < 0 ? "negative" : "positive"}
                icon="transactions"
              />
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader
          eyebrow="Spend Focus"
          title="Top categories and recurring signals"
          subtitle={loadError || "Consumer-style summaries powered by your current month transactions."}
        />
        <div className="overviewGrid">
          <div className="stackedList">
            {summary.topSpending.length === 0 ? (
              <div className="sectionSubtitle">No spending categories for this month yet.</div>
            ) : (
              summary.topSpending.map((entry) => (
                <TransactionRow
                  key={entry.category}
                  name={entry.category}
                  subtitle={`Top category • ${formatPercent((entry.amount / Math.max(summary.monthSpend || 1, 1)) * 100)}`}
                  amount={formatCurrency(entry.amount, cfg.currency)}
                  amountTone="negative"
                  icon="spending"
                />
              ))
            )}
          </div>
          <div className="stackedList">
            {summary.recurringPaymentsPreview.length === 0 ? (
              <div className="sectionSubtitle">Recurring payment candidates will appear here after synced history builds up.</div>
            ) : (
              summary.recurringPaymentsPreview.map((entry) => (
                <TransactionRow
                  key={entry.recurringId || entry.id}
                  name={entry.merchantName}
                  subtitle={entry.cadenceGuess || "Recurring candidate"}
                  amount={formatCurrency(entry.averageAmount, cfg.currency)}
                  amountTone="negative"
                  icon="recurring"
                />
              ))
            )}
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}
