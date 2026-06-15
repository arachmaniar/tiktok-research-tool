"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type CountEntry = { name: string; count: number };

export function HookPatternChart({ data }: { data: CountEntry[] }) {
  return <CountBarChart data={data} barColor="#6366f1" />;
}

export function FrameworkBreakdownChart({ data }: { data: CountEntry[] }) {
  return <CountBarChart data={data} barColor="#10b981" />;
}

function CountBarChart({ data, barColor }: { data: CountEntry[]; barColor: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="count" fill={barColor} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
