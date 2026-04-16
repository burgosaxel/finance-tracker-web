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
  sourceType: "manual",
};

const SORT_DEFAULTS = {
  name: "asc",
  limit: "desc",
  balance: "desc",
  available: "desc",
  utilization: "desc",
  apr: "desc",
  minimum: "desc",
};

function SortHeader({ label, column, sortBy, sortDirection, onSort }) {
  const active = sortBy === column;
  const arrow = !active ? "" : sortDirection === "asc" ? "^" : "v";
  return (
    <button type="button" className="sortableHeaderButton" onClick={() => onSort(column)}>
      <span>{label}</span>
      <span className="sortIndicator" aria-hidden="true">{arrow}</span>
    </button>
  );
}

export default function CreditCardsPage({ uid, cards, settings, onToast, onError }) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const [sortBy, setSortBy] = useState("utilization");
  const [sortDirection, setSortDirection] = useState("desc");
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
        sourceType: c.sourceType || "manual",
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
    sorted.sort((a, b) => {
      if (sortBy === "name") {
        const result = String(a.name || "").localeCompare(String(b.name || ""));
        return sortDirection === "asc" ? result : -result;
      }
      const valueA =
        sortBy === "limit" ? a.limit :
        sortBy === "balance" ? a.balance :
        sortBy === "available" ? a.available :
        sortBy === "utilization" ? a.utilization :
        sortBy === "apr" ? a.apr :
        a.minimumPayment;
      const valueB =
        sortBy === "limit" ? b.limit :
        sortBy === "balance" ? b.balance :
        sortBy === "available" ? b.available :
        sortBy === "utilization" ? b.utilization :
        sortBy === "apr" ? b.apr :
        b.minimumPayment;
      return sortDirection === "asc" ? valueA - valueB : valueB - valueA;
    });
    return sorted;
  }, [cards, cfg.recommendedPaymentRate, sortBy, sortDirection]);

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

  function handleSort(column) {
    if (column === sortBy) {
      setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(column);
    setSortDirection(SORT_DEFAULTS[column] || "desc");
  }

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
      sourceType: card.sourceType || "manual",
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
          sourceType: form.sourceType || "manual",
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
      <section className="dashboard-hero pageHero heroDebt creditCardsHero">
        <div className="creditCardsHeroMain">
          <div className="pageHeaderContent creditCardsHeroContent">
            <div className="pageEyebrow">Debt overview</div>
            <h2>Credit Cards</h2>
            <p className="muted pageIntro">
              Review balances, utilization, APR, and minimum payments in one place without losing manual control.
            </p>
          </div>
          <div className="statsGrid compactStats creditCardsHeroStats">
            <StatCard className="metric-card" label="Total Limit" value={formatCurrency(totals.totalLimit, cfg.currency)} />
            <StatCard className="metric-card red-accent" label="Total Balance" value={formatCurrency(totals.totalBalance, cfg.currency)} />
            <StatCard className="metric-card" label="Weighted Utilization" value={formatPercent(totals.avgUtil)} />
            <StatCard className="metric-card red-accent" label="Total Minimums" value={formatCurrency(totals.totalMin, cfg.currency)} />
          </div>
        </div>
        <div className="pageActions creditCardsHeroActions">
          <button type="button" className="primary" onClick={startAdd}>Add Card</button>
        </div>
      </section>

      <section className="data-panel section moduleAccounts">
        <div className="sectionHeader">
          <div>
            <h3>Card portfolio</h3>
            <div className="muted compactSubtext">Sort directly from the table headers without a separate sort control.</div>
          </div>
        </div>
        <div className="tableWrap card desktopDataTable premiumTableWrap">
          <table>
            <thead>
              <tr>
                <th><SortHeader label="Name" column="name" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th>Issuer</th>
                <th><SortHeader label="Limit" column="limit" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th><SortHeader label="Balance" column="balance" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th><SortHeader label="Available" column="available" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th><SortHeader label="Utilization" column="utilization" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th><SortHeader label="APR" column="apr" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th><SortHeader label="Minimum" column="minimum" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} /></th>
                <th>Recommended</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={10} className="muted">No credit cards yet.</td></tr> : null}
              {rows.map((card) => (
                <tr key={card.id}>
                  <td>{card.name} {card.sourceType === "plaid" ? <span className="pill">Synced</span> : null}</td>
                  <td>{card.issuer || "-"}</td>
                  <td>{formatCurrency(card.limit, cfg.currency)}</td>
                  <td className="value-negative">{formatCurrency(card.balance, cfg.currency)}</td>
                  <td>{formatCurrency(card.available, cfg.currency)}</td>
                  <td>
                    <span className={card.utilization > cfg.utilizationThreshold ? "pill danger" : "pill"}>
                      {formatPercent(card.utilization)}
                    </span>
                  </td>
                  <td>{formatPercent(card.apr)}</td>
                  <td className="value-negative">{formatCurrency(card.minimumPayment, cfg.currency)}</td>
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
                <th className="value-negative">{formatCurrency(totals.totalBalance, cfg.currency)}</th>
                <th>{formatCurrency(totals.totalLimit - totals.totalBalance, cfg.currency)}</th>
                <th>{formatPercent(totals.avgUtil)}</th>
                <th />
                <th className="value-negative">{formatCurrency(totals.totalMin, cfg.currency)}</th>
                <th />
                <th />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="mobileDataList">
        {rows.length === 0 ? <div className="data-panel muted">No credit cards yet.</div> : null}
        {rows.map((card) => (
          <article key={`mobile-${card.id}`} className="data-panel dataItem">
            <div className="dataItemHeader">
              <div>
                <h3 className="dataItemTitle">{card.name}</h3>
                <div className="muted compactSubtext">{card.issuer || "No issuer"}{card.sourceType === "plaid" ? " • Synced via Plaid" : ""}</div>
              </div>
              <span className={card.utilization > cfg.utilizationThreshold ? "pill danger" : "pill"}>
                {formatPercent(card.utilization)}
              </span>
            </div>
            <div className="summaryGrid three">
              <div className="summaryCell"><span className="dataLabel">Limit</span><strong>{formatCurrency(card.limit, cfg.currency)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Balance</span><strong className="value-negative">{formatCurrency(card.balance, cfg.currency)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Available</span><strong>{formatCurrency(card.available, cfg.currency)}</strong></div>
            </div>
            <div className="summaryGrid two">
              <div className="summaryCell"><span className="dataLabel">APR</span><strong>{formatPercent(card.apr)}</strong></div>
              <div className="summaryCell"><span className="dataLabel">Minimum</span><strong className="value-negative">{formatCurrency(card.minimumPayment, cfg.currency)}</strong></div>
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
          <article className="data-panel dataItem">
            <h3 className="dataItemTitle">Totals</h3>
            <div className="dataGrid">
              <div className="dataRow"><span className="dataLabel">Total Limit</span><span className="dataValue">{formatCurrency(totals.totalLimit, cfg.currency)}</span></div>
              <div className="dataRow"><span className="dataLabel">Total Balance</span><span className="dataValue value-negative">{formatCurrency(totals.totalBalance, cfg.currency)}</span></div>
              <div className="dataRow"><span className="dataLabel">Available</span><span className="dataValue">{formatCurrency(totals.totalLimit - totals.totalBalance, cfg.currency)}</span></div>
              <div className="dataRow"><span className="dataLabel">Avg Utilization</span><span className="dataValue">{formatPercent(totals.avgUtil)}</span></div>
              <div className="dataRow"><span className="dataLabel">Total Minimum</span><span className="dataValue value-negative">{formatCurrency(totals.totalMin, cfg.currency)}</span></div>
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

