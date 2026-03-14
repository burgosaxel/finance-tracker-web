import React from "react";

export default function StatCard({ label, value, subtitle, icon: Icon, className = "" }) {
  return (
    <div className={`card statCard ${className}`.trim()}>
      <div className="statCardGlow" aria-hidden="true" />
      <div className="statMeta">
        <div className="statHeader">
          {Icon && <Icon size={20} className="statIcon" />}
          <div className="muted statLabel">{label}</div>
        </div>
        <div className="statValue">{value}</div>
      </div>
      {subtitle ? <div className="muted statSubtitle">{subtitle}</div> : null}
    </div>
  );
}
