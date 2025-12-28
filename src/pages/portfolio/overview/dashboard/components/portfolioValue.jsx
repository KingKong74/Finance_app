import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { portfolioValueData } from "./overviewData";

export default function PortfolioValue() {
  return (
    <div className="chart-card">
      <h4>Portfolio Value (Last 5 Days)</h4>
      <div style={{ width: "100%", height: 250 }}>
        <ResponsiveContainer>
          <BarChart data={portfolioValueData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" />
            <YAxis tickFormatter={(val) => "$" + val.toLocaleString()} />
            <Tooltip formatter={(val) => "$" + val.toLocaleString()} />
            <Bar dataKey="value" fill="#0d6efd" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
