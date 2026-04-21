import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../components/Modal";
import {
  bulkUpdateBillTemplates,
  bulkUpdateStatementBills,
  linkTransactionToIncomeInstance,
  linkTransactionToBillInstance,
  markStatementBillPaid,
  saveBillInstance,
  saveBillVerification,
  saveIncomeTemplateLearning,
  saveIncomeVerification,
  saveMonthlySetupState,
  saveSettings,
} from "../lib/db";
import { DEFAULT_SETTINGS, formatCurrency, monthKey, safeNumber } from "../lib/finance";
import {
  BILL_STATUS_LABELS,
  buildPlannerModel,
  formatShortDate,
  getDefaultPaychecks,
  INCOME_STATUS_LABELS,
  PAYCHECK_SLOTS,
  toDate,
} from "../lib/planner";

const EMPTY_VERIFICATION = {
  actualAmount: "",
  paidDate: new Date().toISOString().slice(0, 10),
  linkedTransactionId: "",
  manuallyConfirmed: true,
  notes: "",
};

const EMPTY_INCOME_VERIFICATION = {
  items: {},
};

const SETUP_STEPS = [
  { id: "accounts", label: "Assign Accounts" },
  { id: "amounts", label: "Fill Amounts" },
  { id: "review", label: "Review Plan" },
];

const DEFAULT_SORT = {
  key: "dueDate",
  direction: "asc",
};

function compareValues(left, right) {
  if (left === right) return 0;
  if (left === null || left === undefined || left === "") return 1;
  if (right === null || right === undefined || right === "") return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function sortBills(rows, sort) {
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    let left;
    let right;
    switch (sort.key) {
      case "name":
        left = a.name;
        right = b.name;
        break;
      case "account":
        left = a.account?.name || "";
        right = b.account?.name || "";
        break;
      case "amount":
        left = safeNumber(a.plannedAmount ?? a.suggestedAmount, 0);
        right = safeNumber(b.plannedAmount ?? b.suggestedAmount, 0);
        break;
      case "status":
        left = BILL_STATUS_LABELS[a.status] || a.status;
        right = BILL_STATUS_LABELS[b.status] || b.status;
        break;
      case "dueDate":
      default:
        left = new Date(a.dueDate || 0).getTime();
        right = new Date(b.dueDate || 0).getTime();
        break;
    }
    const result = compareValues(left, right);
    if (result !== 0) return result * direction;
    return compareValues(a.name, b.name);
  });
}

function getAlertSummary(planner) {
  const parts = [];
  if (planner.alertCounts.overdue) parts.push(`${planner.alertCounts.overdue} overdue`);
  if (planner.alertCounts.variable) parts.push(`${planner.alertCounts.variable} variable to review`);
  if (planner.alertCounts.match) parts.push(`${planner.alertCounts.match} possible matches`);
  if (planner.alertCounts.lowBalance) parts.push(`${planner.alertCounts.lowBalance} low-balance warnings`);
  return parts.length > 0 ? parts.join(" | ") : "No critical issues";
}

function SetupStepPills({ currentStep }) {
  return (
    <div className="setupStepPills">
      {SETUP_STEPS.map((step, index) => (
        <div key={step.id} className={`setupStepPill ${index === currentStep ? "active" : ""}`}>
          <span>{index + 1}</span>
          <strong>{step.label}</strong>
        </div>
      ))}
    </div>
  );
}

function PlannerBillActionButton({ bill, onTogglePaid, onReview, compact = false }) {
  const holdTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const [isHolding, setIsHolding] = useState(false);

  function clearHold() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
  }

  function startHold() {
    clearHold();
    longPressTriggeredRef.current = false;
    setIsHolding(true);
    holdTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setIsHolding(false);
      holdTimerRef.current = null;
      onReview(bill);
    }, 2000);
  }

  function cancelHold() {
    clearHold();
  }

  function handleClick() {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    onTogglePaid(bill);
  }

  const compactStatusLabels = {
    overdue: "Due",
    planned: "Plan",
    paid: "Paid",
    skipped: "Skip",
  };
  const label = isHolding
    ? "Review..."
    : compact
      ? (compactStatusLabels[bill.status] || BILL_STATUS_LABELS[bill.status] || bill.status)
      : (BILL_STATUS_LABELS[bill.status] || bill.status);
  const nextState = bill.status === "paid" ? "unpaid" : "paid";

  return (
    <button
      type="button"
      className={`plannerBillActionButton ${bill.status === "paid" ? "isPaid" : ""} ${isHolding ? "isHolding" : ""}`.trim()}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onClick={handleClick}
      title={`Tap to mark ${nextState}. Hold for 2 seconds to review.`}
      aria-label={`${label}. Tap to mark ${nextState}. Hold for 2 seconds to review.`}
    >
      {label}
    </button>
  );
}

