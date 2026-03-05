import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";
import { deleteEntity, markBillPaid, upsertEntity } from "../lib/db";
import {
  billStatus,
  computeNextDueDate,
  DEFAULT_SETTINGS,
  formatCurrency,
  monthKey,
  safeNumber,
} from "../lib/finance";

const EMPTY_BILL = {
  name: "",
  amount: 0,
  dueDay: 1,
  category: "General",
  autopay: false,
  accountId: "",
  notes: "",
};

const EMPTY_INCOME = {
  name: "",
  expectedAmount: 0,
  paySchedule: "monthly",
  nextPayDate: new Date().toISOString().slice(0, 10),
  depositAccountId: "",
};

export default function BillsIncomePage({ uid, bills, income, accounts, settings, onToast }) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [billOpen, setBillOpen] = useState(false);
  const [billForm, setBillForm] = useState(EMPTY_BILL);
  const [billEditingId, setBillEditingId] = useState(null);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [incomeForm, setIncomeForm] = useState(EMPTY_INCOME);
  const [incomeEditingId, setIncomeEditingId] = useState(null);

  const now = new Date();
  const currentMonth = monthKey(now);

  const billRows = useMemo(() => {
    return (bills || [])
      .map((b) => ({
        ...b,
        nextDueDate: computeNextDueDate(b.dueDay, now),
        status: billStatus(b, now),
      }))
      .sort((a, b) => a.nextDueDate - b.nextDueDate);
  }, [bills, now]);

  const dueSoon = billRows.filter((b) => b.status === "dueSoon");

  const upcomingIncome = useMemo(() => {
    return [...(income || [])].sort((a, b) => new Date(a.nextPayDate) - new Date(b.nextPayDate));
  }, [income]);

  const monthIncomeTotal = useMemo(
    () =>
      (income || [])
        .filter((i) => monthKey(new Date(i.nextPayDate || now)) === currentMonth)
        .reduce((sum, i) => sum + safeNumber(i.expectedAmount, 0), 0),
    [currentMonth, income, now]
  );

  function startBillAdd() {
    setBillEditingId(null);
    setBillForm(EMPTY_BILL);
    setBillOpen(true);
  }

  function startBillEdit(bill) {
    setBillEditingId(bill.id);
    setBillForm({ ...EMPTY_BILL, ...bill });
    setBillOpen(true);
  }

  async function saveBill() {
    if (!billForm.name.trim()) return;
    await upsertEntity(
      uid,
      "bills",
      {
        ...billForm,
        name: billForm.name.trim(),
        amount: Math.abs(safeNumber(billForm.amount, 0)),
        dueDay: Math.max(1, Math.min(31, Number(billForm.dueDay) || 1)),
        autopay: Boolean(billForm.autopay),
      },
      billEditingId || undefined
    );
    setBillOpen(false);
    onToast("Bill saved.");
  }

  async function removeBill(id) {
    await deleteEntity(uid, "bills", id);
    onToast("Bill deleted.");
  }

  async function paid(bill) {
    await markBillPaid(uid, bill);
    onToast(`Marked ${bill.name} as paid.`);
  }

  function startIncomeAdd() {
    setIncomeEditingId(null);
    setIncomeForm(EMPTY_INCOME);
    setIncomeOpen(true);
  }

  function startIncomeEdit(item) {
    setIncomeEditingId(item.id);
    setIncomeForm({ ...EMPTY_INCOME, ...item });
    setIncomeOpen(true);
  }

  async function saveIncome() {
    if (!incomeForm.name.trim()) return;
    await upsertEntity(
      uid,
      "income",
      {
        ...incomeForm,
        name: incomeForm.name.trim(),
        expectedAmount: Math.abs(safeNumber(incomeForm.expectedAmount, 0)),
      },
      incomeEditingId || undefined
    );
    setIncomeOpen(false);
    onToast("Income entry saved.");
  }

  async function removeIncome(id) {
    await deleteEntity(uid, "income", id);
    onToast("Income entry deleted.");
  }

  return (
    <div className="page">
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
                <span>{b.name}</span>
                <span>{b.nextDueDate.toLocaleDateString()}</span>
                <strong>{formatCurrency(b.amount, cfg.currency)}</strong>
              </li>
            ))}
          </ul>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Amount</th>
                  <th>Due Day</th>
                  <th>Category</th>
                  <th>Account</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {billRows.length === 0 ? (
                  <tr><td colSpan={7} className="muted">No bills yet.</td></tr>
                ) : null}
                {billRows.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td>{formatCurrency(b.amount, cfg.currency)}</td>
                    <td>{b.dueDay}</td>
                    <td>{b.category || "-"}</td>
                    <td>{accounts.find((a) => a.id === b.accountId)?.name || "-"}</td>
                    <td>
                      <span className={`pill ${b.status === "overdue" ? "danger" : b.status === "dueSoon" ? "warn" : ""}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="row">
                      <button type="button" onClick={() => paid(b)}>Mark paid</button>
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
                  <th>Name</th>
                  <th>Expected</th>
                  <th>Schedule</th>
                  <th>Next Pay Date</th>
                  <th>Deposit Account</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {upcomingIncome.length === 0 ? (
                  <tr><td colSpan={6} className="muted">No income entries yet.</td></tr>
                ) : null}
                {upcomingIncome.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>{formatCurrency(i.expectedAmount, cfg.currency)}</td>
                    <td>{i.paySchedule}</td>
                    <td>{i.nextPayDate || "-"}</td>
                    <td>{accounts.find((a) => a.id === i.depositAccountId)?.name || "-"}</td>
                    <td className="row">
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
          <label>Name<input value={billForm.name} onChange={(e) => setBillForm({ ...billForm, name: e.target.value })} /></label>
          <label>Amount<input type="number" value={billForm.amount} onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })} /></label>
          <label>Due Day<input type="number" min="1" max="31" value={billForm.dueDay} onChange={(e) => setBillForm({ ...billForm, dueDay: e.target.value })} /></label>
          <label>Category<input value={billForm.category} onChange={(e) => setBillForm({ ...billForm, category: e.target.value })} /></label>
          <label>
            Account
            <select value={billForm.accountId || ""} onChange={(e) => setBillForm({ ...billForm, accountId: e.target.value })}>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="row">
            <input type="checkbox" checked={Boolean(billForm.autopay)} onChange={(e) => setBillForm({ ...billForm, autopay: e.target.checked })} />
            <span>Autopay</span>
          </label>
          <label>Notes<textarea value={billForm.notes || ""} onChange={(e) => setBillForm({ ...billForm, notes: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveBill}>Save</button>
        </div>
      </Modal>

      <Modal title={incomeEditingId ? "Edit Income" : "Add Income"} open={incomeOpen} onClose={() => setIncomeOpen(false)}>
        <div className="formGrid">
          <label>Name<input value={incomeForm.name} onChange={(e) => setIncomeForm({ ...incomeForm, name: e.target.value })} /></label>
          <label>Expected Amount<input type="number" value={incomeForm.expectedAmount} onChange={(e) => setIncomeForm({ ...incomeForm, expectedAmount: e.target.value })} /></label>
          <label>
            Schedule
            <select value={incomeForm.paySchedule} onChange={(e) => setIncomeForm({ ...incomeForm, paySchedule: e.target.value })}>
              <option value="weekly">weekly</option>
              <option value="biweekly">biweekly</option>
              <option value="monthly">monthly</option>
              <option value="custom">custom</option>
            </select>
          </label>
          <label>Next Pay Date<input type="date" value={incomeForm.nextPayDate || ""} onChange={(e) => setIncomeForm({ ...incomeForm, nextPayDate: e.target.value })} /></label>
          <label>
            Deposit Account
            <select value={incomeForm.depositAccountId || ""} onChange={(e) => setIncomeForm({ ...incomeForm, depositAccountId: e.target.value })}>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveIncome}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
