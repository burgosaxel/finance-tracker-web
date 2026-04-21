import React, { useMemo, useState } from "react";
import Modal from "./Modal";
import { saveSettings, syncRecurringItemsForMonth, upsertEntity, upsertTemplate } from "../lib/db";
import { createPlaidLinkToken, exchangePlaidPublicToken, openPlaidLink } from "../lib/plaid";
import { PAYCHECK_SLOT_OPTIONS, buildAccountDirectory } from "../lib/planner";
import { createId, safeNumber } from "../lib/finance";

const STEPS = [
  { id: "plaid", label: "Link Accounts" },
  { id: "accounts", label: "Manual Accounts" },
  { id: "income", label: "Set Up Income" },
  { id: "bills", label: "Set Up Bills" },
];

function makeIncomeDraft() {
  return {
    id: createId("income-draft"),
    source: "",
    depositAccountId: "",
    payDay: 1,
    paycheckSlot: "slot1",
    defaultAmount: "",
    active: true,
    notes: "",
  };
}

function makeBillDraft() {
  return {
    id: createId("bill-draft"),
    name: "",
    category: "",
    dueDay: 1,
    paycheckSlot: "slot1",
    defaultAccountId: "",
    amountType: "fixed",
    defaultAmount: "",
    autopay: false,
    plaidMatchEnabled: true,
    active: true,
    hidden: false,
    system: false,
    notes: "",
  };
}

function makeAccountDraft() {
  return {
    id: createId("account-draft"),
    name: "",
    type: "checking",
    balance: "",
    institutionName: "",
    linkedAccountId: "",
  };
}

