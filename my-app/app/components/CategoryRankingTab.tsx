"use client";

import { useState } from "react";

export type CategoryRankingEntry = {
  rank: number;
  category: string;
  product_count: number;
  total_sold_count: number;
  avg_commission_rate: number | null;
};

export default function CategoryRankingTab({ categories }: { categories: CategoryRankingEntry[] }) {
  const [minCommission, setMinCommission] = useState(0);
  const [maxCommission, setMaxCommission] = useState(100);

  if (categories.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Belum ada data kategori untuk dianalisis.
      </p>
    );
  }

  const filtered = categories.filter((c) => {
    if (c.avg_commission_rate == null) return false;
    return c.avg_commission_rate >= minCommission && c.avg_commission_rate <= maxCommission;
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Top Kategori — Ranking by Total Terjual</h2>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Komisi Min (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={minCommission}
            onChange={(e) => setMinCommission(Number(e.target.value))}
            className="w-24 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Komisi Maks (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={maxCommission}
            onChange={(e) => setMaxCommission(Number(e.target.value))}
            className="w-24 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Tidak ada kategori dengan komisi di rentang ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Kategori</th>
                <th className="py-2 pr-4">Jumlah Produk</th>
                <th className="py-2 pr-4">Total Terjual</th>
                <th className="py-2 pr-4">Avg Komisi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((c) => (
                <tr key={c.category}>
                  <td className="py-2 pr-4 text-zinc-500 dark:text-zinc-400">{c.rank}</td>
                  <td className="py-2 pr-4">{c.category}</td>
                  <td className="py-2 pr-4">{c.product_count.toLocaleString("id-ID")}</td>
                  <td className="py-2 pr-4">{c.total_sold_count.toLocaleString("id-ID")}</td>
                  <td className="py-2 pr-4">
                    {c.avg_commission_rate != null ? `${c.avg_commission_rate.toFixed(1)}%` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Top performing creator per kategori: <span className="font-medium">TBD</span> — akan ditambahkan di versi
        berikutnya setelah data organic scraper lebih lengkap.
      </p>
    </div>
  );
}