export default function PlannerPage(props) {
  const {
    uid,
    settings,
    selectedMonth,
    setSelectedMonth,
    bills,
    incomes,
    billTemplates,
    incomeTemplates,
    accounts,
    linkedAccounts,
    transactions,
    statementMeta,
    onToast,
    onError,
  } = props;

  const cfg = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...(settings || {}), paychecks: getDefaultPaychecks(settings) }),
    [settings]
  );
  const [localPaychecks, setLocalPaychecks] = useState(cfg.paychecks);
  const [billSort, setBillSort] = useState(DEFAULT_SORT);
  const [showHiddenItems, setShowHiddenItems] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationBill, setVerificationBill] = useState(null);
  const [verificationForm, setVerificationForm] = useState(EMPTY_VERIFICATION);
  const [incomeReviewOpen, setIncomeReviewOpen] = useState(false);
  const [incomeReviewGroup, setIncomeReviewGroup] = useState(null);
  const [incomeReviewForm, setIncomeReviewForm] = useState(EMPTY_INCOME_VERIFICATION);
  const [isPhoneLayout, setIsPhoneLayout] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
  ));
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [selectedSetupBillIds, setSelectedSetupBillIds] = useState([]);
  const [bulkSetupAccountId, setBulkSetupAccountId] = useState("");
  const [amountDrafts, setAmountDrafts] = useState({});
  const autoReceivedIncomeIdsRef = useRef(new Set());

  useEffect(() => {
    setLocalPaychecks(cfg.paychecks);
  }, [cfg]);

  const planner = useMemo(
    () =>
      buildPlannerModel({
        monthId: selectedMonth,
        settings: cfg,
        billTemplates,
        billInstances: bills,
        incomeTemplates,
        incomeInstances: incomes,
        accounts,
        linkedAccounts,
        transactions,
        visibility: {
          showHidden: showHiddenItems,
          showUnconfigured: showHiddenItems,
        },
      }),
    [accounts, billTemplates, bills, cfg, incomeTemplates, incomes, linkedAccounts, selectedMonth, showHiddenItems, transactions]
  );

  const cleanupCounts = planner.cleanup;
  const setupNeededCount =
    cleanupCounts.missingAccount.length +
    cleanupCounts.missingAmount.length +
    cleanupCounts.variableNeedsReview.length;
  const monthSetupCompleted = statementMeta?.monthlySetupStatus === "completed";
  const fixedBillsNeedingAmount = cleanupCounts.missingAmount.filter((bill) => !bill.variableNeedsReview);
  const variableBillsNeedingReview = cleanupCounts.variableNeedsReview;

  useEffect(() => {
    async function autoReceiveHighConfidenceIncome() {
      const candidates = [];
      for (const paycheck of planner.paychecks || []) {
        for (const group of paycheck.accountGroups || []) {
          for (const incomeItem of group.incomes || []) {
            if (incomeItem.status === "received" || incomeItem.linkedTransactionId) continue;
            if (autoReceivedIncomeIdsRef.current.has(incomeItem.id)) continue;
            const [top, second] = incomeItem.matchCandidates || [];
            if (!top) continue;
            const clearlyBest = !second || top.score - second.score >= 15;
            if (top.score >= 92 && clearlyBest) {
              candidates.push({ incomeItem, transaction: top.transaction });
            }
          }
        }
      }

      for (const candidate of candidates) {
        const { incomeItem, transaction } = candidate;
        autoReceivedIncomeIdsRef.current.add(incomeItem.id);
        try {
          await linkTransactionToIncomeInstance(uid, selectedMonth, incomeItem.id, transaction.id);
          await saveIncomeVerification(uid, selectedMonth, incomeItem.id, {
            status: "received",
            amount: incomeItem.amount,
            linkedTransactionId: transaction.id,
            manuallyConfirmed: false,
            verificationStatus: "matched",
            notes: incomeItem.notes || "",
          });
          await saveIncomeTemplateLearning(uid, incomeItem.templateId, transaction);
        } catch (error) {
          autoReceivedIncomeIdsRef.current.delete(incomeItem.id);
          onError?.(error?.message || String(error));
        }
      }
    }

    if (uid && selectedMonth && transactions?.length) {
      autoReceiveHighConfidenceIncome();
    }
  }, [onError, planner.paychecks, selectedMonth, transactions, uid]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 768px)");
    const sync = () => setIsPhoneLayout(media.matches);
    sync();
    if (media.addEventListener) {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  async function updateBill(billId, patch, successMessage = "Bill updated.") {
    try {
      const sourceBill =
        planner.bills.find((bill) => bill.id === billId) ||
        cleanupCounts.hiddenOrSystem.find((bill) => bill.id === billId) ||
        cleanupCounts.missingAccount.find((bill) => bill.id === billId) ||
        cleanupCounts.missingAmount.find((bill) => bill.id === billId) ||
        cleanupCounts.variableNeedsReview.find((bill) => bill.id === billId);
      if (!sourceBill) return;
      await saveBillInstance(uid, selectedMonth, { ...sourceBill, ...patch }, billId);
      onToast(successMessage);
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to update bill.", "error");
    }
  }

  async function togglePaid(bill) {
    try {
      await markStatementBillPaid(uid, selectedMonth, bill.id, bill.status !== "paid", {
        actualAmount: bill.actualAmount ?? bill.plannedAmount,
        paidDate: new Date().toISOString().slice(0, 10),
      });
      onToast(`${bill.name} updated.`);
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to update bill status.", "error");
    }
  }

  function openReview(bill) {
    setVerificationBill(bill);
    setVerificationForm({
      actualAmount: bill.actualAmount ?? bill.plannedAmount ?? "",
      paidDate: bill.paidDate ? String(bill.paidDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      linkedTransactionId: bill.linkedTransactionId || bill.matchCandidates[0]?.transaction?.id || "",
      manuallyConfirmed: !bill.linkedTransactionId,
      notes: bill.notes || "",
    });
    setVerificationOpen(true);
  }

  async function saveVerification() {
    if (!verificationBill) return;
    try {
      if (verificationForm.linkedTransactionId) {
        await linkTransactionToBillInstance(uid, selectedMonth, verificationBill.id, verificationForm.linkedTransactionId);
      }
      await saveBillVerification(uid, selectedMonth, verificationBill.id, {
        status: "paid",
        actualAmount: verificationForm.actualAmount,
        paidDate: verificationForm.paidDate,
        linkedTransactionId: verificationForm.linkedTransactionId,
        manuallyConfirmed: verificationForm.manuallyConfirmed || !verificationForm.linkedTransactionId,
        verificationStatus: verificationForm.linkedTransactionId ? "matched" : "manual",
        notes: verificationForm.notes,
      });
      setVerificationOpen(false);
      setVerificationBill(null);
      onToast("Bill review saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save bill review.", "error");
    }
  }

  function openIncomeReview(paycheck, group) {
    const items = (group.incomes || []).reduce((map, incomeItem) => {
      map[incomeItem.id] = {
        amount: incomeItem.amount ?? incomeItem.expectedAmount ?? "",
        linkedTransactionId: incomeItem.linkedTransactionId || incomeItem.matchCandidates?.[0]?.transaction?.id || "",
        manuallyConfirmed: !incomeItem.linkedTransactionId,
        markReceived: incomeItem.status === "received" || (incomeItem.matchCandidates?.length || 0) > 0,
        notes: incomeItem.notes || "",
      };
      return map;
    }, {});
    setIncomeReviewGroup({ paycheck, group });
    setIncomeReviewForm({ items });
    setIncomeReviewOpen(true);
  }

  async function saveIncomeReview() {
    if (!incomeReviewGroup) return;
    try {
      for (const incomeItem of incomeReviewGroup.group.incomes || []) {
        const draft = incomeReviewForm.items[incomeItem.id];
        if (!draft?.markReceived) continue;
        if (draft.linkedTransactionId) {
          await linkTransactionToIncomeInstance(uid, selectedMonth, incomeItem.id, draft.linkedTransactionId);
        }
        await saveIncomeVerification(uid, selectedMonth, incomeItem.id, {
          status: "received",
          amount: draft.amount,
          linkedTransactionId: draft.linkedTransactionId,
          manuallyConfirmed: draft.manuallyConfirmed || !draft.linkedTransactionId,
          verificationStatus: draft.linkedTransactionId ? "matched" : "manual",
          notes: draft.notes,
        });
        if (draft.linkedTransactionId) {
          const matchedCandidate = (incomeItem.matchCandidates || []).find(
            (candidate) => candidate.transaction.id === draft.linkedTransactionId
          );
          if (matchedCandidate) {
            await saveIncomeTemplateLearning(uid, incomeItem.templateId, matchedCandidate.transaction);
          }
        }
      }
      setIncomeReviewOpen(false);
      setIncomeReviewGroup(null);
      setIncomeReviewForm(EMPTY_INCOME_VERIFICATION);
      onToast("Income review saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save income review.", "error");
    }
  }

  async function persistPaychecks() {
    try {
      const nextPaychecks = PAYCHECK_SLOTS.reduce((acc, slot) => {
        const current = localPaychecks[slot] || cfg.paychecks[slot] || { label: `Paycheck ${slot}`, depositDay: 1, expectedIncome: 0 };
        acc[slot] = {
          ...current,
          depositDay: Math.max(1, Math.min(31, Number(current.depositDay) || 1)),
          expectedIncome: safeNumber(current.expectedIncome, 0),
        };
        return acc;
      }, {});
      await saveSettings(uid, {
        ...cfg,
        paychecks: nextPaychecks,
      });
      onToast("Paycheck plan updated.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to update paycheck plan.", "error");
    }
  }

  function formatPlannerDueDate(value) {
    if (!isPhoneLayout) return formatShortDate(value);
    const date = toDate(value);
    return String(date.getDate());
  }

  async function hideCleanupRows() {
    const templateMap = new Map((billTemplates || []).map((template) => [template.id, template]));
    const candidates = cleanupCounts.hiddenOrSystem.map((bill) => templateMap.get(bill.templateId)).filter(Boolean);
    if (candidates.length === 0) return;
    try {
      await bulkUpdateBillTemplates(uid, candidates, (template) => ({
        hidden: true,
        system: template.system || true,
        active: false,
      }));
      onToast("Cleanup rows hidden.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to hide cleanup rows.", "error");
    }
  }

  function moveMonth(step) {
    const [year, month] = selectedMonth.split("-").map(Number);
    const next = new Date(year, month - 1 + step, 1);
    setSelectedMonth(monthKey(next));
  }

  function startSetupFlow() {
    setSetupOpen(true);
    setSetupStep(0);
    setSelectedSetupBillIds([]);
    setBulkSetupAccountId("");
    setAmountDrafts({});
  }

  function toggleBillSort(key) {
    setBillSort((current) => (
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "amount" || key === "status" ? "desc" : "asc" }
    ));
  }

  function getSortIndicator(key) {
    if (billSort.key !== key) return "";
    return billSort.direction === "asc" ? " ▲" : " ▼";
  }

  async function assignBillAccount(bill, accountId) {
    if (!accountId) return;
    await updateBill(bill.id, { plannedAccountId: accountId }, "Account assigned.");
  }

  async function bulkAssignAccounts() {
    const targetBills = cleanupCounts.missingAccount.filter((bill) => selectedSetupBillIds.includes(bill.id));
    if (!bulkSetupAccountId || targetBills.length === 0) return;
    try {
      await bulkUpdateStatementBills(uid, selectedMonth, targetBills, {
        plannedAccountId: bulkSetupAccountId,
      });
      setSelectedSetupBillIds([]);
      setBulkSetupAccountId("");
      onToast("Accounts assigned.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to assign accounts.", "error");
    }
  }

  async function confirmBillAmount(bill, amount) {
    const numericAmount = safeNumber(amount, 0);
    if (numericAmount <= 0 && !bill.variableNeedsReview) return;
    await updateBill(
      bill.id,
      {
        plannedAmount: numericAmount > 0 ? numericAmount : null,
        status: bill.status === "overdue" ? "planned" : bill.status,
      },
      "Amount saved."
    );
  }

  async function completeSetupFlow() {
    try {
      await saveMonthlySetupState(uid, selectedMonth, { completed: true });
      setSetupOpen(false);
      onToast("Monthly setup complete.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to mark setup complete.", "error");
    }
  }

  function goNextSetupStep() {
    setSetupStep((step) => Math.min(SETUP_STEPS.length - 1, step + 1));
  }

  function goPrevSetupStep() {
    setSetupStep((step) => Math.max(0, step - 1));
  }

  return (
    <div className="page plannerPage">
      <section className="card section plannerTopBar">
        <div className="row">
          <div>
            <h2>Planner</h2>
            <div className="muted pageIntro">{planner.monthLabel} paycheck worksheet</div>
          </div>
          <div className="spacer" />
          <button type="button" onClick={() => moveMonth(-1)}>Prev</button>
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
          <button type="button" onClick={() => moveMonth(1)}>Next</button>
        </div>
        <div className="plannerTopMeta">
          <span className="muted">{getAlertSummary(planner)}</span>
          <span className="plannerTopMetric">
            Month remaining <strong className={planner.overall.totalIncome - planner.overall.totalPlanned < 0 ? "neg" : "pos"}>{formatCurrency(planner.overall.totalIncome - planner.overall.totalPlanned, cfg.currency)}</strong>
          </span>
        </div>
        <div className="plannerControlRow">
          {setupNeededCount > 0 ? (
            <button type="button" className="primary" onClick={startSetupFlow}>
              {monthSetupCompleted ? "Reopen Monthly Setup" : "Start Monthly Setup"} ({cleanupCounts.missingAccount.length} acct, {cleanupCounts.missingAmount.length} amt, {cleanupCounts.variableNeedsReview.length} variable)
            </button>
          ) : monthSetupCompleted ? (
            <div className="plannerIssue success compactIssue">Monthly setup complete.</div>
          ) : null}
          <label className="checkField compactCheck">
            <input type="checkbox" checked={showHiddenItems} onChange={(e) => setShowHiddenItems(e.target.checked)} />
            <span>Show hidden/unconfigured items</span>
          </label>
        </div>
      </section>

      <section className="card section plannerSetupStrip">
        <div className="row">
          <div>
            <h3>Needs setup</h3>
            <div className="muted compactSubtext">Only unresolved planner items for this month.</div>
          </div>
          <div className="spacer" />
          {cleanupCounts.hiddenOrSystem.length > 0 ? <button type="button" onClick={hideCleanupRows}>Hide cleanup rows</button> : null}
        </div>
        <div className="summaryGrid four paycheckMiniTotals">
          <div className="summaryCell compact"><span className="dataLabel">Missing account</span><strong>{cleanupCounts.missingAccount.length}</strong></div>
          <div className="summaryCell compact"><span className="dataLabel">Missing amount</span><strong>{cleanupCounts.missingAmount.length}</strong></div>
          <div className="summaryCell compact"><span className="dataLabel">Variable review</span><strong>{cleanupCounts.variableNeedsReview.length}</strong></div>
          <div className="summaryCell compact"><span className="dataLabel">Hidden/system</span><strong>{cleanupCounts.hiddenOrSystem.length}</strong></div>
        </div>
      </section>

      <div className="plannerPaychecks simplified">
        {planner.paychecks.length === 0 ? (
          <section className="card section paycheckCard simplified">
            <h3>No paychecks set up yet</h3>
            <div className="muted compactSubtext">
              Add one or more income templates to start building the planner. Only configured paycheck slots will appear here.
            </div>
          </section>
        ) : null}
        {planner.paychecks.map((paycheck) => (
          <section key={paycheck.slot} className="card section paycheckCard simplified">
            <div className="paycheckHeaderCompact">
              <div>
                <h3>{paycheck.label}</h3>
                <div className="muted compactSubtext">Deposit {formatShortDate(paycheck.expectedDepositDate)}</div>
              </div>
              {!paycheck.incomeManagedByTemplates ? (
                <div className="paycheckHeaderControls">
                  <label className="inlineField compact">
                    <span>Income</span>
                    <input type="number" value={localPaychecks[paycheck.slot].expectedIncome} onChange={(e) => setLocalPaychecks((prev) => ({ ...prev, [paycheck.slot]: { ...prev[paycheck.slot], expectedIncome: e.target.value } }))} />
                  </label>
                  <label className="inlineField compact">
                    <span>Day</span>
                    <input type="number" min="1" max="31" value={localPaychecks[paycheck.slot].depositDay} onChange={(e) => setLocalPaychecks((prev) => ({ ...prev, [paycheck.slot]: { ...prev[paycheck.slot], depositDay: e.target.value } }))} />
                  </label>
                  <button type="button" onClick={persistPaychecks}>Save</button>
                </div>
              ) : null}
            </div>
            {!paycheck.incomeManagedByTemplates ? (
              <div className="summaryGrid four paycheckMiniTotals">
                <div className="summaryCell compact"><span className="dataLabel">Income</span><strong>{formatCurrency(paycheck.expectedIncome, cfg.currency)}</strong></div>
                <div className="summaryCell compact"><span className="dataLabel">Planned</span><strong>{formatCurrency(paycheck.totalPlanned, cfg.currency)}</strong></div>
                <div className="summaryCell compact"><span className="dataLabel">Paid</span><strong>{formatCurrency(paycheck.totalPaid, cfg.currency)}</strong></div>
                <div className="summaryCell compact"><span className="dataLabel">Remaining</span><strong className={paycheck.projectedRemaining < 0 ? "neg" : "pos"}>{formatCurrency(paycheck.projectedRemaining, cfg.currency)}</strong></div>
              </div>
            ) : null}
            <div className="accountBoard">
              {paycheck.accountGroups.length === 0 ? <div className="muted">No bills assigned to this paycheck.</div> : null}
              {paycheck.accountGroups.map((group) => {
                const showAccountColumn = group.account.id === "unassigned" || group.account.id === "missing-account";
                return (
                <section key={`${paycheck.slot}-${group.account.id}`} className="accountGroup">
                  <div className="accountGroupHeader">
                    <div>
                      <div className="accountGroupTitle">{group.account.name}</div>
                      <div className="muted compactSubtext">Balance {formatCurrency(group.account.balance || 0, cfg.currency)}</div>
                      {group.incomeExpectedCount > 0 ? (
                        <div className="muted compactSubtext">
                          Income {group.incomeReceivedCount}/{group.incomeExpectedCount} received
                        </div>
                      ) : null}
                      {group.incomeExpectedCount > 0 ? (
                        <div className="accountGroupIncomeStatus">
                          <span className={`pill ${group.incomeReceivedCount === group.incomeExpectedCount ? "statusPill success" : group.incomeReviewNeededCount > 0 ? "statusPill warning" : ""}`}>
                            {group.incomeReceivedCount === group.incomeExpectedCount
                              ? "Income received"
                              : group.incomeReviewNeededCount > 0
                                ? "Income match found"
                                : "Income expected"}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div className="accountGroupHeaderActions">
                      <div className="accountGroupTotals">
                        {group.incomePlanned > 0 ? <span>Income {formatCurrency(group.incomePlanned, cfg.currency)}</span> : null}
                        <span>Planned {formatCurrency(group.planned, cfg.currency)}</span>
                        <span className={group.projectedRemaining < 0 ? "neg" : ""}>Remaining {formatCurrency(group.projectedRemaining, cfg.currency)}</span>
                      </div>
                      {group.incomes.length > 0 ? (
                        <button type="button" onClick={() => openIncomeReview(paycheck, group)}>
                          Review Income
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="plannerTableWrap">
                    <table className={`plannerTable compact ${showAccountColumn ? "plannerTableWithAccount" : "plannerTableWithoutAccount"}`}>
                      <thead>
                        <tr>
                          <th>
                            <button type="button" className="tableSortButton" onClick={() => toggleBillSort("name")}>
                              Bill{getSortIndicator("name")}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="tableSortButton" onClick={() => toggleBillSort("dueDate")}>
                              Due{getSortIndicator("dueDate")}
                            </button>
                          </th>
                          {showAccountColumn ? (
                            <th>
                              <button type="button" className="tableSortButton" onClick={() => toggleBillSort("account")}>
                                Account{getSortIndicator("account")}
                              </button>
                            </th>
                          ) : null}
                          <th>
                            <button type="button" className="tableSortButton" onClick={() => toggleBillSort("amount")}>
                              {isPhoneLayout ? "Amt" : "Amount"}{getSortIndicator("amount")}
                            </button>
                          </th>
                          <th>{isPhoneLayout ? "Mark" : "Action"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortBills(group.bills, billSort).map((bill) => (
                          <React.Fragment key={bill.id}>
                            <tr className={bill.variableNeedsReview ? "billRowNeedsReview" : ""}>
                              <td>
                                <div className="plannerBillTitle">{bill.name}</div>
                                {bill.variableNeedsReview ? <div className="muted compactSubtext">Variable bill</div> : bill.setupIssues.missingAccount || bill.setupIssues.missingAmount ? <div className="muted compactSubtext">{bill.setupIssues.missingAccount ? "Needs account" : ""}{bill.setupIssues.missingAccount && bill.setupIssues.missingAmount ? " | " : ""}{bill.setupIssues.missingAmount ? "Needs amount" : ""}</div> : null}
                              </td>
                              <td className="plannerDueCell" title={formatShortDate(bill.dueDate)}>{formatPlannerDueDate(bill.dueDate)}</td>
                              {showAccountColumn ? (
                                <td>
                                  <select className="plannerAccountSelect" value={bill.plannedAccountId || ""} onChange={(e) => updateBill(bill.id, { plannedAccountId: e.target.value })}>
                                    <option value="">Unassigned</option>
                                    {planner.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                                  </select>
                                </td>
                              ) : null}
                              <td>
                                <input type="number" value={bill.plannedAmount ?? ""} className={`plannerAmountInput ${bill.variableNeedsReview ? "fieldNeedsReview" : ""}`} onChange={(e) => updateBill(bill.id, { plannedAmount: e.target.value === "" ? null : e.target.value, status: bill.status === "overdue" ? "planned" : bill.status }, "Amount updated.")} />
                              </td>
                              <td>
                                <PlannerBillActionButton bill={bill} onTogglePaid={togglePaid} onReview={openReview} compact={isPhoneLayout} />
                              </td>
                            </tr>
                            {bill.variableNeedsReview ? (
                              <tr className="variableReviewRow">
                                <td colSpan={showAccountColumn ? 5 : 4}>
                                  <div className="variableReview">
                                    <div className="row variableReviewHeader">
                                      <span className="pill statusPill warning">Needs amount review</span>
                                      <div className="spacer" />
                                      {bill.suggestedAmount ? <button type="button" onClick={() => updateBill(bill.id, { plannedAmount: bill.suggestedAmount, status: bill.status === "overdue" ? "planned" : bill.status }, "Variable bill approved.")}>Approve {formatCurrency(bill.suggestedAmount, cfg.currency)}</button> : null}
                                      <button type="button" onClick={() => openReview(bill)}>Edit</button>
                                    </div>
                                    <div className="muted compactSubtext">Last 3 months: {bill.variableHistory.length > 0 ? bill.variableHistory.map((entry) => `${entry.monthLabel} ${formatCurrency(entry.amount, cfg.currency)}`).join(" | ") : "No recent reference"}</div>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )})}
            </div>
          </section>
        ))}
      </div>

      <Modal title="Monthly Setup" open={setupOpen} onClose={() => setSetupOpen(false)}>
        <SetupStepPills currentStep={setupStep} />
        <div className="setupStepBody">
          {setupStep === 0 ? (
            <>
              <div className="row"><div><h3>Assign accounts</h3><div className="muted compactSubtext">Only bills missing an account are shown here.</div></div></div>
              {cleanupCounts.missingAccount.length === 0 ? <div className="muted">No bills need account assignment.</div> : (
                <>
                  <div className="setupBulkBar">
                    <label className="checkField compactCheck">
                      <input type="checkbox" checked={cleanupCounts.missingAccount.length > 0 && selectedSetupBillIds.length === cleanupCounts.missingAccount.length} onChange={() => setSelectedSetupBillIds(selectedSetupBillIds.length === cleanupCounts.missingAccount.length ? [] : cleanupCounts.missingAccount.map((bill) => bill.id))} />
                      <span>Select all</span>
                    </label>
                    <select value={bulkSetupAccountId} onChange={(e) => setBulkSetupAccountId(e.target.value)}>
                      <option value="">Assign selected to account...</option>
                      {planner.accounts.filter((account) => account.id !== "unassigned").map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                    <button type="button" onClick={bulkAssignAccounts} disabled={!bulkSetupAccountId || selectedSetupBillIds.length === 0}>Apply to {selectedSetupBillIds.length} selected</button>
                  </div>
                  <div className="setupList">
                    {cleanupCounts.missingAccount.map((bill) => (
                      <div key={bill.id} className="setupRow">
                        <label className="checkField compactCheck">
                          <input type="checkbox" checked={selectedSetupBillIds.includes(bill.id)} onChange={() => setSelectedSetupBillIds((prev) => prev.includes(bill.id) ? prev.filter((entry) => entry !== bill.id) : [...prev, bill.id])} />
                          <span />
                        </label>
                        <div className="setupRowMain">
                          <strong>{bill.name}</strong>
                          <span className="muted compactSubtext">Due {formatShortDate(bill.dueDate)}</span>
                        </div>
                        <div className="setupRowMeta"><span>{formatCurrency(bill.plannedAmount ?? bill.suggestedAmount ?? 0, cfg.currency)}</span></div>
                        <select value={bill.plannedAccountId || ""} onChange={(e) => assignBillAccount(bill, e.target.value)}>
                          <option value="">Select account</option>
                          {planner.accounts.filter((account) => account.id !== "unassigned").map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : null}

          {setupStep === 1 ? (
            <>
              <div className="row"><div><h3>Fill amounts</h3><div className="muted compactSubtext">Confirm fixed bills and review variable ones.</div></div></div>
              <div className="setupSection">
                <h4>Variable bills</h4>
                {variableBillsNeedingReview.length === 0 ? <div className="muted">No variable bills need review.</div> : null}
                <div className="setupList">
                  {variableBillsNeedingReview.map((bill) => (
                    <div key={bill.id} className="setupCard">
                      <div className="setupRowMain">
                        <strong>{bill.name}</strong>
                        <span className="muted compactSubtext">Due {formatShortDate(bill.dueDate)}</span>
                      </div>
                      <div className="muted compactSubtext">{bill.variableHistory.length > 0 ? bill.variableHistory.map((entry) => `${entry.monthLabel} ${formatCurrency(entry.amount, cfg.currency)}`).join(" | ") : "No recent reference"}</div>
                      <div className="setupActionRow">
                        <input type="number" value={amountDrafts[bill.id] ?? bill.plannedAmount ?? bill.suggestedAmount ?? ""} onChange={(e) => setAmountDrafts((prev) => ({ ...prev, [bill.id]: e.target.value }))} />
                        {bill.suggestedAmount ? <button type="button" onClick={() => confirmBillAmount(bill, bill.suggestedAmount)}>Approve {formatCurrency(bill.suggestedAmount, cfg.currency)}</button> : null}
                        <button type="button" onClick={() => confirmBillAmount(bill, amountDrafts[bill.id] ?? bill.plannedAmount ?? bill.suggestedAmount ?? "")}>Save</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="setupSection">
                <h4>Fixed bills</h4>
                {fixedBillsNeedingAmount.length === 0 ? <div className="muted">No fixed bills need amounts.</div> : null}
                <div className="setupList">
                  {fixedBillsNeedingAmount.map((bill) => (
                    <div key={bill.id} className="setupRow">
                      <div className="setupRowMain">
                        <strong>{bill.name}</strong>
                        <span className="muted compactSubtext">Due {formatShortDate(bill.dueDate)}</span>
                      </div>
                      <input type="number" value={amountDrafts[bill.id] ?? bill.plannedAmount ?? bill.suggestedAmount ?? ""} onChange={(e) => setAmountDrafts((prev) => ({ ...prev, [bill.id]: e.target.value }))} />
                      <button type="button" onClick={() => confirmBillAmount(bill, amountDrafts[bill.id] ?? bill.plannedAmount ?? bill.suggestedAmount ?? "")}>Confirm</button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {setupStep === 2 ? (
            <>
              <div className="row"><div><h3>Review plan</h3><div className="muted compactSubtext">Final check before returning to the planner.</div></div></div>
              <div className="summaryGrid two">
                {planner.paychecks.map((paycheck) => (
                  <div key={paycheck.slot} className="summaryCell">
                    <strong>{paycheck.label}</strong>
                    <span className="dataLabel">Income {formatCurrency(paycheck.expectedIncome, cfg.currency)}</span>
                    <span className="dataLabel">Planned {formatCurrency(paycheck.totalPlanned, cfg.currency)}</span>
                    <span className="dataLabel">Paid {formatCurrency(paycheck.totalPaid, cfg.currency)}</span>
                    <span className={`compactSubtext ${paycheck.projectedRemaining < 0 ? "neg" : "pos"}`}>Remaining {formatCurrency(paycheck.projectedRemaining, cfg.currency)}</span>
                  </div>
                ))}
              </div>
              {(cleanupCounts.missingAccount.length > 0 || cleanupCounts.missingAmount.length > 0 || cleanupCounts.variableNeedsReview.length > 0 || planner.paychecks.some((paycheck) => paycheck.projectedRemaining < 0)) ? (
                <div className="plannerIssueList">
                  {cleanupCounts.missingAccount.length > 0 ? <div className="plannerIssue danger">{cleanupCounts.missingAccount.length} bill(s) still missing an account.</div> : null}
                  {cleanupCounts.missingAmount.length > 0 ? <div className="plannerIssue warning">{cleanupCounts.missingAmount.length} bill(s) still missing an amount.</div> : null}
                  {cleanupCounts.variableNeedsReview.length > 0 ? <div className="plannerIssue warning">{cleanupCounts.variableNeedsReview.length} variable bill(s) still need review.</div> : null}
                  {planner.paychecks.some((paycheck) => paycheck.projectedRemaining < 0) ? <div className="plannerIssue danger">One or more paychecks project a negative remaining balance.</div> : null}
                </div>
              ) : <div className="plannerIssue success">This month is ready to use.</div>}
            </>
          ) : null}
        </div>
        <div className="setupFooter">
          <button type="button" onClick={goPrevSetupStep} disabled={setupStep === 0}>Back</button>
          <div className="spacer" />
          {setupStep < SETUP_STEPS.length - 1 ? <button type="button" className="primary" onClick={goNextSetupStep}>Next</button> : <button type="button" className="primary" onClick={completeSetupFlow}>Complete setup</button>}
        </div>
      </Modal>

      <Modal title={verificationBill ? `Review ${verificationBill.name}` : "Review bill"} open={verificationOpen} onClose={() => setVerificationOpen(false)}>
        {verificationBill ? (
          <>
            <div className="summaryGrid two" style={{ marginBottom: 12 }}>
              <div className="summaryCell compact"><span className="dataLabel">Planned amount</span><strong>{formatCurrency(verificationBill.plannedAmount || 0, cfg.currency)}</strong></div>
              <div className="summaryCell compact"><span className="dataLabel">Status</span><strong>{BILL_STATUS_LABELS[verificationBill.status] || verificationBill.status}</strong></div>
            </div>
            <div className="formGrid">
              <label>Actual amount<input type="number" value={verificationForm.actualAmount} onChange={(e) => setVerificationForm((prev) => ({ ...prev, actualAmount: e.target.value }))} /></label>
              <label>Paid date<input type="date" value={verificationForm.paidDate} onChange={(e) => setVerificationForm((prev) => ({ ...prev, paidDate: e.target.value }))} /></label>
              <label>
                Possible match
                <select value={verificationForm.linkedTransactionId} onChange={(e) => setVerificationForm((prev) => ({ ...prev, linkedTransactionId: e.target.value, manuallyConfirmed: !e.target.value }))}>
                  <option value="">Manual confirmation only</option>
                  {verificationBill.matchCandidates.map((candidate) => <option key={candidate.transaction.id} value={candidate.transaction.id}>{candidate.transaction.date} | {candidate.transaction.merchantName || candidate.transaction.payee} | {formatCurrency(candidate.transaction.amount, cfg.currency)}</option>)}
                </select>
              </label>
              <label>Notes<textarea value={verificationForm.notes} onChange={(e) => setVerificationForm((prev) => ({ ...prev, notes: e.target.value }))} /></label>
            </div>
          </>
        ) : null}
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveVerification}>Save review</button>
        </div>
      </Modal>

      <Modal
        title={incomeReviewGroup ? `${incomeReviewGroup.paycheck.label} • ${incomeReviewGroup.group.account.name} Income` : "Income Review"}
        open={incomeReviewOpen}
        onClose={() => setIncomeReviewOpen(false)}
      >
        <div className="setupStepBody">
          {(incomeReviewGroup?.group.incomes || []).map((incomeItem) => {
            const draft = incomeReviewForm.items[incomeItem.id] || {};
            return (
              <div key={incomeItem.id} className="setupCard">
                <div className="row">
                  <div>
                    <strong>{incomeItem.source}</strong>
                    <div className="muted compactSubtext">
                      {formatShortDate(incomeItem.payDate)} • {INCOME_STATUS_LABELS[incomeItem.status] || incomeItem.status}
                    </div>
                  </div>
                  <div className="spacer" />
                  <label className="checkField compactCheck">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.markReceived)}
                      onChange={(e) => setIncomeReviewForm((prev) => ({
                        items: {
                          ...prev.items,
                          [incomeItem.id]: {
                            ...prev.items[incomeItem.id],
                            markReceived: e.target.checked,
                          },
                        },
                      }))}
                    />
                    <span>Mark received</span>
                  </label>
                </div>
                <div className="formGrid">
                  <label>
                    Amount
                    <input
                      type="number"
                      value={draft.amount ?? ""}
                      onChange={(e) => setIncomeReviewForm((prev) => ({
                        items: {
                          ...prev.items,
                          [incomeItem.id]: {
                            ...prev.items[incomeItem.id],
                            amount: e.target.value,
                          },
                        },
                      }))}
                    />
                  </label>
                  <label>
                    Matched transaction
                    <select
                      value={draft.linkedTransactionId || ""}
                      onChange={(e) => setIncomeReviewForm((prev) => ({
                        items: {
                          ...prev.items,
                          [incomeItem.id]: {
                            ...prev.items[incomeItem.id],
                            linkedTransactionId: e.target.value,
                            manuallyConfirmed: !e.target.value,
                          },
                        },
                      }))}
                    >
                      <option value="">Manual confirmation</option>
                      {(incomeItem.matchCandidates || []).map((candidate) => (
                        <option key={candidate.transaction.id} value={candidate.transaction.id}>
                          {formatCurrency(candidate.transaction.amount, cfg.currency)} • {formatShortDate(candidate.transaction.date)} • {candidate.transaction.merchantName || candidate.transaction.payee || "Deposit"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Notes
                    <textarea
                      value={draft.notes || ""}
                      onChange={(e) => setIncomeReviewForm((prev) => ({
                        items: {
                          ...prev.items,
                          [incomeItem.id]: {
                            ...prev.items[incomeItem.id],
                            notes: e.target.value,
                          },
                        },
                      }))}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveIncomeReview}>Save income review</button>
        </div>
      </Modal>
    </div>
  );
}