export default function OnboardingSetupModal({
  open,
  uid,
  settings,
  selectedMonth,
  accounts,
  linkedAccounts,
  plaidItems,
  onToast,
  onError,
  onClose,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [incomeDrafts, setIncomeDrafts] = useState([makeIncomeDraft()]);
  const [billDrafts, setBillDrafts] = useState([makeBillDraft()]);
  const [accountDrafts, setAccountDrafts] = useState([makeAccountDraft()]);
  const [plaidLoading, setPlaidLoading] = useState(false);
  const [plaidMessage, setPlaidMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const currentStep = STEPS[stepIndex];
  const accountOptions = useMemo(
    () => [
      ...buildAccountDirectory(accounts, linkedAccounts),
      ...accountDrafts
        .filter((account) => account.name.trim())
        .map((account) => ({
          id: account.id,
          name: account.name.trim(),
        })),
    ].filter((account, index, rows) => rows.findIndex((row) => row.id === account.id) === index),
    [accountDrafts, accounts, linkedAccounts]
  );

  function updateDraft(setter, id, patch) {
    setter((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeDraft(setter, factory, id) {
    setter((rows) => {
      const next = rows.filter((row) => row.id !== id);
      return next.length > 0 ? next : [factory()];
    });
  }

  async function handleLinkAccount() {
    setPlaidLoading(true);
    setPlaidMessage("Creating secure Plaid link session...");
    try {
      const { linkToken } = await createPlaidLinkToken();
      const { publicToken, metadata } = await openPlaidLink(linkToken);
      setPlaidMessage("Exchanging token and running first sync...");
      await exchangePlaidPublicToken(publicToken, metadata);
      setPlaidMessage("Linked account successfully.");
      onToast?.("Bank account linked.");
    } catch (error) {
      setPlaidMessage("");
      onError?.(error?.message || String(error));
      onToast?.("Failed to link bank account.", "error");
    } finally {
      setPlaidLoading(false);
    }
  }

  async function persistOnboarding(flagField) {
    await saveSettings(uid, {
      ...(settings || {}),
      [flagField]: new Date().toISOString(),
    });
  }

  async function handleFinish() {
    setSaving(true);
    try {
      const manualAccounts = accountDrafts.filter((account) => account.name.trim());
      for (const account of manualAccounts) {
        await upsertEntity(
          uid,
          "accounts",
          {
            name: account.name.trim(),
            type: account.type || "checking",
            balance: safeNumber(account.balance, 0),
            institutionName: account.institutionName || "",
            linkedAccountId: account.linkedAccountId || "",
          },
          account.id
        );
      }

      const incomeTemplates = incomeDrafts.filter((income) => income.source.trim());
      for (const income of incomeTemplates) {
        await upsertTemplate(
          uid,
          "incomes",
          {
            source: income.source.trim(),
            depositAccountId: income.depositAccountId || "",
            payDay: Math.max(1, Math.min(31, Number(income.payDay) || 1)),
            paycheckSlot: income.paycheckSlot || "slot1",
            defaultAmount: Math.abs(safeNumber(income.defaultAmount, 0)),
            active: income.active !== false,
            notes: income.notes || "",
          },
          income.id
        );
      }

      const billTemplates = billDrafts.filter((bill) => bill.name.trim());
      for (const bill of billTemplates) {
        await upsertTemplate(
          uid,
          "bills",
          {
            name: bill.name.trim(),
            category: bill.category || "",
            dueDay: Math.max(1, Math.min(31, Number(bill.dueDay) || 1)),
            paycheckSlot: bill.paycheckSlot || "slot1",
            defaultAccountId: bill.defaultAccountId || "",
            amountType: bill.amountType || "fixed",
            defaultAmount: Math.abs(safeNumber(bill.defaultAmount, 0)),
            autopay: Boolean(bill.autopay),
            plaidMatchEnabled: bill.plaidMatchEnabled !== false,
            active: bill.active !== false,
            hidden: false,
            system: false,
            notes: bill.notes || "",
          },
          bill.id
        );
      }

      await syncRecurringItemsForMonth(uid, selectedMonth);
      await persistOnboarding("onboardingCompletedAt");
      onToast?.("Setup saved.");
      onClose?.();
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast?.("Failed to finish setup.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSkipForNow() {
    setSaving(true);
    try {
      await persistOnboarding("onboardingDismissedAt");
      onClose?.();
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast?.("Failed to close setup.", "error");
    } finally {
      setSaving(false);
    }
  }

  function renderPlaidStep() {
    return (
      <div className="onboardingStepContent">
        <h3>Link accounts with Plaid</h3>
        <div className="muted compactSubtext">
          Optional. You can connect live bank accounts now or skip and add them later.
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="primary" onClick={handleLinkAccount} disabled={plaidLoading}>
            {plaidLoading ? "Linking..." : "Link Bank Account"}
          </button>
          <div className="muted compactSubtext">
            {linkedAccounts.length > 0 || plaidItems.length > 0
              ? `${linkedAccounts.length} linked account(s) available.`
              : "No linked accounts yet."}
          </div>
        </div>
        {plaidMessage ? <div className="authHint" style={{ marginTop: 12 }}>{plaidMessage}</div> : null}
      </div>
    );
  }

  function renderIncomeStep() {
    return (
      <div className="onboardingStepContent">
        <h3>Set up income</h3>
        <div className="muted compactSubtext">
          Add as many paychecks as needed. Only the paycheck slots you configure here will show on the planner.
        </div>
        <div className="onboardingDraftList">
          {incomeDrafts.map((income) => (
            <div key={income.id} className="card section onboardingDraftCard">
              <div className="formGrid">
                <label>
                  Source
                  <input value={income.source} onChange={(e) => updateDraft(setIncomeDrafts, income.id, { source: e.target.value })} />
                </label>
                <label>
                  Deposit account
                  <select value={income.depositAccountId} onChange={(e) => updateDraft(setIncomeDrafts, income.id, { depositAccountId: e.target.value })}>
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
                  <input type="number" min="1" max="31" value={income.payDay} onChange={(e) => updateDraft(setIncomeDrafts, income.id, { payDay: e.target.value })} />
                </label>
                <label>
                  Paycheck slot
                  <select value={income.paycheckSlot} onChange={(e) => updateDraft(setIncomeDrafts, income.id, { paycheckSlot: e.target.value })}>
                    {PAYCHECK_SLOT_OPTIONS.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Default amount
                  <input type="number" value={income.defaultAmount} onChange={(e) => updateDraft(setIncomeDrafts, income.id, { defaultAmount: e.target.value })} />
                </label>
              </div>
              <div className="row onboardingDraftActions">
                <label className="checkField">
                  <input type="checkbox" checked={income.active} onChange={(e) => updateDraft(setIncomeDrafts, income.id, { active: e.target.checked })} />
                  <span>Active</span>
                </label>
                <div className="spacer" />
                <button type="button" onClick={() => removeDraft(setIncomeDrafts, makeIncomeDraft, income.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setIncomeDrafts((rows) => [...rows, makeIncomeDraft()])}>Add income</button>
      </div>
    );
  }

  function renderBillsStep() {
    return (
      <div className="onboardingStepContent">
        <h3>Set up bills</h3>
        <div className="muted compactSubtext">
          Add recurring bills now or skip and build them out later. Bills can target any paycheck slot from 1 to 6.
        </div>
        <div className="onboardingDraftList">
          {billDrafts.map((bill) => (
            <div key={bill.id} className="card section onboardingDraftCard">
              <div className="formGrid">
                <label>
                  Name
                  <input value={bill.name} onChange={(e) => updateDraft(setBillDrafts, bill.id, { name: e.target.value })} />
                </label>
                <label>
                  Category
                  <input value={bill.category} onChange={(e) => updateDraft(setBillDrafts, bill.id, { category: e.target.value })} />
                </label>
                <label>
                  Due day
                  <input type="number" min="1" max="31" value={bill.dueDay} onChange={(e) => updateDraft(setBillDrafts, bill.id, { dueDay: e.target.value })} />
                </label>
                <label>
                  Paycheck slot
                  <select value={bill.paycheckSlot} onChange={(e) => updateDraft(setBillDrafts, bill.id, { paycheckSlot: e.target.value })}>
                    {PAYCHECK_SLOT_OPTIONS.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Default account
                  <select value={bill.defaultAccountId} onChange={(e) => updateDraft(setBillDrafts, bill.id, { defaultAccountId: e.target.value })}>
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
                  <select value={bill.amountType} onChange={(e) => updateDraft(setBillDrafts, bill.id, { amountType: e.target.value })}>
                    <option value="fixed">fixed</option>
                    <option value="variable">variable</option>
                  </select>
                </label>
                <label>
                  Default amount
                  <input type="number" value={bill.defaultAmount} onChange={(e) => updateDraft(setBillDrafts, bill.id, { defaultAmount: e.target.value })} />
                </label>
              </div>
              <div className="row onboardingDraftActions">
                <label className="checkField">
                  <input type="checkbox" checked={bill.autopay} onChange={(e) => updateDraft(setBillDrafts, bill.id, { autopay: e.target.checked })} />
                  <span>Autopay</span>
                </label>
                <label className="checkField">
                  <input type="checkbox" checked={bill.active} onChange={(e) => updateDraft(setBillDrafts, bill.id, { active: e.target.checked })} />
                  <span>Active</span>
                </label>
                <div className="spacer" />
                <button type="button" onClick={() => removeDraft(setBillDrafts, makeBillDraft, bill.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setBillDrafts((rows) => [...rows, makeBillDraft()])}>Add bill</button>
      </div>
    );
  }

  function renderAccountsStep() {
    return (
      <div className="onboardingStepContent">
        <h3>Set up manual accounts</h3>
        <div className="muted compactSubtext">
          Optional. Add manual accounts for planning, cash envelopes, or accounts you do not want to link.
        </div>
        <div className="onboardingDraftList">
          {accountDrafts.map((account) => (
            <div key={account.id} className="card section onboardingDraftCard">
              <div className="formGrid">
                <label>
                  Name
                  <input value={account.name} onChange={(e) => updateDraft(setAccountDrafts, account.id, { name: e.target.value })} />
                </label>
                <label>
                  Type
                  <select value={account.type} onChange={(e) => updateDraft(setAccountDrafts, account.id, { type: e.target.value })}>
                    <option value="checking">checking</option>
                    <option value="savings">savings</option>
                    <option value="cash">cash</option>
                    <option value="other">other</option>
                  </select>
                </label>
                <label>
                  Balance
                  <input type="number" value={account.balance} onChange={(e) => updateDraft(setAccountDrafts, account.id, { balance: e.target.value })} />
                </label>
                <label>
                  Institution
                  <input value={account.institutionName} onChange={(e) => updateDraft(setAccountDrafts, account.id, { institutionName: e.target.value })} />
                </label>
              </div>
              <div className="row onboardingDraftActions">
                <div className="spacer" />
                <button type="button" onClick={() => removeDraft(setAccountDrafts, makeAccountDraft, account.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setAccountDrafts((rows) => [...rows, makeAccountDraft()])}>Add manual account</button>
      </div>
    );
  }

  return (
    <Modal title="Set up your workspace" open={open} onClose={handleSkipForNow}>
      <div className="setupStepPills onboardingStepPills">
        {STEPS.map((step, index) => (
          <div key={step.id} className={`setupStepPill ${index === stepIndex ? "active" : ""}`}>
            <span>{index + 1}</span>
            <strong>{step.label}</strong>
          </div>
        ))}
      </div>

      {currentStep.id === "plaid" ? renderPlaidStep() : null}
      {currentStep.id === "income" ? renderIncomeStep() : null}
      {currentStep.id === "bills" ? renderBillsStep() : null}
      {currentStep.id === "accounts" ? renderAccountsStep() : null}

      <div className="row onboardingFooterActions">
        <button type="button" onClick={handleSkipForNow} disabled={saving}>Skip setup for now</button>
        <div className="spacer" />
        <button type="button" onClick={() => setStepIndex((index) => Math.max(0, index - 1))} disabled={stepIndex === 0 || saving}>
          Back
        </button>
        {stepIndex < STEPS.length - 1 ? (
          <button type="button" className="primary" onClick={() => setStepIndex((index) => Math.min(STEPS.length - 1, index + 1))} disabled={saving}>
            Next
          </button>
        ) : (
          <button type="button" className="primary" onClick={handleFinish} disabled={saving}>
            {saving ? "Saving..." : "Finish setup"}
          </button>
        )}
      </div>
    </Modal>
  );
}
