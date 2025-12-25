// OverviewChart.jsx
import React from "react";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { perfData } from "./overviewData";

export default function OverviewChart({
  range,
  selectedAccount,
  accountTotal,
  rateOfReturn,
  onRangeChange,
}) {
  const values = perfData[range];

  const chartData = values.map((val, i) => ({
    index: i,
    value: val,
  }));

  /* ---------- Formatting ---------- */
  const formattedROR =
    typeof rateOfReturn === "number" ? rateOfReturn.toFixed(2) : "--";

  const allowedIntervals = [
    1, 2, 4, 5, 10, 20, 40, 50, 100, 200, 500, 1000,
  ];

  /* ---------- Y-axis tick calculation ---------- */
  const getTicks = (values) => {
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const rawRange = rawMax - rawMin;

    let interval = allowedIntervals[0];
    for (let i = 0; i < allowedIntervals.length; i++) {
      if (Math.ceil(rawRange / allowedIntervals[i]) <= 6) {
        interval = allowedIntervals[i];
        break;
      }
    }

    const minTick = Math.floor(rawMin / interval) * interval - interval;
    const maxTick = Math.ceil(rawMax / interval) * interval + interval;

    const ticks = [];
    for (let t = minTick; t <= maxTick; t += interval) {
      ticks.push(t);
    }
    return ticks;
  };

  const yTicks = getTicks(values);

  /* ---------- Colours ---------- */
  const lineColour =
    values[values.length - 1] >= 0 ? "#2e7d32" : "#c62828";

  return (
    <div className="performance-card">
      {/* ─── Header ─── */}
      <div className="performance-header">
        <div className="perf-left">
          <p className="perf-account-label">{selectedAccount}</p>
          <h3 className="perf-account-total">
            ${accountTotal.toLocaleString()}
          </h3>
        </div>

        <div className="perf-right">
          <p className="perf-ror-label">Rate of Return (All)</p>
          <span
            className={`perf-ror-value ${rateOfReturn >= 0 ? "pos" : "neg"}`}
          >
            {rateOfReturn >= 0 ? "+" : ""}
            {formattedROR}%
          </span>
        </div>
      </div>

      {/* ─── Chart ─── */}
      <div className="chart-wrapper">
        <div style={{ width: "100%", height: 420 }}>
          <ResponsiveContainer>
            <AreaChart
              data={chartData}
              margin={{ top: 20, right: 20, left: 0, bottom: 40 }}
            >
              <defs>
                <linearGradient id="greenFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2e7d32" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#2e7d32" stopOpacity={0.15} />
                </linearGradient>
                <linearGradient id="redFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c62828" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#c62828" stopOpacity={0.15} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} />

              {/* No X labels */}
              <XAxis dataKey="index" tick={false} axisLine={false} />

              {/* Right Y axis */}
              <YAxis
                orientation="right"
                ticks={yTicks}
                tickFormatter={(val) => (val > 0 ? "+" : "") + val.toFixed(2) + "%"}
                axisLine={false}
                tickLine={false}
                width={38}
                tick={{ fontSize: 13 }}
              />

              <Tooltip
                formatter={(val) =>
                  (val > 0 ? "+" : "") + val.toFixed(2) + "%"
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                baseLine={0}
                fill={
                  lineColour === "#2e7d32"
                    ? "url(#greenFill)"
                    : "url(#redFill)"
                }
                stroke="none"
              />

              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColour}
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ─── Range Tabs (bottom-left) ─── */}
        <div className="chart-range-footer">
          {Object.keys(perfData).map((r) => (
            <button
              key={r}
              className={r === range ? "active" : ""}
              onClick={() => onRangeChange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
