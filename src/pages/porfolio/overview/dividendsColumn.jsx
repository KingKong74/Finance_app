import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { dividendsData } from "./overviewData";

export default function DividendsColumn() {
  return (
    <div className="chart-card">
      <h4>Dividends (Yearly)</h4>
      <div style={{ width: "100%", height: 250 }}>
        <ResponsiveContainer>
          <BarChart data={dividendsData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="year" />
            <YAxis tickFormatter={(val) => "$" + val.toLocaleString()} />
            <Tooltip formatter={(val) => "$" + val.toLocaleString()} />
            <Bar dataKey="dividends" fill="#2e7d32" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
