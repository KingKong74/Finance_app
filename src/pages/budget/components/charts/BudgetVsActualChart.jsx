import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import Card from "../Card";
import ChartTooltip from "./ChartTooltip";

export default function BudgetVsActualChart({ title, subtitle, data }) {
  return (
    <Card title={title} subtitle={subtitle}>
      <div className="b-chart">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="4 4" />
            <XAxis dataKey="label" />
            <YAxis tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="budget" />
            <Bar dataKey="actual" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
