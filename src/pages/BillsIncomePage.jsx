import React, { useEffect, useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import Modal from "../components/Modal";
import PageHeader from "../components/ui/PageHeader";
import SectionHeader from "../components/ui/SectionHeader";
import SurfaceCard from "../components/ui/SurfaceCard";
import ChipTabs from "../components/ui/ChipTabs";
import InsightCard from "../components/ui/InsightCard";
import Icon from "../components/ui/Icons";
import { RecurringRow, MenuRow } from "../components/ui/Rows";
import { routeHref } from "../lib/hashRouter";
import {
  confirmStatementBillMatch,
  confirmStatementIncomeMatch,
  deleteStatementItem,
  dismissStatementBillMatch,
  dismissStatementIncomeMatch,
  deleteTemplate,
  markStatementBillPaid,
  markStatementIncomeReceived,
  syncRecurringItemsForMonth,
  upsertStatementItem,
  upsertTemplate,
} from "../lib/db";
import {
  computeMonthTotals,
  DEFAULT_SETTINGS,
  formatCurrency,
  getBillsDueLaterThisMonth,
  getBillsDueWithinDays,
  getIncomePayDate,
  monthFromMonthId,
  monthKey,
  safeNumber,
} from "../lib/finance";
import { getAutomationReviewSummary, getTransactionDisplayName } from "../lib/automation";

const EMPTY_BILL = {
  merchant: "",
  amount: 0,
  dueDay: 1,
  paidFrom: "",
  accountId: "",
  status: "unpaid",
};

const EMPTY_INCOME = {
  source: "",
  amount: 0,
  payDay: 1,
  status: "expected",
};

const EMPTY_BILL_TEMPLATE = {
  merchant: "",
  dueDay: 1,
  defaultAmount: 0,
  defaultPaidFrom: "",
  isActive: true,
};

const EMPTY_INCOME_TEMPLATE = {
  source: "",
  payDay: 1,
  defaultAmount: 0,
  isActive: true,
};

function relativeLabel(date, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 1) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

function monthTitle(date) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

export default function BillsIncomePage({
  uid,
  bills,
  income,
  billTemplates,
  incomeTemplates,
  accounts,
  transactions = [],
  settings,
  onToast,
  onError,
  selectedMonth,
  setSelectedMonth,
}) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [viewMode, setViewMode] = useState("upcoming");
  const [paydayView, setPaydayView] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [billForm, setBillForm] = useState(EMPTY_BILL);
  const [billEditingId, setBillEditingId] = useState(null);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [incomeForm, setIncomeForm] = useState(EMPTY_INCOME);
  const [incomeEditingId, setIncomeEditingId] = useState(null);
  const [billTemplateOpen, setBillTemplateOpen] = useState(false);
  const [billTemplateForm, setBillTemplateForm] = useState(EMPTY_BILL_TEMPLATE);
  const [billTemplateEditingId, setBillTemplateEditingId] = useState(null);
  const [incomeTemplateOpen, setIncomeTemplateOpen] = useState(false);
  const [incomeTemplateForm, setIncomeTemplateForm] = useState(EMPTY_INCOME_TEMPLATE);
  const [incomeTemplateEditingId, setIncomeTemplateEditingId] = useState(null);

  const now = new Date();
  const currentMonth = selectedMonth || monthKey(now);
  const viewDate = monthFromMonthId(currentMonth) || now;
  const isCurrentMonth = currentMonth === monthKey(now);
  const isReadOnly = !isCurrentMonth;

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = `BudgetCommand • Recurring • ${monthTitle(viewDate)}`;
    }
  }, [viewDate]);

  const dueSoon = useMemo(() => getBillsDueWithinDays(bills, 7, now), [bills, now]);
  const dueLater = useMemo(() => getBillsDueLaterThisMonth(bills, now, 7), [bills, now]);
  const cashflow = useMemo(() => computeMonthTotals(bills, income, { now }), [bills, income, now]);

  const billRows = useMemo(
    () =>
      [...(bills || [])].sort((a, b) => {
        const ad = a.dueDate?.toDate ? a.dueDate.toDate().getTime() : 0;
        const bd = b.dueDate?.toDate ? b.dueDate.toDate().getTime() : 0;
        return ad - bd;
      }),
    [bills]
  );
  const incomeRows = useMemo(
    () => [...(income || [])].sort((a, b) => getIncomePayDate(a).getTime() - getIncomePayDate(b).getTime()),
    [income]
  );
  const recentCharges = useMemo(
    () => billRows.filter((bill) => bill.status === "paid").slice(-5).reverse(),
    [billRows]
  );
  const accountOptions = useMemo(
    () => [...(accounts || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [accounts]
  );
  const accountNameById = useMemo(
    () =>
      accountOptions.reduce((map, account) => {
        map[account.id] = account.name || account.institution || account.id;
        return map;
      }, {}),
    [accountOptions]
  );
  const nextPaycheck = cashflow.nextExpectedIncome
    ? {
        label: cashflow.nextExpectedIncome.source || cashflow.nextExpectedIncome.name || "Next paycheck",
        date: getIncomePayDate(cashflow.nextExpectedIncome, now),
        amount: safeNumber(cashflow.nextExpectedIncome.amount ?? cashflow.nextExpectedIncome.expectedAmount, 0),
      }
    : null;
  const automationReview = useMemo(
    () => getAutomationReviewSummary({ bills, income, transactions }),
    [bills, income, transactions]
  );

  function goMonth(step) {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + step, 1);
    setSelectedMonth(monthKey(next));
  }

  function dueDateFromDay(day) {
    const year = viewDate.getFullYear();
    const monthIndex = viewDate.getMonth();
    const max = new Date(year, monthIndex + 1, 0).getDate();
    const clamped = Math.min(Math.max(1, Number(day) || 1), max);
    return Timestamp.fromDate(new Date(year, monthIndex, clamped));
  }

  function setBillAccount(accountId) {
    const selected = accountOptions.find((account) => account.id === accountId);
    setBillForm((prev) => ({
      ...prev,
      accountId,
      paidFrom: selected?.name || "",
    }));
  }

  function startBillAdd() {
    setBillEditingId(null);
    const defaultAccount = accountOptions[0] || null;
    setBillForm({
      ...EMPTY_BILL,
      accountId: defaultAccount?.id || "",
      paidFrom: defaultAccount?.name || "",
    });
    setBillOpen(true);
  }

  function startBillEdit(bill) {
    const resolvedAccountId = accountNameById[bill.accountId] ? bill.accountId : "";
    const resolvedPaidFrom = bill.paidFrom || accountNameById[bill.accountId] || bill.accountId || "";
    setBillEditingId(bill.id);
    setBillForm({
      merchant: bill.merchant || bill.name || "",
      amount: bill.amount || 0,
      dueDay: bill.dueDay || 1,
      paidFrom: resolvedPaidFrom,
      accountId: resolvedAccountId,
      status: bill.status || "unpaid",
    });
    setBillOpen(true);
  }

  async function saveBill() {
    if (isReadOnly || !billForm.merchant.trim()) return;
    try {
      await upsertStatementItem(
        uid,
        currentMonth,
        "bills",
        {
          ...billForm,
          merchant: billForm.merchant.trim(),
          name: billForm.merchant.trim(),
          amount: Math.abs(safeNumber(billForm.amount, 0)),
          dueDay: Math.max(1, Math.min(31, Number(billForm.dueDay) || 1)),
          dueDate: dueDateFromDay(billForm.dueDay),
          paidFrom: accountNameById[billForm.accountId] || billForm.paidFrom || "",
          accountId: billForm.accountId || "",
          status: billForm.status || "unpaid",
        },
        billEditingId || undefined
      );
      setBillOpen(false);
      onToast("Recurring bill saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save recurring bill.", "error");
    }
  }

  async function removeBill(id) {
    if (isReadOnly) return;
    try {
      await deleteStatementItem(uid, currentMonth, "bills", id);
      onToast("Recurring bill deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete bill.", "error");
    }
  }

  async function paid(bill) {
    if (isReadOnly) return;
    try {
      await markStatementBillPaid(uid, currentMonth, bill.id, bill.status !== "paid");
      onToast(`Updated ${bill.merchant || bill.name}.`);
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to update bill status.", "error");
    }
  }

  function startIncomeAdd() {
    setIncomeEditingId(null);
    setIncomeForm(EMPTY_INCOME);
    setIncomeOpen(true);
  }

  function startIncomeEdit(item) {
    setIncomeEditingId(item.id);
    setIncomeForm({
      source: item.source || item.name || "",
      amount: item.amount ?? item.expectedAmount ?? 0,
      payDay: item.payDay || 1,
      status: item.status || "expected",
    });
    setIncomeOpen(true);
  }

  async function saveIncome() {
    if (isReadOnly || !incomeForm.source.trim()) return;
    try {
      await upsertStatementItem(
        uid,
        currentMonth,
        "incomes",
        {
          ...incomeForm,
          source: incomeForm.source.trim(),
          name: incomeForm.source.trim(),
          amount: Math.abs(safeNumber(incomeForm.amount, 0)),
          expectedAmount: Math.abs(safeNumber(incomeForm.amount, 0)),
          payDay: Math.max(1, Math.min(31, Number(incomeForm.payDay) || 1)),
          payDate: dueDateFromDay(incomeForm.payDay),
          status: incomeForm.status || "expected",
        },
        incomeEditingId || undefined
      );
      setIncomeOpen(false);
      onToast("Paycheck saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save income entry.", "error");
    }
  }

  async function toggleReceived(item) {
    if (isReadOnly) return;
    try {
      await markStatementIncomeReceived(uid, currentMonth, item.id, item.status !== "received");
      onToast(`Updated ${item.source || item.name}.`);
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to update income status.", "error");
    }
  }

  async function syncMonth() {
    try {
      await syncRecurringItemsForMonth(uid, currentMonth);
      onToast("Recurring items synced.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to sync recurring items.", "error");
    }
  }

  async function confirmBillSuggestion(bill) {
    const transaction = (transactions || []).find((entry) => entry.id === bill.matchedTransactionId);
    if (!transaction) return;
    try {
      await confirmStatementBillMatch(uid, currentMonth, bill, transaction);
      onToast(`Confirmed ${bill.merchant || bill.name}.`);
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to confirm bill match.", "error");
    }
  }

  async function dismissBillSuggestion(bill, ignore = false) {
    try {
      await dismissStatementBillMatch(uid, currentMonth, bill.id, {
        ignore,
        matchedTransactionId: bill.matchedTransactionId,
      });
      onToast(ignore ? "Bill suggestion ignored." : "Bill suggestion cleared.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to update bill suggestion.", "error");
    }
  }

  async function confirmIncomeSuggestion(item) {
    const transaction = (transactions || []).find((entry) => entry.id === item.matchedTransactionId);
    if (!transaction) return;
    try {
      await confirmStatementIncomeMatch(uid, currentMonth, item, transaction);
      onToast(`Confirmed ${item.source || item.name}.`);
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to confirm income match.", "error");
    }
  }

  async function dismissIncomeSuggestion(item, ignore = false) {
    try {
      await dismissStatementIncomeMatch(uid, currentMonth, item.id, {
        ignore,
        matchedTransactionId: item.matchedTransactionId,
      });
      onToast(ignore ? "Income suggestion ignored." : "Income suggestion cleared.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to update income suggestion.", "error");
    }
  }

  function startBillTemplateAdd() {
    setBillTemplateEditingId(null);
    setBillTemplateForm(EMPTY_BILL_TEMPLATE);
    setBillTemplateOpen(true);
  }

  function startBillTemplateEdit(template) {
    setBillTemplateEditingId(template.id);
    setBillTemplateForm({
      merchant: template.merchant || "",
      dueDay: template.dueDay || 1,
      defaultAmount: template.defaultAmount || 0,
      defaultPaidFrom: template.defaultPaidFrom || "",
      isActive: template.isActive !== false,
    });
    setBillTemplateOpen(true);
  }

  async function saveBillTemplate() {
    if (!billTemplateForm.merchant.trim()) return;
    try {
      await upsertTemplate(
        uid,
        "bills",
        {
          ...billTemplateForm,
          merchant: billTemplateForm.merchant.trim(),
          dueDay: Math.max(1, Math.min(31, Number(billTemplateForm.dueDay) || 1)),
          defaultAmount: Math.abs(safeNumber(billTemplateForm.defaultAmount, 0)),
          isActive: Boolean(billTemplateForm.isActive),
        },
        billTemplateEditingId || undefined
      );
      setBillTemplateOpen(false);
      onToast("Recurring bill template saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save bill template.", "error");
    }
  }

  async function removeBillTemplate(id) {
    try {
      await deleteTemplate(uid, "bills", id);
      onToast("Recurring bill template deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete bill template.", "error");
    }
  }

  function startIncomeTemplateAdd() {
    setIncomeTemplateEditingId(null);
    setIncomeTemplateForm(EMPTY_INCOME_TEMPLATE);
    setIncomeTemplateOpen(true);
  }

  function startIncomeTemplateEdit(template) {
    setIncomeTemplateEditingId(template.id);
    setIncomeTemplateForm({
      source: template.source || "",
      payDay: template.payDay || 1,
      defaultAmount: template.defaultAmount || 0,
      isActive: template.isActive !== false,
    });
    setIncomeTemplateOpen(true);
  }

  async function saveIncomeTemplate() {
    if (!incomeTemplateForm.source.trim()) return;
    try {
      await upsertTemplate(
        uid,
        "incomes",
        {
          ...incomeTemplateForm,
          source: incomeTemplateForm.source.trim(),
          payDay: Math.max(1, Math.min(31, Number(incomeTemplateForm.payDay) || 1)),
          defaultAmount: Math.abs(safeNumber(incomeTemplateForm.defaultAmount, 0)),
          isActive: Boolean(incomeTemplateForm.isActive),
        },
        incomeTemplateEditingId || undefined
      );
      setIncomeTemplateOpen(false);
      onToast("Recurring income template saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save income template.", "error");
    }
  }

  async function removeIncomeTemplate(id) {
    try {
      await deleteTemplate(uid, "incomes", id);
      onToast("Recurring income template deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete income template.", "error");
    }
  }

  const visibleDueSoon = viewMode === "upcoming" ? dueSoon : billRows.filter((bill) => bill.status !== "paid");
  const visibleDueLater = viewMode === "upcoming" ? dueLater : [];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Recurring"
        title="Bills, paydays, and the next moves"
        subtitle={isReadOnly ? `Viewing ${currentMonth} in read-only mode.` : `${monthTitle(viewDate)} recurring timeline.`}
        left={
          <button type="button" className="iconButton" onClick={() => goMonth(-1)} aria-label="Previous month">
            <Icon name="chevronRight" size={18} style={{ transform: "rotate(180deg)" }} />
          </button>
        }
        right={
          <button type="button" className="iconButton" onClick={() => goMonth(1)} aria-label="Next month">
            <Icon name="chevronRight" size={18} />
          </button>
        }
      >
        <div className="row" style={{ justifyContent: "center" }}>
          <ChipTabs
            items={[
              { id: "upcoming", label: "Upcoming" },
              { id: "all", label: "All" },
            ]}
            value={viewMode}
            onChange={setViewMode}
          />
          <button type="button" className="pillButton" onClick={syncMonth}>
            <Icon name="sync" size={16} />
            Sync now
          </button>
        </div>
      </PageHeader>

      <SurfaceCard>
        <SectionHeader eyebrow="Coming Up" title="This pay cycle" subtitle="A clean calendar-style overview of what’s hitting soon." />
        <div className="heroSubline" style={{ marginTop: 0, marginBottom: 14 }}>
          <span className="upcomingBadge">
            <Icon name="calendar" size={14} />
            {dueSoon.length} due soon
          </span>
          <span className="upcomingBadge">
            <Icon name="income" size={14} />
            {nextPaycheck ? `${nextPaycheck.label} ${relativeLabel(nextPaycheck.date, now)}` : "No paycheck scheduled"}
          </span>
        </div>
        <div className="timelineStrip">
          {Array.from({ length: 7 }).map((_, index) => {
            const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index);
            const active = dueSoon.some((bill) => bill.nextDueDate.toDateString() === day.toDateString());
            return (
              <div key={day.toISOString()} className={`timelineDot ${active ? "active" : ""}`.trim()}>
                <div className="sectionEyebrow">{day.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className="sectionTitle" style={{ marginTop: 4 }}>{day.getDate()}</div>
              </div>
            );
          })}
        </div>
      </SurfaceCard>

      <div className="stackedList">
        <InsightCard
          icon="income"
          tone="success"
          eyebrow="Payday View"
          title={paydayView ? "Payday-first forecasting is on" : "Payday-first forecasting is off"}
          body={
            nextPaycheck
              ? `${nextPaycheck.label} lands ${relativeLabel(nextPaycheck.date, now)} for ${formatCurrency(nextPaycheck.amount, cfg.currency)}.`
              : "Add or sync an income source to anchor the next paycheck."
          }
          action={
            <button type="button" className="pillButton" onClick={() => setPaydayView((value) => !value)}>
              {paydayView ? "Enabled" : "Enable"}
            </button>
          }
        />
        <InsightCard
          icon="spark"
          eyebrow="Insight"
          title="Recurring health"
          body={`Projected remaining after all bills this month: ${formatCurrency(cashflow.projectedRemaining, cfg.currency)}.`}
          action={<a href={routeHref("dashboard")} className="pillButton">Dashboard</a>}
        />
      </div>

      <SurfaceCard>
        <SectionHeader
          eyebrow="Automation Review"
          title="Suggested bill and income matches"
          subtitle={
            automationReview.billSuggestions.length || automationReview.incomeSuggestions.length
              ? "High-confidence items auto-complete. The rest stay here for review."
              : "No recurring match suggestions need review right now."
          }
        />
        {automationReview.billSuggestions.length === 0 && automationReview.incomeSuggestions.length === 0 ? (
          <div className="sectionSubtitle">You do not have any pending recurring suggestions in this month.</div>
        ) : (
          <div className="stackedList">
            {automationReview.billSuggestions.map((bill) => {
              const transaction = (transactions || []).find((entry) => entry.id === bill.matchedTransactionId);
              return (
                <RecurringRow
                  key={`bill-review-${bill.id}`}
                  name={bill.merchant || bill.name}
                  subtitle={`${transaction ? getTransactionDisplayName(transaction) : "Suggested transaction"} • ${bill.matchConfidence || "medium"} confidence`}
                  amount={formatCurrency(bill.amount, cfg.currency)}
                  badge={{ label: "Bill review", tone: "warning" }}
                  icon="recurring"
                  action={
                    <div className="row">
                      <button type="button" className="iconButton" onClick={() => confirmBillSuggestion(bill)} aria-label="Confirm bill suggestion">
                        <Icon name="check" size={16} />
                      </button>
                      <button type="button" className="iconButton" onClick={() => dismissBillSuggestion(bill, false)} aria-label="Dismiss bill suggestion">
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  }
                />
              );
            })}
            {automationReview.incomeSuggestions.map((item) => {
              const transaction = (transactions || []).find((entry) => entry.id === item.matchedTransactionId);
              return (
                <RecurringRow
                  key={`income-review-${item.id}`}
                  name={item.source || item.name}
                  subtitle={`${transaction ? getTransactionDisplayName(transaction) : "Suggested deposit"} • ${item.matchConfidence || "medium"} confidence`}
                  amount={formatCurrency(item.amount ?? item.expectedAmount, cfg.currency)}
                  badge={{ label: "Income review", tone: "warning" }}
                  icon="income"
                  action={
                    <div className="row">
                      <button type="button" className="iconButton" onClick={() => confirmIncomeSuggestion(item)} aria-label="Confirm income suggestion">
                        <Icon name="check" size={16} />
                      </button>
                      <button type="button" className="iconButton" onClick={() => dismissIncomeSuggestion(item, false)} aria-label="Dismiss income suggestion">
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader
          eyebrow="Due Soon"
          title="Immediate recurring items"
          subtitle="Compact merchant rows for the next week."
          action={!isReadOnly ? <button type="button" className="pillButton" onClick={startBillAdd}>Add bill</button> : null}
        />
        {visibleDueSoon.length === 0 ? (
          <div className="sectionSubtitle">No unpaid bills in the current view.</div>
        ) : (
          <div className="stackedList">
            {visibleDueSoon.map((bill) => (
              <RecurringRow
                key={bill.id}
                name={bill.merchant || bill.name}
                subtitle={`${relativeLabel(bill.nextDueDate || bill.dueDate?.toDate?.() || now, now)} • ${bill.paidFrom || accountNameById[bill.accountId] || "Unassigned account"}`}
                amount={formatCurrency(bill.amount, cfg.currency)}
                badge={bill.status === "paid" ? { label: "Paid", tone: "success" } : { label: relativeLabel(bill.nextDueDate, now), tone: "warning" }}
                icon="recurring"
                action={
                  <div className="row">
                    <button type="button" className="iconButton" onClick={() => paid(bill)} aria-label="Toggle paid">
                      <Icon name={bill.status === "paid" ? "sync" : "check"} size={16} />
                    </button>
                    <button type="button" className="iconButton" onClick={() => startBillEdit(bill)} aria-label="Edit bill" disabled={isReadOnly}>
                      <Icon name="dots" size={16} />
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader eyebrow="Coming Later" title="Later this month" subtitle="Everything beyond the next week stays grouped here." />
        {visibleDueLater.length === 0 ? (
          <div className="sectionSubtitle">Nothing later in this month yet.</div>
        ) : (
          <div className="stackedList">
            {visibleDueLater.map((bill) => (
              <RecurringRow
                key={bill.id}
                name={bill.merchant || bill.name}
                subtitle={`${relativeLabel(bill.nextDueDate, now)} • ${bill.paidFrom || accountNameById[bill.accountId] || "Unassigned account"}`}
                amount={formatCurrency(bill.amount, cfg.currency)}
                badge={{ label: relativeLabel(bill.nextDueDate, now) }}
                icon="calendar"
              />
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader
          eyebrow="Recent Charges"
          title="Recent completed recurring charges"
          subtitle="A clean paid history instead of a noisy admin table."
          action={!isReadOnly ? <button type="button" className="pillButton" onClick={startIncomeAdd}>Add paycheck</button> : null}
        />
        {recentCharges.length === 0 ? (
          <div className="sectionSubtitle">No recent paid recurring charges yet.</div>
        ) : (
          <div className="stackedList">
            {recentCharges.map((bill) => (
              <RecurringRow
                key={bill.id}
                name={bill.merchant || bill.name}
                subtitle={`${relativeLabel(bill.paidAt?.toDate ? bill.paidAt.toDate() : bill.dueDate?.toDate?.() || now, now)} • ${bill.paidFrom || accountNameById[bill.accountId] || "Unassigned account"}`}
                amount={formatCurrency(bill.amount, cfg.currency)}
                badge={{ label: "Paid", tone: "success" }}
                icon="cash"
              />
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader
          eyebrow="Templates"
          title="Recurring templates and automation"
          subtitle="Keep the page focused by tucking setup controls under one grouped card."
          action={
            <button type="button" className="pillButton" onClick={() => setShowTemplates((value) => !value)}>
              {showTemplates ? "Hide" : "Show"}
            </button>
          }
        />
        {showTemplates ? (
          <div className="menuList">
            <MenuRow icon="plus" title="Add recurring bill template" subtitle="Create a reusable monthly bill" onClick={startBillTemplateAdd} />
            <MenuRow icon="income" title="Add recurring income template" subtitle="Create a reusable paycheck template" onClick={startIncomeTemplateAdd} />
            {billTemplates?.map((template) => (
              <MenuRow
                key={template.id}
                icon="recurring"
                title={template.merchant}
                subtitle={`Due day ${template.dueDay} • ${formatCurrency(template.defaultAmount, cfg.currency)}`}
                onClick={() => startBillTemplateEdit(template)}
                actionLabel="Bill"
              />
            ))}
            {incomeTemplates?.map((template) => (
              <MenuRow
                key={template.id}
                icon="income"
                title={template.source}
                subtitle={`Pay day ${template.payDay} • ${formatCurrency(template.defaultAmount, cfg.currency)}`}
                onClick={() => startIncomeTemplateEdit(template)}
                actionLabel="Income"
              />
            ))}
          </div>
        ) : (
          <div className="sectionSubtitle">Templates stay hidden until you want to manage the recurring setup layer.</div>
        )}
      </SurfaceCard>

      <Modal title={billEditingId ? "Edit Recurring Bill" : "Add Recurring Bill"} open={billOpen} onClose={() => setBillOpen(false)}>
        <div className="formGrid">
          <label>Merchant<input value={billForm.merchant} onChange={(e) => setBillForm({ ...billForm, merchant: e.target.value })} /></label>
          <label>Amount<input type="number" value={billForm.amount} onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })} /></label>
          <label>Due Day<input type="number" min="1" max="31" value={billForm.dueDay} onChange={(e) => setBillForm({ ...billForm, dueDay: e.target.value })} /></label>
          <label>
            From Account
            <select value={billForm.accountId} onChange={(e) => setBillAccount(e.target.value)}>
              <option value="">Select account</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name || account.institution || account.id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
          {billEditingId ? (
            <button type="button" onClick={() => removeBill(billEditingId)}>
              Delete
            </button>
          ) : <span />}
          <button type="button" className="primary" onClick={saveBill}>Save</button>
        </div>
      </Modal>

      <Modal title={incomeEditingId ? "Edit Paycheck" : "Add Paycheck"} open={incomeOpen} onClose={() => setIncomeOpen(false)}>
        <div className="formGrid">
          <label>Source<input value={incomeForm.source} onChange={(e) => setIncomeForm({ ...incomeForm, source: e.target.value })} /></label>
          <label>Amount<input type="number" value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} /></label>
          <label>Pay Day<input type="number" min="1" max="31" value={incomeForm.payDay} onChange={(e) => setIncomeForm({ ...incomeForm, payDay: e.target.value })} /></label>
          <label>
            Status
            <select value={incomeForm.status} onChange={(e) => setIncomeForm({ ...incomeForm, status: e.target.value })}>
              <option value="expected">Expected</option>
              <option value="received">Received</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
          <button type="button" className="primary" onClick={saveIncome}>Save</button>
        </div>
      </Modal>

      <Modal title={billTemplateEditingId ? "Edit Recurring Bill Template" : "Add Recurring Bill Template"} open={billTemplateOpen} onClose={() => setBillTemplateOpen(false)}>
        <div className="formGrid">
          <label>Merchant<input value={billTemplateForm.merchant} onChange={(e) => setBillTemplateForm({ ...billTemplateForm, merchant: e.target.value })} /></label>
          <label>Due Day<input type="number" min="1" max="31" value={billTemplateForm.dueDay} onChange={(e) => setBillTemplateForm({ ...billTemplateForm, dueDay: e.target.value })} /></label>
          <label>Default Amount<input type="number" value={billTemplateForm.defaultAmount} onChange={(e) => setBillTemplateForm({ ...billTemplateForm, defaultAmount: e.target.value })} /></label>
          <label>Default Paid From<input value={billTemplateForm.defaultPaidFrom} onChange={(e) => setBillTemplateForm({ ...billTemplateForm, defaultPaidFrom: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
          {billTemplateEditingId ? (
            <button type="button" onClick={() => removeBillTemplate(billTemplateEditingId)}>Delete</button>
          ) : <span />}
          <button type="button" className="primary" onClick={saveBillTemplate}>Save</button>
        </div>
      </Modal>

      <Modal title={incomeTemplateEditingId ? "Edit Recurring Income Template" : "Add Recurring Income Template"} open={incomeTemplateOpen} onClose={() => setIncomeTemplateOpen(false)}>
        <div className="formGrid">
          <label>Source<input value={incomeTemplateForm.source} onChange={(e) => setIncomeTemplateForm({ ...incomeTemplateForm, source: e.target.value })} /></label>
          <label>Pay Day<input type="number" min="1" max="31" value={incomeTemplateForm.payDay} onChange={(e) => setIncomeTemplateForm({ ...incomeTemplateForm, payDay: e.target.value })} /></label>
          <label>Default Amount<input type="number" value={incomeTemplateForm.defaultAmount} onChange={(e) => setIncomeTemplateForm({ ...incomeTemplateForm, defaultAmount: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
          {incomeTemplateEditingId ? (
            <button type="button" onClick={() => removeIncomeTemplate(incomeTemplateEditingId)}>Delete</button>
          ) : <span />}
          <button type="button" className="primary" onClick={saveIncomeTemplate}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
