import React, { useMemo, useState } from "react";
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
  DEFAULT_SETTINGS,
  formatCurrency,
  getIncomePayDate,
  getUpcomingBills,
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

  const now = new Date();
  const currentMonth = selectedMonth || monthKey(now);
  const viewDate = monthFromMonthId(currentMonth) || now;
  const isCurrentMonth = currentMonth === monthKey(now);

  const dueSoon = useMemo(() => getUpcomingBills(bills, { days: 7, now }), [bills, now]);

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
    setBillForm(EMPTY_BILL);
    setBillOpen(true);
  }

  function startBillEdit(bill) {
    setBillEditingId(bill.id);
    setBillForm({
      merchant: bill.merchant || bill.name || "",
      amount: bill.amount || 0,
      dueDay: bill.dueDay || 1,
      paidFrom: bill.paidFrom || bill.accountId || "",
      accountId: bill.accountId || "",
      status: bill.status || "unpaid",
    });
    setBillOpen(true);
  }

  async function saveBill() {
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
          paidFrom: billForm.paidFrom || "",
          accountId: billForm.paidFrom || billForm.accountId || "",
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
    try {
      await deleteStatementItem(uid, currentMonth, "bills", id);
      onToast("Bill deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete bill.", "error");
    }
  }

  async function paid(bill) {
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
    try {
      await deleteStatementItem(uid, currentMonth, "incomes", id);
      onToast("Income entry deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete income entry.", "error");
    }
  }

  async function toggleReceived(item) {
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

  return (
    <div className="page">
      <section className="card section">
        <div className="row">
          <h2>Bills & Income</h2>
          <div className="spacer" />
          <button type="button" onClick={() => goMonth(-1)}>Prev</button>
          <input type="month" value={currentMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
          <button type="button" onClick={() => goMonth(1)}>Next</button>
          <button type="button" onClick={syncMonth}>Sync recurring items</button>
        </div>
        {!isCurrentMonth ? <div className="muted">Viewing historical month {currentMonth}.</div> : null}
      </section>

      <section className="card section">
        <div className="row">
          <h3>Recurring Templates</h3>
          <div className="spacer" />
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
      </section>

      <div className="twoCol">
        <section className="card section">
          <div className="row">
            <h2>Bills</h2>
            <div className="spacer" />
            <button type="button" className="primary" onClick={startBillAdd}>Add Bill</button>
          </div>

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

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th>Paid From</th>
                  <th>Status</th>
                  <th>Paid At</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {billRows.length === 0 ? (
                  <tr><td colSpan={7} className="muted">No bills this month.</td></tr>
                ) : null}
                {billRows.map((b) => (
                  <tr key={b.id}>
                    <td>{b.merchant || b.name}</td>
                    <td>{formatCurrency(b.amount, cfg.currency)}</td>
                    <td>{(b.dueDate?.toDate ? b.dueDate.toDate() : new Date()).toLocaleDateString()}</td>
                    <td>{b.paidFrom || b.accountId || "-"}</td>
                    <td>{b.status || "unpaid"}</td>
                    <td>{b.paidAt?.toDate ? b.paidAt.toDate().toLocaleString() : "-"}</td>
                    <td className="row">
                      <button type="button" onClick={() => paid(b)}>
                        {b.status === "paid" ? "Mark unpaid" : "Mark paid"}
                      </button>
                      <button type="button" onClick={() => startBillEdit(b)}>Edit</button>
                      <button type="button" onClick={() => removeBill(b.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card section">
          <div className="row">
            <h2>Income</h2>
            <div className="spacer" />
            <button type="button" className="primary" onClick={startIncomeAdd}>Add Income</button>
          </div>
          <div className="muted" style={{ marginBottom: 10 }}>
            This month total: {formatCurrency(monthIncomeTotal, cfg.currency)}
          </div>
          <div className="tableWrap">
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
                {incomeRows.length === 0 ? (
                  <tr><td colSpan={6} className="muted">No income entries this month.</td></tr>
                ) : null}
                {incomeRows.map((i) => (
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
                      <button type="button" onClick={() => startIncomeEdit(i)}>Edit</button>
                      <button type="button" onClick={() => removeIncome(i.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Modal title={billEditingId ? "Edit Bill" : "Add Bill"} open={billOpen} onClose={() => setBillOpen(false)}>
        <div className="formGrid">
          <label>Merchant<input value={billForm.merchant} onChange={(e) => setBillForm({ ...billForm, merchant: e.target.value })} /></label>
          <label>Amount<input type="number" value={billForm.amount} onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })} /></label>
          <label>Due Day<input type="number" min="1" max="31" value={billForm.dueDay} onChange={(e) => setBillForm({ ...billForm, dueDay: e.target.value })} /></label>
          <label>Paid From<input value={billForm.paidFrom} onChange={(e) => setBillForm({ ...billForm, paidFrom: e.target.value })} /></label>
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
