import React, { useEffect, useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import Modal from "../components/Modal";
import {
  deleteStatementItem,
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

export default function BillsIncomePage({
  uid,
  bills,
  income,
  billTemplates,
  incomeTemplates,
  accounts,
  settings,
  onToast,
  onError,
  selectedMonth,
  setSelectedMonth,
}) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
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
  const [forecastCollapsed, setForecastCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = window.localStorage.getItem("ft_cashflow_collapsed");
    if (saved !== null) return saved === "true";
    return window.matchMedia("(max-width: 768px)").matches;
  });
  const [paidBillsCollapsed, setPaidBillsCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("ft_paid_bills_collapsed") !== "false";
  });
  const [receivedIncomeCollapsed, setReceivedIncomeCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("ft_received_income_collapsed") !== "false";
  });
  const [templatesCollapsed, setTemplatesCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("ft_templates_collapsed") !== "false";
  });

  const now = new Date();
  const currentMonth = selectedMonth || monthKey(now);
  const viewDate = monthFromMonthId(currentMonth) || now;
  const isCurrentMonth = currentMonth === monthKey(now);
  const isReadOnly = !isCurrentMonth;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ft_cashflow_collapsed", String(forecastCollapsed));
  }, [forecastCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ft_paid_bills_collapsed", String(paidBillsCollapsed));
  }, [paidBillsCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ft_received_income_collapsed", String(receivedIncomeCollapsed));
  }, [receivedIncomeCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ft_templates_collapsed", String(templatesCollapsed));
  }, [templatesCollapsed]);

  const dueSoon = useMemo(() => getBillsDueWithinDays(bills, 7, now), [bills, now]);
  const dueLater = useMemo(() => getBillsDueLaterThisMonth(bills, now, 7), [bills, now]);
  const cashflow = useMemo(() => computeMonthTotals(bills, income, { now }), [bills, income, now]);

  const billRows = useMemo(() => {
    return [...(bills || [])].sort((a, b) => {
      const ad = a.dueDate?.toDate ? a.dueDate.toDate().getTime() : 0;
      const bd = b.dueDate?.toDate ? b.dueDate.toDate().getTime() : 0;
      return ad - bd;
    });
  }, [bills]);

  const incomeRows = useMemo(() => {
    return [...(income || [])].sort((a, b) => getIncomePayDate(a).getTime() - getIncomePayDate(b).getTime());
  }, [income]);

  const accountOptions = useMemo(
    () => [...(accounts || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [accounts]
  );

  const accountNameById = useMemo(() => {
    return accountOptions.reduce((map, account) => {
      map[account.id] = account.name || account.institution || account.id;
      return map;
    }, {});
  }, [accountOptions]);

  const activeBills = useMemo(
    () => billRows.filter((bill) => (bill.status || "unpaid") !== "paid"),
    [billRows]
  );
  const paidBills = useMemo(
    () => billRows.filter((bill) => bill.status === "paid"),
    [billRows]
  );
  const expectedIncome = useMemo(
    () => incomeRows.filter((item) => (item.status || "expected") !== "received"),
    [incomeRows]
  );
  const receivedIncome = useMemo(
    () => incomeRows.filter((item) => item.status === "received"),
    [incomeRows]
  );

  const monthIncomeTotal = useMemo(
    () => incomeRows.reduce((sum, i) => sum + safeNumber(i.amount ?? i.expectedAmount, 0), 0),
    [incomeRows]
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
    const resolvedPaidFrom =
      bill.paidFrom ||
      accountNameById[bill.accountId] ||
      bill.accountId ||
      "";
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

  function resolveBillFromLabel(bill) {
    return bill.paidFrom || accountNameById[bill.accountId] || bill.accountId || "-";
  }

  function setBillAccount(accountId) {
    const selected = accountOptions.find((account) => account.id === accountId);
    setBillForm((prev) => ({
      ...prev,
      accountId,
      paidFrom: selected?.name || "",
    }));
  }

  async function saveBill() {
    if (isReadOnly) return;
    if (!billForm.merchant.trim()) return;
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
      onToast("Bill saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save bill.", "error");
    }
  }

  async function removeBill(id) {
    if (isReadOnly) return;
    try {
      await deleteStatementItem(uid, currentMonth, "bills", id);
      onToast("Bill deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete bill.", "error");
    }
  }

  async function paid(bill) {
    if (isReadOnly) return;
    try {
      await markStatementBillPaid(uid, currentMonth, bill.id, bill.status !== "paid");
      onToast(`Updated ${bill.merchant || bill.name} payment status.`);
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to update paid status.", "error");
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
    if (isReadOnly) return;
    if (!incomeForm.source.trim()) return;
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
      onToast("Income entry saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save income entry.", "error");
    }
  }

  async function removeIncome(id) {
    if (isReadOnly) return;
    try {
      await deleteStatementItem(uid, currentMonth, "incomes", id);
      onToast("Income entry deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete income entry.", "error");
    }
  }

  async function toggleReceived(item) {
    if (isReadOnly) return;
    try {
      await markStatementIncomeReceived(uid, currentMonth, item.id, item.status !== "received");
      onToast(`Updated ${item.source || item.name} status.`);
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to update income status.", "error");
    }
  }

  async function syncMonth() {
    try {
      await syncRecurringItemsForMonth(uid, currentMonth);
      onToast("Recurring items synced for this month.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to sync recurring items.", "error");
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
      onToast("Failed to save recurring bill template.", "error");
    }
  }

  async function removeBillTemplate(id) {
    try {
      await deleteTemplate(uid, "bills", id);
      onToast("Recurring bill template deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete recurring bill template.", "error");
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
      onToast("Failed to save recurring income template.", "error");
    }
  }

  async function removeIncomeTemplate(id) {
    try {
      await deleteTemplate(uid, "incomes", id);
      onToast("Recurring income template deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete recurring income template.", "error");
    }
  }

  function renderBillTable(rows, emptyMessage) {
    return (
      <div className="tableWrap desktopDataTable">
        <table>
          <thead>
            <tr>
              <th>Merchant</th>
              <th>Amount</th>
              <th>Due Date</th>
              <th>From</th>
              <th>Status</th>
              <th>Paid At</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="muted">{emptyMessage}</td></tr>
            ) : null}
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{b.merchant || b.name}</td>
                <td>{formatCurrency(b.amount, cfg.currency)}</td>
                <td>{(b.dueDate?.toDate ? b.dueDate.toDate() : new Date()).toLocaleDateString()}</td>
                <td>{resolveBillFromLabel(b)}</td>
                <td>{b.status || "unpaid"}</td>
                <td>{b.paidAt?.toDate ? b.paidAt.toDate().toLocaleString() : "-"}</td>
                <td className="row">
                  <button type="button" onClick={() => paid(b)}>
                    {b.status === "paid" ? "Mark unpaid" : "Mark paid"}
                  </button>
                  <button type="button" onClick={() => startBillEdit(b)} disabled={isReadOnly}>Edit</button>
                  <button type="button" onClick={() => removeBill(b.id)} disabled={isReadOnly}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderBillCards(rows, emptyMessage) {
    return (
      <div className="mobileDataList">
        {rows.length === 0 ? <div className="card section muted">{emptyMessage}</div> : null}
        {rows.map((b) => (
          <article key={`mobile-bill-${b.id}`} className="card section dataItem">
            <div className="dataItemHeader">
              <h3 className="dataItemTitle">{b.merchant || b.name}</h3>
              <span className="pill">{b.status || "unpaid"}</span>
            </div>
            <div className="summaryGrid two">
              <div className="summaryCell"><span className="dataLabel">Amount</span><strong>{formatCurrency(b.amount, cfg.currency)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Due Date</span><strong>{(b.dueDate?.toDate ? b.dueDate.toDate() : new Date()).toLocaleDateString()}</strong></div>
              <div className="summaryCell"><span className="dataLabel">From</span><strong>{resolveBillFromLabel(b)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Paid At</span><strong>{b.paidAt?.toDate ? b.paidAt.toDate().toLocaleString() : "-"}</strong></div>
            </div>
            <div className="row dataActions">
              <button type="button" onClick={() => paid(b)}>
                {b.status === "paid" ? "Mark unpaid" : "Mark paid"}
              </button>
              <button type="button" onClick={() => startBillEdit(b)} disabled={isReadOnly}>Edit</button>
              <button type="button" onClick={() => removeBill(b.id)} disabled={isReadOnly}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderIncomeTable(rows, emptyMessage) {
    return (
      <div className="tableWrap desktopDataTable">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Amount</th>
              <th>Pay Date</th>
              <th>Status</th>
              <th>Received At</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="muted">{emptyMessage}</td></tr>
            ) : null}
            {rows.map((i) => (
              <tr key={i.id}>
                <td>{i.source || i.name}</td>
                <td>{formatCurrency(i.amount ?? i.expectedAmount, cfg.currency)}</td>
                <td>{getIncomePayDate(i).toLocaleDateString()}</td>
                <td>{i.status || "expected"}</td>
                <td>{i.receivedAt?.toDate ? i.receivedAt.toDate().toLocaleString() : "-"}</td>
                <td className="row">
                  <button type="button" onClick={() => toggleReceived(i)}>
                    {i.status === "received" ? "Mark expected" : "Mark received"}
                  </button>
                  <button type="button" onClick={() => startIncomeEdit(i)} disabled={isReadOnly}>Edit</button>
                  <button type="button" onClick={() => removeIncome(i.id)} disabled={isReadOnly}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderIncomeCards(rows, emptyMessage) {
    return (
      <div className="mobileDataList">
        {rows.length === 0 ? <div className="card section muted">{emptyMessage}</div> : null}
        {rows.map((i) => (
          <article key={`mobile-income-${i.id}`} className="card section dataItem">
            <div className="dataItemHeader">
              <h3 className="dataItemTitle">{i.source || i.name}</h3>
              <span className="pill">{i.status || "expected"}</span>
            </div>
            <div className="summaryGrid two">
              <div className="summaryCell"><span className="dataLabel">Amount</span><strong>{formatCurrency(i.amount ?? i.expectedAmount, cfg.currency)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Pay Date</span><strong>{getIncomePayDate(i).toLocaleDateString()}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Received At</span><strong>{i.receivedAt?.toDate ? i.receivedAt.toDate().toLocaleString() : "-"}</strong></div>
            </div>
            <div className="row dataActions">
              <button type="button" onClick={() => toggleReceived(i)}>
                {i.status === "received" ? "Mark expected" : "Mark received"}
              </button>
              <button type="button" onClick={() => startIncomeEdit(i)} disabled={isReadOnly}>Edit</button>
              <button type="button" onClick={() => removeIncome(i.id)} disabled={isReadOnly}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="page">
      <section className="card section pageHero">
        <div className="pageHeader">
          <div className="pageHeaderContent">
            <div className="pageEyebrow">Monthly operations</div>
            <h2>Bills & Income</h2>
            <p className="muted pageIntro">
              Manage the current month's obligations and incoming cash while keeping recurring templates and statement history intact.
            </p>
          </div>
          <div className="pageActions">
            <div className="actionCluster">
              <button type="button" onClick={() => goMonth(-1)}>Prev</button>
              <label className="fieldGroup compactField">
                <span>Month</span>
                <input type="month" value={currentMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
              </label>
              <button type="button" onClick={() => goMonth(1)}>Next</button>
            </div>
            <button type="button" onClick={syncMonth}>Sync now</button>
          </div>
        </div>
        {!isCurrentMonth ? <div className="muted">Viewing historical month {currentMonth} (read-only).</div> : null}
        <div className="muted">Recurring sync runs automatically. Use "Sync now" only if needed.</div>
      </section>

      <section className="card section">
        <button
          type="button"
          className="collapseToggle"
          onClick={() => setForecastCollapsed((value) => !value)}
          aria-expanded={!forecastCollapsed}
        >
          <span>Cashflow Forecast</span>
          <span className="muted">{forecastCollapsed ? ">" : "v"}</span>
        </button>
        {!forecastCollapsed ? (
          <div className="statsGrid forecastGrid">
            <div className="card section"><strong>Bills remaining:</strong> {formatCurrency(cashflow.totalBillsUnpaid, cfg.currency)}</div>
            <div className="card section"><strong>Due next 7 days:</strong> {dueSoon.length}</div>
            <div className="card section"><strong>Due later this month:</strong> {dueLater.length}</div>
            <div className="card section"><strong>Income expected:</strong> {formatCurrency(cashflow.totalIncomeExpected, cfg.currency)}</div>
            <div className="card section"><strong>Income received:</strong> {formatCurrency(cashflow.totalIncomeReceived, cfg.currency)}</div>
            <div className="card section"><strong>Bills paid:</strong> {formatCurrency(cashflow.totalBillsPaid, cfg.currency)}</div>
            <div className="card section"><strong>Remaining from received:</strong> {formatCurrency(cashflow.remainingFromReceived, cfg.currency)}</div>
            <div className="card section"><strong>Projected month end:</strong> {formatCurrency(cashflow.projectedRemaining, cfg.currency)}</div>
            <div className="card section"><strong>Total bills:</strong> {formatCurrency(cashflow.totalBills, cfg.currency)}</div>
          </div>
        ) : null}
      </section>

      <div className="twoCol">
        <section className="card section">
          <div className="row">
            <h2>Bills</h2>
            <div className="spacer" />
            <button type="button" className="primary" onClick={startBillAdd} disabled={isReadOnly}>Add Bill</button>
          </div>
          <div className="muted compactSubtext">Track what is still due, what has been paid, and which account each payment comes from.</div>

          <h4>Due next 7 days</h4>
          {dueSoon.length === 0 ? <div className="muted">No bills due in next 7 days.</div> : null}
          <ul className="cleanList">
            {dueSoon.map((b) => (
              <li key={`soon-${b.id}`} className="listRow">
                <span>{b.merchant || b.name}</span>
                <span>{b.nextDueDate.toLocaleDateString()}</span>
                <strong>{formatCurrency(b.amount, cfg.currency)}</strong>
              </li>
            ))}
          </ul>

          {renderBillTable(activeBills, "No unpaid bills this month.")}
          {renderBillCards(activeBills, "No unpaid bills this month.")}

          <section className="subsection">
            <div className="row">
              <h4>Paid Bills ({paidBills.length})</h4>
              <div className="spacer" />
              <button type="button" onClick={() => setPaidBillsCollapsed((value) => !value)}>
                {paidBillsCollapsed ? ">" : "v"}
              </button>
            </div>
            {!paidBillsCollapsed ? (
              <>
                {renderBillTable(paidBills, "No paid bills for this month.")}
                {renderBillCards(paidBills, "No paid bills for this month.")}
              </>
            ) : null}
          </section>
        </section>

        <section className="card section">
          <div className="row">
            <h2>Income</h2>
            <div className="spacer" />
            <button type="button" className="primary" onClick={startIncomeAdd} disabled={isReadOnly}>Add Income</button>
          </div>
          <div className="muted compactSubtext">Monitor expected paychecks, received income, and monthly cash entering your plan.</div>
          <div className="muted" style={{ marginBottom: 10 }}>
            This month total: {formatCurrency(monthIncomeTotal, cfg.currency)}
          </div>
          {renderIncomeTable(expectedIncome, "No expected income entries this month.")}
          {renderIncomeCards(expectedIncome, "No expected income entries this month.")}

          <section className="subsection">
            <div className="row">
              <h4>Received Income ({receivedIncome.length})</h4>
              <div className="spacer" />
              <button type="button" onClick={() => setReceivedIncomeCollapsed((value) => !value)}>
                {receivedIncomeCollapsed ? ">" : "v"}
              </button>
            </div>
            {!receivedIncomeCollapsed ? (
              <>
                {renderIncomeTable(receivedIncome, "No received income for this month.")}
                {renderIncomeCards(receivedIncome, "No received income for this month.")}
              </>
            ) : null}
          </section>
        </section>
      </div>

      <Modal title={billEditingId ? "Edit Bill" : "Add Bill"} open={billOpen} onClose={() => setBillOpen(false)}>
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
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveBill}>Save</button>
        </div>
      </Modal>

      <Modal title={incomeEditingId ? "Edit Income" : "Add Income"} open={incomeOpen} onClose={() => setIncomeOpen(false)}>
        <div className="formGrid">
          <label>Source<input value={incomeForm.source} onChange={(e) => setIncomeForm({ ...incomeForm, source: e.target.value })} /></label>
          <label>Amount<input type="number" value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} /></label>
          <label>Pay Day<input type="number" min="1" max="31" value={incomeForm.payDay} onChange={(e) => setIncomeForm({ ...incomeForm, payDay: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveIncome}>Save</button>
        </div>
      </Modal>

      <section className="card section">
        <div className="row">
          <h3>Recurring Templates</h3>
          <div className="spacer" />
          <button type="button" onClick={() => setTemplatesCollapsed((v) => !v)}>
            {templatesCollapsed ? ">" : "v"}
          </button>
        </div>
        {!templatesCollapsed ? (
          <>
            <div className="row" style={{ marginBottom: 8 }}>
              <button type="button" onClick={startBillTemplateAdd}>Add Recurring Bill</button>
              <button type="button" onClick={startIncomeTemplateAdd}>Add Recurring Income</button>
            </div>
            <div className="twoCol">
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>Bills templates</div>
                <ul className="cleanList">
                  {billTemplates?.map((t) => (
                    <li key={t.id} className="listRow">
                      <span>{t.merchant}</span>
                      <span>Day {t.dueDay}</span>
                      <span>{formatCurrency(t.defaultAmount, cfg.currency)}</span>
                      <span className="row">
                        <button type="button" onClick={() => startBillTemplateEdit(t)}>Edit</button>
                        <button type="button" onClick={() => removeBillTemplate(t.id)}>Delete</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>Income templates</div>
                <ul className="cleanList">
                  {incomeTemplates?.map((t) => (
                    <li key={t.id} className="listRow">
                      <span>{t.source}</span>
                      <span>Day {t.payDay}</span>
                      <span>{formatCurrency(t.defaultAmount, cfg.currency)}</span>
                      <span className="row">
                        <button type="button" onClick={() => startIncomeTemplateEdit(t)}>Edit</button>
                        <button type="button" onClick={() => removeIncomeTemplate(t.id)}>Delete</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        ) : null}
      </section>

      <Modal title={billTemplateEditingId ? "Edit Recurring Bill" : "Add Recurring Bill"} open={billTemplateOpen} onClose={() => setBillTemplateOpen(false)}>
        <div className="formGrid">
          <label>Merchant<input value={billTemplateForm.merchant} onChange={(e) => setBillTemplateForm({ ...billTemplateForm, merchant: e.target.value })} /></label>
          <label>Due Day<input type="number" min="1" max="31" value={billTemplateForm.dueDay} onChange={(e) => setBillTemplateForm({ ...billTemplateForm, dueDay: e.target.value })} /></label>
          <label>Default Amount<input type="number" value={billTemplateForm.defaultAmount} onChange={(e) => setBillTemplateForm({ ...billTemplateForm, defaultAmount: e.target.value })} /></label>
          <label>Default Paid From<input value={billTemplateForm.defaultPaidFrom} onChange={(e) => setBillTemplateForm({ ...billTemplateForm, defaultPaidFrom: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveBillTemplate}>Save</button>
        </div>
      </Modal>

      <Modal title={incomeTemplateEditingId ? "Edit Recurring Income" : "Add Recurring Income"} open={incomeTemplateOpen} onClose={() => setIncomeTemplateOpen(false)}>
        <div className="formGrid">
          <label>Source<input value={incomeTemplateForm.source} onChange={(e) => setIncomeTemplateForm({ ...incomeTemplateForm, source: e.target.value })} /></label>
          <label>Pay Day<input type="number" min="1" max="31" value={incomeTemplateForm.payDay} onChange={(e) => setIncomeTemplateForm({ ...incomeTemplateForm, payDay: e.target.value })} /></label>
          <label>Default Amount<input type="number" value={incomeTemplateForm.defaultAmount} onChange={(e) => setIncomeTemplateForm({ ...incomeTemplateForm, defaultAmount: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveIncomeTemplate}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
