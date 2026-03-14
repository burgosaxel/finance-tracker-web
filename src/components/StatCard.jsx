import React from "react";

export default function StatCard({ label, value, subtitle, className = "" }) {
  return (
    <div className={`card statCard ${className}`.trim()}>
      <div className="statCardGlow" aria-hidden="true" />
      <div className="statMeta">
        <div className="muted statLabel">{label}</div>
        <div className="statValue">{value}</div>
      </div>
      {subtitle ? <div className="muted statSubtitle">{subtitle}</div> : null}
    </div>
  );
}
