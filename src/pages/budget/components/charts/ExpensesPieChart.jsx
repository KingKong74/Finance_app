import React from "react";
import { ResponsiveContainer, PieChart, Pie, Tooltip, Cell, Legend } from "recharts";
import Card from "../Card";
import ChartTooltip from "./ChartTooltip";

const PIE_COLOURS = ["#111827", "#374151", "#6b7280", "#9ca3af", "#4b5563", "#d1d5db", "#e5e7eb"];

export default function ExpensesPieChart({ title, subtitle, data }) {
  return (
    <Card title={title} subtitle={subtitle}>
      <div className="b-chart b-chart--pie">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLOURS[i % PIE_COLOURS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
