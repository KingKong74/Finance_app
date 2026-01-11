import React from "react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import Card from "../Card";
import ChartTooltip from "./ChartTooltip";

export default function IncomeVsExpensesChart({ title, subtitle, data }) {
  return (
    <Card title={title} subtitle={subtitle}>
      <div className="b-chart">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="4 4" />
            <XAxis dataKey="label" />
            <YAxis tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="income" />
            <Line type="monotone" dataKey="expenses" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
