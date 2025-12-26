import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cashflowData } from "../overviewData";

export default function CashflowStacked() {
  return (
    <div className="chart-card">
      <h4>Cashflow (Year)</h4>
      <div style={{ width: "100%", height: 250 }}>
        <ResponsiveContainer>
          <BarChart data={cashflowData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="year" />
            <YAxis tickFormatter={(val) => "$" + val.toLocaleString()} />
            <Tooltip formatter={(val) => "$" + val.toLocaleString()} />
            <Bar dataKey="interest" stackId="a" fill="#0d6efd" />
            <Bar dataKey="dividends" stackId="a" fill="#2e7d32" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
