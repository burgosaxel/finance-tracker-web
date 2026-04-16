import React from "react";
import Icon from "./Icons";

function initials(label = "") {
  return String(label)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "BC";
}

function RowAvatar({ label, icon }) {
  return (
    <div className="rowAvatar" aria-hidden="true">
      {icon ? <Icon name={icon} size={16} /> : <span>{initials(label)}</span>}
    </div>
  );
}

export function MetricRow({ icon, label, value, detail, tone = "default", chevron = false }) {
  return (
    <div className={`metricRow ${tone}`.trim()}>
      <div className="metricRowLead">
        <RowAvatar label={label} icon={icon} />
        <div>
          <div className="metricRowLabel">{label}</div>
          {detail ? <div className="metricRowDetail">{detail}</div> : null}
        </div>
      </div>
      <div className="metricRowValueWrap">
        <div className="metricRowValue">{value}</div>
        {chevron ? <Icon name="chevronRight" size={16} className="metricRowChevron" /> : null}
      </div>
    </div>
  );
}

export function AccountRow(props) {
  return <MetricRow chevron {...props} />;
}

export function TransactionRow({
  name,
  subtitle,
  amount,
  amountTone = "neutral",
  icon,
  action,
}) {
  return (
    <div className="transactionRow">
      <div className="metricRowLead">
        <RowAvatar label={name} icon={icon} />
        <div>
          <div className="metricRowLabel">{name}</div>
          {subtitle ? <div className="metricRowDetail">{subtitle}</div> : null}
        </div>
      </div>
      <div className="transactionAmountWrap">
        <div className={`transactionAmount ${amountTone}`.trim()}>{amount}</div>
        {action ? <div className="transactionAction">{action}</div> : null}
      </div>
    </div>
  );
}

export function RecurringRow({
  name,
  subtitle,
  amount,
  badge,
  icon,
  action,
}) {
  return (
    <div className="transactionRow recurringRow">
      <div className="metricRowLead">
        <RowAvatar label={name} icon={icon} />
        <div>
          <div className="metricRowLabel">{name}</div>
          <div className="metricRowDetail">
            {subtitle}
            {badge ? <span className={`statusPill ${badge.tone || ""}`.trim()}>{badge.label}</span> : null}
          </div>
        </div>
      </div>
      <div className="transactionAmountWrap">
        <div className="transactionAmount">{amount}</div>
        {action ? <div className="transactionAction">{action}</div> : null}
      </div>
    </div>
  );
}

export function MenuRow({ icon, title, subtitle, href, onClick, actionLabel }) {
  const content = (
    <>
      <div className="metricRowLead">
        <RowAvatar label={title} icon={icon} />
        <div>
          <div className="metricRowLabel">{title}</div>
          {subtitle ? <div className="metricRowDetail">{subtitle}</div> : null}
        </div>
      </div>
      <div className="menuRowAction">
        {actionLabel ? <span className="metricRowDetail">{actionLabel}</span> : null}
        <Icon name="chevronRight" size={16} />
      </div>
    </>
  );

  if (href) {
    return (
      <a className="menuRow" href={href}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" className="menuRow" onClick={onClick}>
      {content}
    </button>
  );
}
