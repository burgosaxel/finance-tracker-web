import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";
import { bulkUpdateBillTemplates, deleteTemplate, syncRecurringItemsForMonth, upsertTemplate } from "../lib/db";
import { DEFAULT_SETTINGS, formatCurrency, safeNumber } from "../lib/finance";
import { buildAccountDirectory, getBillFormDefaults, getPaycheckLabel, isStructuralTemplateName, normalizeBillTemplate, PAYCHECK_SLOT_OPTIONS } from "../lib/planner";

export default function BillsPage({
  uid,
  settings,
  selectedMonth,
  billTemplates,
  accounts,
  linkedAccounts,
  onToast,
  onError,
}) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(getBillFormDefaults());
  const [showInactive, setShowInactive] = useState(false);
  const [cleanupAccountId, setCleanupAccountId] = useState("");

  const normalizedTemplates = useMemo(
    () => (billTemplates || []).map((template) => normalizeBillTemplate(template)),
    [billTemplates]
  );

  const accountOptions = useMemo(
    () => buildAccountDirectory(accounts, linkedAccounts),
    [accounts, linkedAccounts]
  );

  const rows = useMemo(
    () =>
      normalizedTemplates
        .filter((template) => showInactive || (!template.hidden && template.active))
        .sort((a, b) => String(a.name || a.merchant || "").localeCompare(String(b.name || b.merchant || ""))),
    [normalizedTemplates, showInactive]
  );

  const cleanup = useMemo(() => {
    const structural = normalizedTemplates.filter((template) => isStructuralTemplateName(template.name) || template.system);
    const missingAccount = normalizedTemplates.filter(
      (template) => !template.hidden && template.active && !template.defaultAccountId
    );
    const missingAmount = normalizedTemplates.filter(
      (template) => !template.hidden && template.active && template.amountType === "fixed" && safeNumber(template.defaultAmount, 0) <= 0
    );
    const inactive = normalizedTemplates.filter((template) => !template.active || template.hidden);
    return { structural, missingAccount, missingAmount, inactive };
  }, [normalizedTemplates]);

  function startAdd() {
    setEditingId(null);
    setForm(getBillFormDefaults());
    setOpen(true);
  }

  function startEdit(template) {
    setEditingId(template.id);
    setForm(getBillFormDefaults(template));
    setOpen(true);
  }

  async function syncCurrentMonth() {
    if (!uid || !selectedMonth) return;
    await syncRecurringItemsForMonth(uid, selectedMonth);
  }

  async function saveTemplate() {
    if (!form.name.trim()) return;
    try {
      await upsertTemplate(
        uid,
        "bills",
        {
          ...form,
          name: form.name.trim(),
          dueDay: Math.max(1, Math.min(31, Number(form.dueDay) || 1)),
          defaultAmount: safeNumber(form.defaultAmount, 0),
          autopay: Boolean(form.autopay),
          plaidMatchEnabled: Boolean(form.plaidMatchEnabled),
          active: Boolean(form.active),
          hidden: Boolean(form.hidden),
          system: Boolean(form.system),
        },
        editingId || undefined
      );
      await syncCurrentMonth();
      setOpen(false);
      onToast("Bill template saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save bill template.", "error");
    }
  }

  async function removeTemplate(id) {
    try {
      await deleteTemplate(uid, "bills", id);
      await syncCurrentMonth();
      onToast("Bill template deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete bill template.", "error");
    }
  }

  async function bulkHideStructural() {
    if (cleanup.structural.length === 0) return;
    try {
      await bulkUpdateBillTemplates(uid, cleanup.structural, {
        hidden: true,
        system: true,
        active: false,
      });
      await syncCurrentMonth();
      onToast("Structural rows hidden.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to hide structural rows.", "error");
    }
  }

  async function bulkHideInactive() {
    if (cleanup.inactive.length === 0) return;
    try {
      await bulkUpdateBillTemplates(uid, cleanup.inactive, {
        hidden: true,
      });
      await syncCurrentMonth();
      onToast("Inactive rows hidden.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to hide inactive rows.", "error");
    }
  }

  async function bulkAssignMissingAccounts() {
    if (!cleanupAccountId || cleanup.missingAccount.length === 0) return;
    try {
      await bulkUpdateBillTemplates(uid, cleanup.missingAccount, {
        defaultAccountId: cleanupAccountId,
      });
      await syncCurrentMonth();
      onToast("Missing accounts assigned.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to assign accounts.", "error");
    }
  }

  async function bulkConvertMissingAmountsToVariable() {
    if (cleanup.missingAmount.length === 0) return;
    try {
      await bulkUpdateBillTemplates(uid, cleanup.missingAmount, {
        amountType: "variable",
      });
      await syncCurrentMonth();
      onToast("Missing amount rows converted to variable.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to convert missing amounts.", "error");
    }
  }

  function getTemplateFlags(template) {
    return [
      template.autopay ? "Autopay" : "Manual",
      template.plaidMatchEnabled === false ? "No match" : "Match-ready",
      template.active === false || template.isActive === false ? "Inactive" : "Active",
      ...(template.hidden ? ["Hidden"] : []),
      ...(template.system ? ["System"] : []),
    ];
  }

  return (
    <div className="page">
      <section className="card section">
        <div className="row">
          <div>
            <h2>Bills / Templates</h2>
            <div className="muted pageIntro">
              Recurring bill templates drive each month’s bill instances and paycheck assignments.
            </div>
          </div>
          <div className="spacer" />
          <label className="checkField compactCheck">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            <span>Show hidden/inactive</span>
          </label>
          <button type="button" className="primary" onClick={startAdd}>Add bill template</button>
        </div>
      </section>

      <section className="card section">
        <div className="row">
          <div>
            <h3>Cleanup Utility</h3>
            <div className="muted compactSubtext">Batch-fix the rows that create worksheet noise.</div>
          </div>
          <div className="spacer" />
          <button type="button" onClick={bulkHideStructural} disabled={cleanup.structural.length === 0}>Hide structural rows</button>
          <button type="button" onClick={bulkHideInactive} disabled={cleanup.inactive.length === 0}>Hide inactive rows</button>
        </div>
        <div className="summaryGrid four" style={{ marginTop: 10 }}>
          <div className="summaryCell compact">
            <span className="dataLabel">Missing account</span>
            <strong>{cleanup.missingAccount.length}</strong>
          </div>
          <div className="summaryCell compact">
            <span className="dataLabel">Missing amount</span>
            <strong>{cleanup.missingAmount.length}</strong>
          </div>
          <div className="summaryCell compact">
            <span className="dataLabel">Structural/system</span>
            <strong>{cleanup.structural.length}</strong>
          </div>
          <div className="summaryCell compact">
            <span className="dataLabel">Inactive/hidden</span>
            <strong>{cleanup.inactive.length}</strong>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <select value={cleanupAccountId} onChange={(e) => setCleanupAccountId(e.target.value)}>
            <option value="">Assign missing-account templates to...</option>
            {accountOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={bulkAssignMissingAccounts} disabled={!cleanupAccountId || cleanup.missingAccount.length === 0}>
            Apply account to missing-account rows
          </button>
          <button type="button" onClick={bulkConvertMissingAmountsToVariable} disabled={cleanup.missingAmount.length === 0}>
            Mark missing amounts as variable
          </button>
        </div>
      </section>

      <section className="card section">
        <div className="plannerTableWrap desktopDataTable">
          <table className="plannerTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Due day</th>
                <th>Paycheck</th>
                <th>Account</th>
                <th>Type</th>
                <th>Default amount</th>
                <th>Flags</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">No bill templates yet.</td>
                </tr>
              ) : null}
              {rows.map((template) => {
                const account = accountOptions.find((entry) => entry.id === (template.defaultAccountId || template.defaultPaidFrom));
                return (
                  <tr key={template.id}>
                    <td>
                      <div className="plannerBillTitle">{template.name || template.merchant}</div>
                      <div className="muted compactSubtext">{template.category || "No category"}</div>
                    </td>
                    <td>{template.dueDay}</td>
                    <td>{getPaycheckLabel(template.paycheckSlot || (Number(template.dueDay) <= 14 ? "slot1" : "slot2"))}</td>
                    <td>{account?.name || template.defaultAccountId || template.defaultPaidFrom || "Unassigned"}</td>
                    <td>{template.amountType || "fixed"}</td>
                    <td>{formatCurrency(template.defaultAmount, cfg.currency)}</td>
                    <td>
                      <div className="templateFlags">
                        {getTemplateFlags(template).map((flag) => (
                          <span key={`${template.id}-${flag}`} className="pill">{flag}</span>
                        ))}
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
          {rows.length === 0 ? <div className="card section muted">No bill templates yet.</div> : null}
          {rows.map((template) => {
            const account = accountOptions.find((entry) => entry.id === (template.defaultAccountId || template.defaultPaidFrom));
            return (
              <article key={`mobile-template-${template.id}`} className="card section dataItem">
                <div className="dataItemHeader">
                  <div>
                    <h3 className="dataItemTitle">{template.name || template.merchant}</h3>
                    <div className="muted compactSubtext">{template.category || "No category"}</div>
                  </div>
                  <span className="pill">{template.amountType || "fixed"}</span>
                </div>

                <div className="summaryGrid two">
                  <div className="summaryCell compact">
                    <span className="dataLabel">Due day</span>
                    <strong>{template.dueDay}</strong>
                  </div>
                  <div className="summaryCell compact">
                    <span className="dataLabel">Paycheck</span>
                    <strong>{getPaycheckLabel(template.paycheckSlot || (Number(template.dueDay) <= 14 ? "slot1" : "slot2"))}</strong>
                  </div>
                  <div className="summaryCell compact">
                    <span className="dataLabel">Account</span>
                    <strong>{account?.name || template.defaultAccountId || template.defaultPaidFrom || "Unassigned"}</strong>
                  </div>
                  <div className="summaryCell compact">
                    <span className="dataLabel">Default amount</span>
                    <strong>{formatCurrency(template.defaultAmount, cfg.currency)}</strong>
                  </div>
                </div>

                <div className="templateFlags" style={{ marginTop: 10 }}>
                  {getTemplateFlags(template).map((flag) => (
                    <span key={`mobile-${template.id}-${flag}`} className="pill">{flag}</span>
                  ))}
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

      <Modal title={editingId ? "Edit bill template" : "Add bill template"} open={open} onClose={() => setOpen(false)}>
        <div className="formGrid">
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </label>
          <label>
            Category
            <input value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} />
          </label>
          <label>
            Due day
            <input type="number" min="1" max="31" value={form.dueDay} onChange={(e) => setForm((prev) => ({ ...prev, dueDay: e.target.value }))} />
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
            Default account
            <select value={form.defaultAccountId} onChange={(e) => setForm((prev) => ({ ...prev, defaultAccountId: e.target.value }))}>
              <option value="">Select account</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount type
            <select value={form.amountType} onChange={(e) => setForm((prev) => ({ ...prev, amountType: e.target.value }))}>
              <option value="fixed">fixed</option>
              <option value="variable">variable</option>
            </select>
          </label>
          <label>
            Default amount
            <input type="number" value={form.defaultAmount} onChange={(e) => setForm((prev) => ({ ...prev, defaultAmount: e.target.value }))} />
          </label>
          <label className="checkField">
            <input type="checkbox" checked={form.autopay} onChange={(e) => setForm((prev) => ({ ...prev, autopay: e.target.checked }))} />
            <span>Autopay</span>
          </label>
          <label className="checkField">
            <input
              type="checkbox"
              checked={form.plaidMatchEnabled}
              onChange={(e) => setForm((prev) => ({ ...prev, plaidMatchEnabled: e.target.checked }))}
            />
            <span>Plaid match enabled</span>
          </label>
          <label className="checkField">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} />
            <span>Active</span>
          </label>
          <label className="checkField">
            <input type="checkbox" checked={form.hidden} onChange={(e) => setForm((prev) => ({ ...prev, hidden: e.target.checked }))} />
            <span>Hidden from planner</span>
          </label>
          <label className="checkField">
            <input type="checkbox" checked={form.system} onChange={(e) => setForm((prev) => ({ ...prev, system: e.target.checked }))} />
            <span>System / non-bill row</span>
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Notes
            <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={saveTemplate}>Save template</button>
        </div>
      </Modal>
    </div>
  );
}
