import React from "react";

export default function KpiCard({ label, value, hint, tone }) {
  return (
    <div className={`b-kpi ${tone ? `is-${tone}` : ""}`}>
      <div className="b-kpi__label">{label}</div>
      <div className="b-kpi__value">{value}</div>
      {hint ? <div className="b-kpi__hint">{hint}</div> : null}
    </div>
  );
}
