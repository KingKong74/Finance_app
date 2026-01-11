import React from "react";
import { fmtMoney } from "../../utils/money";

export default function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="b-tt">
      <div className="b-tt__label">{label}</div>
      {payload.map((p) => (
        <div className="b-tt__row" key={p.dataKey}>
          <span className="b-tt__name">{p.name ?? p.dataKey}</span>
          <span className="b-tt__val">{typeof p.value === "number" ? fmtMoney(p.value) : String(p.value)}</span>
        </div>
      ))}
    </div>
  );
}
