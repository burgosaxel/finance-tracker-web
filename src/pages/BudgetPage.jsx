import React, { useMemo, useState } from "react";
import PageHeader from "../components/ui/PageHeader";
import SectionHeader from "../components/ui/SectionHeader";
import SurfaceCard from "../components/ui/SurfaceCard";
import ChipTabs from "../components/ui/ChipTabs";
import InsightCard from "../components/ui/InsightCard";
import Icon from "../components/ui/Icons";
import { MetricRow, TransactionRow } from "../components/ui/Rows";
import { getBudgetDocIdForMonth, upsertEntity } from "../lib/db";
import {
  DEFAULT_SETTINGS,
  formatCurrency,
  getEffectiveTransactionCategory,
  monthKey,
  safeNumber,
} from "../lib/finance";

const PERIOD_OPTIONS = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
];

const BREAKDOWN_OPTIONS = [
  { id: "categories", label: "Categories" },
  { id: "tags", label: "Tags" },
];

function monthLabel(month) {
  const [year, num] = String(month).split("-");
  const date = new Date(Number(year), Number(num) - 1, 1);
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

const CATEGORY_COLORS = ["#55a6ff", "#1dd4b6", "#ffb84d", "#ff6b6b", "#9e7cff"];

export default function BudgetPage({ uid, budgets, bills, income, transactions, settings, onToast, onError }) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [period, setPeriod] = useState("month");
  const [breakdownMode, setBreakdownMode] = useState("categories");
  const [showFootnote, setShowFootnote] = useState(true);
  const [assignedDraft, setAssignedDraft] = useState({});

  const monthBudget = useMemo(
    () => (budgets || []).find((budget) => budget.id === selectedMonth) || { id: selectedMonth, categories: {} },
    [budgets, selectedMonth]
  );

  const scopedTransactions = useMemo(
    () =>
      (transactions || []).filter(
        (transaction) => String(transaction.date || "").slice(0, 7) === selectedMonth && !transaction.removed
      ),
    [selectedMonth, transactions]
  );

  const monthIncome = useMemo(
    () =>
      (income || [])
        .filter((item) => String(item.nextPayDate || item.payDate || "").slice(0, 7) === selectedMonth)
        .reduce((sum, item) => sum + safeNumber(item.expectedAmount ?? item.amount, 0), 0),
    [income, selectedMonth]
  );

  const categoryNames = useMemo(() => {
    const fromBills = (bills || []).map((bill) => bill.category).filter(Boolean);
    const fromTx = scopedTransactions.map((transaction) => transaction.category).filter(Boolean);
    const existing = Object.keys(monthBudget.categories || {});
    return [...new Set([...fromBills, ...fromTx, ...existing])].sort();
  }, [bills, monthBudget.categories, scopedTransactions]);

  const rows = useMemo(
    () =>
      categoryNames.map((name) => {
        const assigned =
          assignedDraft[name] !== undefined
            ? safeNumber(assignedDraft[name], 0)
            : safeNumber(monthBudget.categories?.[name], 0);
        const activity = scopedTransactions
          .filter((transaction) => getEffectiveTransactionCategory(transaction) === name)
          .reduce((sum, transaction) => {
            const amount = safeNumber(transaction.amount, 0);
            return amount < 0 ? sum + Math.abs(amount) : sum;
          }, 0);
        return {
          name,
          assigned,
          activity,
          available: assigned - activity,
        };
      }),
    [assignedDraft, categoryNames, monthBudget.categories, scopedTransactions]
  );

  const totalAssigned = rows.reduce((sum, row) => sum + row.assigned, 0);
  const totalSpend = rows.reduce((sum, row) => sum + row.activity, 0);
  const netIncome = monthIncome - totalSpend;
  const toBeBudgeted = monthIncome - totalAssigned;
  const transferLikeSpend = scopedTransactions
    .filter((transaction) => {
      const category = getEffectiveTransactionCategory(transaction).toLowerCase();
      return category.includes("transfer") || category.includes("credit");
    })
    .reduce((sum, transaction) => sum + Math.abs(Math.min(safeNumber(transaction.amount, 0), 0)), 0);

  const topCategories = rows
    .filter((row) => row.activity > 0)
    .sort((a, b) => b.activity - a.activity)
    .slice(0, 5)
    .map((row, index) => ({
      ...row,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      percent: totalSpend > 0 ? (row.activity / totalSpend) * 100 : 0,
    }));

  async function saveBudget() {
    try {
      const nextCategories = {};
      rows.forEach((row) => {
        nextCategories[row.name] = safeNumber(row.assigned, 0);
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
      <PageHeader
        eyebrow="Spending"
        title="Understand where the month is going"
        subtitle={`${monthLabel(selectedMonth)} spending and budget health.`}
        left={<div className="iconButton"><Icon name="spending" size={18} /></div>}
        right={
          <button type="button" className="iconButton" onClick={saveBudget} aria-label="Save budget">
            <Icon name="sync" size={18} />
          </button>
        }
      >
        <div className="row" style={{ justifyContent: "center" }}>
          <ChipTabs items={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
        </div>
      </PageHeader>

      <SurfaceCard>
        <SectionHeader eyebrow="Period" title="Current view" subtitle="Month selector with a compact activity rhythm." />
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <label style={{ flex: 1, maxWidth: 220 }}>
            <span className="sectionEyebrow">Month</span>
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
          </label>
          <div className="summaryGrid two" style={{ flex: 1 }}>
            <div className="summaryCell">
              <span className="dataLabel">Transactions</span>
              <strong>{scopedTransactions.length}</strong>
            </div>
            <div className="summaryCell">
              <span className="dataLabel">Budget lines</span>
              <strong>{rows.length}</strong>
            </div>
          </div>
        </div>
        <div className="sparkline" style={{ minHeight: 56 }}>
          {(topCategories.length > 0 ? topCategories : [{ activity: 1 }, { activity: 0.7 }, { activity: 0.9 }]).map((item, index) => (
            <div
              key={`${item.name || index}`}
              className="sparkBar"
              style={{
                height: `${Math.max(22, ((item.activity || 1) / Math.max(topCategories[0]?.activity || 1, 1)) * 100)}%`,
                background: `linear-gradient(180deg, ${CATEGORY_COLORS[index % CATEGORY_COLORS.length]}66, ${CATEGORY_COLORS[index % CATEGORY_COLORS.length]})`,
              }}
            />
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader eyebrow="Summary" title="Income, spend, and budget health" subtitle="A finance-app summary card instead of a report table." />
        <div className="metricList">
          <MetricRow icon="income" label="Income" value={formatCurrency(monthIncome, cfg.currency)} detail="Expected inflow for this month" />
          <MetricRow icon="expense" label="Total Spend" value={formatCurrency(totalSpend, cfg.currency)} detail="Outflow across spending categories" />
          <MetricRow icon="cash" label="Net Income" value={formatCurrency(netIncome, cfg.currency)} detail="Income minus current spend" />
          <MetricRow icon="budget" label="Budget Health" value={formatCurrency(toBeBudgeted, cfg.currency)} detail={toBeBudgeted >= 0 ? "Available to assign" : "Over-assigned for the month"} />
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader
          eyebrow="Breakdown"
          title="See what is driving spend"
          subtitle="Categories are active now, tags stay ready for the next layer."
          action={<ChipTabs items={BREAKDOWN_OPTIONS} value={breakdownMode} onChange={setBreakdownMode} />}
        />
        {breakdownMode === "tags" ? (
          <InsightCard
            icon="tag"
            eyebrow="Tags"
            title="Tag breakdown is ready for future rules"
            body="This workspace is using category-level breakdown today. Tag-level rollups can plug into the same surface later."
          />
        ) : (
          <div className="chartCard">
            <div className="donut" style={{ "--value": `${Math.min(1, totalSpend / Math.max(monthIncome || totalSpend || 1, 1))}turn` }}>
              <div className="donutCenter">
                <div className="sectionEyebrow">Total spend</div>
                <div className="sectionTitle" style={{ marginTop: 6 }}>{formatCurrency(totalSpend, cfg.currency)}</div>
              </div>
            </div>
            <div className="legendList">
              {topCategories.length === 0 ? (
                <div className="sectionSubtitle">Add categorized transactions to build the category breakdown.</div>
              ) : (
                topCategories.map((row) => (
                  <div key={row.name} className="legendRow">
                    <div className="legendSwatch" style={{ background: row.color }} />
                    <div>
                      <div className="metricRowLabel">{row.name}</div>
                      <div className="metricRowDetail">{row.percent.toFixed(1)}% of spend</div>
                    </div>
                    <strong>{formatCurrency(row.activity, cfg.currency)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </SurfaceCard>

      {showFootnote && transferLikeSpend > 0 ? (
        <div className="footnoteCard">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="sectionTitle">Transfers and card payments included</div>
              <div className="sectionSubtitle">
                {formatCurrency(transferLikeSpend, cfg.currency)} of current spend appears to be transfers or credit-related movement.
              </div>
            </div>
            <button type="button" className="iconButton" onClick={() => setShowFootnote(false)} aria-label="Dismiss note">
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
      ) : null}

      <SurfaceCard>
        <SectionHeader eyebrow="Budget Lines" title="Assigned vs. actual" subtitle="Editable category rows so you can still manage the budget in this new UI." />
        {rows.length === 0 ? (
          <div className="sectionSubtitle">No categories yet. Add bills or transactions first.</div>
        ) : (
          <div className="stackedList">
            {rows.map((row) => (
              <SurfaceCard key={row.name} className="compact">
                <div className="row" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div>
                    <div className="sectionTitle">{row.name}</div>
                    <div className="sectionSubtitle">
                      Activity {formatCurrency(row.activity, cfg.currency)} • Available {formatCurrency(row.available, cfg.currency)}
                    </div>
                  </div>
                  <label style={{ width: 140 }}>
                    <span className="sectionEyebrow">Assigned</span>
                    <input
                      type="number"
                      value={row.assigned}
                      onChange={(e) => setAssignedDraft({ ...assignedDraft, [row.name]: e.target.value })}
                    />
                  </label>
                </div>
              </SurfaceCard>
            ))}
          </div>
        )}
      </SurfaceCard>

      <InsightCard
        icon="budget"
        tone="accent"
        eyebrow="Actionable"
        title="Start a tighter budget review"
        body="Use this page to assign dollars, then review merchant-level noise on the Transactions page."
      />
    </div>
  );
}
