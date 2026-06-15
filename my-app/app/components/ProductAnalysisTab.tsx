export type RankedProduct = {
  id: string;
  rank: number;
  product_name: string | null;
  product_url: string | null;
  price: number | null;
  sold_count: number | null;
  commission_rate: number | null;
  rating: number | null;
  seller_name: string | null;
  badges: string[];
};

export default function ProductAnalysisTab({ products }: { products: RankedProduct[] }) {
  if (products.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Belum ada data produk untuk dianalisis.
      </p>
    );
  }

  const totalSoldCount = products.reduce((sum, p) => sum + (p.sold_count ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Top Produk — Ranking by Terjual</h2>

      <div className="flex flex-wrap gap-4 text-sm">
        <Stat label="Total Produk" value={products.length.toLocaleString("id-ID")} />
        <Stat label="Total Terjual" value={totalSoldCount.toLocaleString("id-ID")} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4">Produk</th>
              <th className="py-2 pr-4">Harga</th>
              <th className="py-2 pr-4">Terjual</th>
              <th className="py-2 pr-4">Komisi</th>
              <th className="py-2 pr-4">Rating</th>
              <th className="py-2 pr-4">Seller</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {products.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-4 text-zinc-500 dark:text-zinc-400">{p.rank}</td>
                <td className="max-w-xs py-2 pr-4">
                  <div className="truncate">
                    {p.product_url ? (
                      <a href={p.product_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {p.product_name}
                      </a>
                    ) : (
                      p.product_name
                    )}
                  </div>
                  {p.badges.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.badges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-4">{p.price != null ? `$${Number(p.price).toFixed(2)}` : "-"}</td>
                <td className="py-2 pr-4">
                  {p.sold_count != null ? Number(p.sold_count).toLocaleString("id-ID") : "-"}
                </td>
                <td className="py-2 pr-4">
                  {p.commission_rate != null ? `${Number(p.commission_rate).toFixed(1)}%` : "-"}
                </td>
                <td className="py-2 pr-4">{p.rating ?? "-"}</td>
                <td className="py-2 pr-4">{p.seller_name ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-2 dark:border-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
