import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";
import { deleteTemplate, syncRecurringItemsForMonth, upsertTemplate } from "../lib/db";
import { DEFAULT_SETTINGS, formatCurrency, safeNumber } from "../lib/finance";
import {
  buildAccountDirectory,
  getPaycheckLabel,
  getIncomeTemplateFormDefaults,
  normalizeIncomeTemplate,
  PAYCHECK_SLOT_OPTIONS,
} from "../lib/planner";

export default function IncomePage({
  uid,
  settings,
  selectedMonth,
  incomeTemplates,
  accounts,
  linkedAccounts,
  onToast,
  onError,
}) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(getIncomeTemplateFormDefaults());
  const [showInactive, setShowInactive] = useState(false);

  const normalizedTemplates = useMemo(
    () => (incomeTemplates || []).map((template) => normalizeIncomeTemplate(template)),
    [incomeTemplates]
  );

  const rows = useMemo(
    () =>
      normalizedTemplates
        .filter((template) => showInactive || template.active)
        .sort((a, b) => String(a.source || "").localeCompare(String(b.source || ""))),
    [normalizedTemplates, showInactive]
  );

  const accountOptions = useMemo(
    () => buildAccountDirectory(accounts, linkedAccounts),
    [accounts, linkedAccounts]
  );

  function startAdd() {
    setEditingId(null);
    setForm(getIncomeTemplateFormDefaults());
    setOpen(true);
  }

  function startEdit(template) {
    setEditingId(template.id);
    setForm(getIncomeTemplateFormDefaults(template));
    setOpen(true);
  }

  async function syncCurrentMonth() {
    if (!uid || !selectedMonth) return;
    await syncRecurringItemsForMonth(uid, selectedMonth);
  }

  async function saveTemplate() {
    if (!form.source.trim()) return;
    try {
      await upsertTemplate(
        uid,
        "incomes",
        {
          ...form,
          source: form.source.trim(),
          payDay: Math.max(1, Math.min(31, Number(form.payDay) || 1)),
          defaultAmount: Math.abs(safeNumber(form.defaultAmount, 0)),
          active: Boolean(form.active),
        },
        editingId || undefined
      );
      await syncCurrentMonth();
      setOpen(false);
      onToast("Income template saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save income template.", "error");
    }
  }

  async function removeTemplate(id) {
    try {
      await deleteTemplate(uid, "incomes", id);
      await syncCurrentMonth();
      onToast("Income template deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete income template.", "error");
    }
  }

  return (
    <div className="page">
      <section className="card section">
        <div className="row">
          <div>
            <h2>Income</h2>
            <div className="muted pageIntro">
              Recurring income templates feed the planner the same way bill templates do.
            </div>
          </div>
          <div className="spacer" />
          <label className="checkField compactCheck">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            <span>Show inactive</span>
          </label>
          <button type="button" className="primary" onClick={startAdd}>Add income template</button>
        </div>
      </section>

      <section className="card section">
        <div className="plannerTableWrap desktopDataTable">
          <table className="plannerTable">
            <thead>
              <tr>
                <th>Source</th>
                <th>Pay day</th>
                <th>Paycheck</th>
                <th>Deposit account</th>
                <th>Default amount</th>
                <th>Flags</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">No income templates yet.</td>
                </tr>
              ) : null}
              {rows.map((template) => {
                const account = accountOptions.find((entry) => entry.id === template.depositAccountId);
                return (
                  <tr key={template.id}>
                    <td>
                      <div className="plannerBillTitle">{template.source}</div>
                      <div className="muted compactSubtext">{template.notes || "No notes"}</div>
                    </td>
                    <td>{template.payDay}</td>
                    <td>{getPaycheckLabel(template.paycheckSlot)}</td>
                    <td>{account?.name || template.depositAccountId || "Unassigned"}</td>
                    <td>{formatCurrency(template.defaultAmount, cfg.currency)}</td>
                    <td>
                      <div className="templateFlags">
                        <span className="pill">{template.active ? "Active" : "Inactive"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="row plannerRowActions">
                        <button type="button" onClick={() => startEdit(template)}>Edit</button>
                        <button type="button" onClick={() => removeTemplate(template.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mobileDataList">
          {rows.length === 0 ? <div className="card section muted">No income templates yet.</div> : null}
          {rows.map((template) => {
            const account = accountOptions.find((entry) => entry.id === template.depositAccountId);
            return (
              <article key={`mobile-income-template-${template.id}`} className="card section dataItem">
                <div className="dataItemHeader">
                  <div>
                    <h3 className="dataItemTitle">{template.source}</h3>
                    <div className="muted compactSubtext">{template.notes || "No notes"}</div>
                  </div>
                  <span className="pill">{template.active ? "Active" : "Inactive"}</span>
                </div>

                <div className="summaryGrid two">
                  <div className="summaryCell compact">
                    <span className="dataLabel">Pay day</span>
                    <strong>{template.payDay}</strong>
                  </div>
                  <div className="summaryCell compact">
                    <span className="dataLabel">Paycheck</span>
                    <strong>{getPaycheckLabel(template.paycheckSlot)}</strong>
                  </div>
                  <div className="summaryCell compact">
                    <span className="dataLabel">Deposit account</span>
                    <strong>{account?.name || template.depositAccountId || "Unassigned"}</strong>
                  </div>
                  <div className="summaryCell compact">
                    <span className="dataLabel">Default amount</span>
                    <strong>{formatCurrency(template.defaultAmount, cfg.currency)}</strong>
                  </div>
                </div>

                <div className="templateFlags" style={{ marginTop: 10 }}>
                  <span className="pill">{template.active ? "Active" : "Inactive"}</span>
                </div>

                <div className="row dataActions" style={{ marginTop: 10 }}>
                  <button type="button" onClick={() => startEdit(template)}>Edit</button>
                  <button type="button" onClick={() => removeTemplate(template.id)}>Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <Modal title={editingId ? "Edit income template" : "Add income template"} open={open} onClose={() => setOpen(false)}>
        <div className="formGrid">
          <label>
            Source
            <input value={form.source} onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))} />
          </label>
          <label>
            Deposit account
            <select value={form.depositAccountId} onChange={(e) => setForm((prev) => ({ ...prev, depositAccountId: e.target.value }))}>
              <option value="">Select account</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pay day
            <input type="number" min="1" max="31" value={form.payDay} onChange={(e) => setForm((prev) => ({ ...prev, payDay: e.target.value }))} />
          </label>
          <label>
            Paycheck slot
            <select value={form.paycheckSlot} onChange={(e) => setForm((prev) => ({ ...prev, paycheckSlot: e.target.value }))}>
              {PAYCHECK_SLOT_OPTIONS.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Default amount
            <input type="number" value={form.defaultAmount} onChange={(e) => setForm((prev) => ({ ...prev, defaultAmount: e.target.value }))} />
          </label>
          <label className="checkField">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} />
            <span>Active</span>
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Notes
            <textarea value={form.notes || ""} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveTemplate}>Save income template</button>
        </div>
      </Modal>
    </div>
  );
}
