import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { portfolioPieData } from "../overviewData";

const COLORS = ["#0d6efd", "#2e7d32", "#c62828", "#ffc107", "#6c757d"];

export default function PortfolioPie() {
  return (
    <div className="chart-card">
      <h4>Investments by % of Portfolio</h4>
      <div style={{ width: "100%", height: 250 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={portfolioPieData}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={3}
            >
              {portfolioPieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(val) => val + "%"} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
