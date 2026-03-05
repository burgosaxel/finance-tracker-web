import React from "react";

export default function StatCard({ label, value, subtitle }) {
  return (
    <div className="card statCard">
      <div className="muted">{label}</div>
      <div className="statValue">{value}</div>
      {subtitle ? <div className="muted">{subtitle}</div> : null}
    </div>
  );
}
