import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";
import StatCard from "../components/StatCard";
import { deleteEntity, upsertEntity } from "../lib/db";
import { DEFAULT_SETTINGS, formatCurrency, formatPercent, safeNumber } from "../lib/finance";

const EMPTY_CARD = {
  name: "",
  issuer: "",
  limit: 0,
  balance: 0,
  apr: 0,
  minimumPayment: 0,
  dueDay: "",
};

export default function CreditCardsPage({ uid, cards, settings, onToast, onError }) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [sortBy, setSortBy] = useState("utilization");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_CARD);
  const [editingId, setEditingId] = useState(null);

  const rows = useMemo(() => {
    const mapped = (cards || []).map((c) => {
      const limit = safeNumber(c.limit, 0);
      const balance = safeNumber(c.balance, 0);
      const minimum = safeNumber(c.minimumPayment, 0);
      return {
        ...c,
        limit,
        balance,
        minimumPayment: minimum,
        apr: safeNumber(c.apr, 0),
        available: limit - balance,
        utilization: limit > 0 ? (balance / limit) * 100 : 0,
        recommendedPayment: minimum > 0 ? minimum : balance * safeNumber(cfg.recommendedPaymentRate, 0.03),
      };
    });
    const sorted = [...mapped];
    if (sortBy === "utilization") sorted.sort((a, b) => b.utilization - a.utilization);
    if (sortBy === "balance") sorted.sort((a, b) => b.balance - a.balance);
    if (sortBy === "apr") sorted.sort((a, b) => b.apr - a.apr);
    return sorted;
  }, [cards, cfg.recommendedPaymentRate, sortBy]);

  const totals = useMemo(() => {
    const totalLimit = rows.reduce((s, c) => s + c.limit, 0);
    const totalBalance = rows.reduce((s, c) => s + c.balance, 0);
    const totalMin = rows.reduce((s, c) => s + c.minimumPayment, 0);
    return {
      totalLimit,
      totalBalance,
      totalMin,
      avgUtil: totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0,
    };
  }, [rows]);

  function startAdd() {
    setEditingId(null);
    setForm(EMPTY_CARD);
    setOpen(true);
  }

  function startEdit(card) {
    setEditingId(card.id);
    setForm({
      name: card.name || "",
      issuer: card.issuer || "",
      limit: card.limit || 0,
      balance: card.balance || 0,
      apr: card.apr || 0,
      minimumPayment: card.minimumPayment || 0,
      dueDay: card.dueDay || "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    try {
      await upsertEntity(
        uid,
        "creditCards",
        {
          ...form,
          name: form.name.trim(),
          limit: safeNumber(form.limit, 0),
          balance: safeNumber(form.balance, 0),
          apr: safeNumber(form.apr, 0),
          minimumPayment: safeNumber(form.minimumPayment, 0),
          dueDay: form.dueDay ? Number(form.dueDay) : null,
        },
        editingId || undefined
      );
      setOpen(false);
      onToast("Credit card saved.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to save credit card.", "error");
    }
  }

  async function remove(id) {
    try {
      await deleteEntity(uid, "creditCards", id);
      onToast("Credit card deleted.");
    } catch (error) {
      onError?.(error?.message || String(error));
      onToast("Failed to delete credit card.", "error");
    }
  }

  return (
    <div className="page">
      <section className="card section pageHero heroDebt">
        <div className="pageHeader">
          <div className="pageHeaderContent">
            <div className="pageEyebrow">Debt overview</div>
            <h2>Credit Cards</h2>
            <p className="muted pageIntro">
              Review balances, utilization, APR, and minimum payments in one place without losing manual control.
            </p>
          </div>
          <div className="pageActions">
            <label className="fieldGroup compactField">
              <span>Sort</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="utilization">Utilization</option>
                <option value="balance">Balance</option>
                <option value="apr">APR</option>
              </select>
            </label>
            <button type="button" className="primary" onClick={startAdd}>Add Card</button>
          </div>
        </div>
        <div className="statsGrid compactStats">
          <StatCard label="Total Limit" value={formatCurrency(totals.totalLimit, cfg.currency)} />
          <StatCard label="Total Balance" value={formatCurrency(totals.totalBalance, cfg.currency)} />
          <StatCard label="Weighted Utilization" value={formatPercent(totals.avgUtil)} />
          <StatCard label="Total Minimums" value={formatCurrency(totals.totalMin, cfg.currency)} />
        </div>
      </section>

      <section className="card section moduleAccounts">
        <div className="sectionHeader">
          <div>
            <h3>Card portfolio</h3>
            <div className="muted compactSubtext">Sort by utilization, balance, or APR to prioritize what needs attention.</div>
          </div>
        </div>
        <div className="tableWrap card desktopDataTable">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Issuer</th>
              <th>Limit</th>
              <th>Balance</th>
              <th>Available</th>
              <th>Utilization</th>
              <th>APR</th>
              <th>Minimum</th>
              <th>Recommended</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="muted">No credit cards yet.</td></tr>
            ) : null}
            {rows.map((card) => (
              <tr key={card.id}>
                <td>{card.name}</td>
                <td>{card.issuer || "-"}</td>
                <td>{formatCurrency(card.limit, cfg.currency)}</td>
                <td>{formatCurrency(card.balance, cfg.currency)}</td>
                <td>{formatCurrency(card.available, cfg.currency)}</td>
                <td>
                  <span className={card.utilization > cfg.utilizationThreshold ? "pill danger" : "pill"}>
                    {formatPercent(card.utilization)}
                  </span>
                </td>
                <td>{formatPercent(card.apr)}</td>
                <td>{formatCurrency(card.minimumPayment, cfg.currency)}</td>
                <td>{formatCurrency(card.recommendedPayment, cfg.currency)}</td>
                <td className="row">
                  <button type="button" onClick={() => startEdit(card)}>Edit</button>
                  <button type="button" onClick={() => remove(card.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2}>Totals</th>
              <th>{formatCurrency(totals.totalLimit, cfg.currency)}</th>
              <th>{formatCurrency(totals.totalBalance, cfg.currency)}</th>
              <th>{formatCurrency(totals.totalLimit - totals.totalBalance, cfg.currency)}</th>
              <th>{formatPercent(totals.avgUtil)}</th>
              <th />
              <th>{formatCurrency(totals.totalMin, cfg.currency)}</th>
              <th />
              <th />
            </tr>
          </tfoot>
        </table>
      </div>
      </section>

      <div className="mobileDataList">
        {rows.length === 0 ? <div className="card section muted">No credit cards yet.</div> : null}
        {rows.map((card) => (
          <article key={`mobile-${card.id}`} className="card section dataItem">
            <div className="dataItemHeader">
              <div>
                <h3 className="dataItemTitle">{card.name}</h3>
                <div className="muted compactSubtext">{card.issuer || "No issuer"}</div>
              </div>
              <span className={card.utilization > cfg.utilizationThreshold ? "pill danger" : "pill"}>
                {formatPercent(card.utilization)}
              </span>
            </div>
            <div className="summaryGrid three">
              <div className="summaryCell"><span className="dataLabel">Limit</span><strong>{formatCurrency(card.limit, cfg.currency)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Balance</span><strong>{formatCurrency(card.balance, cfg.currency)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Available</span><strong>{formatCurrency(card.available, cfg.currency)}</strong></div>
            </div>
            <div className="summaryGrid two">
              <div className="summaryCell"><span className="dataLabel">APR</span><strong>{formatPercent(card.apr)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Minimum</span><strong>{formatCurrency(card.minimumPayment, cfg.currency)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Recommended</span><strong>{formatCurrency(card.recommendedPayment, cfg.currency)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Utilization</span><strong>{formatPercent(card.utilization)}</strong></div>
            </div>
            <div className="row dataActions">
              <button type="button" onClick={() => startEdit(card)}>Edit</button>
              <button type="button" onClick={() => remove(card.id)}>Delete</button>
            </div>
          </article>
        ))}

        {rows.length > 0 ? (
          <article className="card section dataItem">
            <h3 className="dataItemTitle">Totals</h3>
            <div className="dataGrid">
              <div className="dataRow"><span className="dataLabel">Total Limit</span><span className="dataValue">{formatCurrency(totals.totalLimit, cfg.currency)}</span></div>
              <div className="dataRow"><span className="dataLabel">Total Balance</span><span className="dataValue">{formatCurrency(totals.totalBalance, cfg.currency)}</span></div>
              <div className="dataRow"><span className="dataLabel">Available</span><span className="dataValue">{formatCurrency(totals.totalLimit - totals.totalBalance, cfg.currency)}</span></div>
              <div className="dataRow"><span className="dataLabel">Avg Utilization</span><span className="dataValue">{formatPercent(totals.avgUtil)}</span></div>
              <div className="dataRow"><span className="dataLabel">Total Minimum</span><span className="dataValue">{formatCurrency(totals.totalMin, cfg.currency)}</span></div>
            </div>
          </article>
        ) : null}
      </div>

      <Modal title={editingId ? "Edit Card" : "Add Card"} open={open} onClose={() => setOpen(false)}>
        <div className="formGrid">
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Issuer<input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} /></label>
          <label>Limit<input type="number" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} /></label>
          <label>Balance<input type="number" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} /></label>
          <label>APR %<input type="number" value={form.apr} onChange={(e) => setForm({ ...form, apr: e.target.value })} /></label>
          <label>Minimum Payment<input type="number" value={form.minimumPayment} onChange={(e) => setForm({ ...form, minimumPayment: e.target.value })} /></label>
          <label>Due Day<input type="number" min="1" max="31" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button type="button" className="primary" onClick={save}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
