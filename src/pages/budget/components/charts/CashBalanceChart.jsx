import React from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import Card from "../Card";
import ChartTooltip from "./ChartTooltip";

export default function CashBalanceChart({ title, subtitle, data }) {
  // expects: [{ label, endCash }]
  return (
    <Card title={title} subtitle={subtitle}>
      <div className="b-chart">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="4 4" />
            <XAxis dataKey="label" />
            <YAxis tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="endCash" strokeWidth={2} fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
