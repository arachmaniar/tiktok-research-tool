import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { postEngagementScore } from "@/lib/engagement";
import {
  HookPatternChart,
  FrameworkBreakdownChart,
  type CountEntry,
} from "@/app/components/CreatorDeepDiveCharts";

type Post = {
  id: string;
  caption: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  hashtags: string[] | null;
  post_url: string | null;
  posted_at: string | null;
};

type CreatorQualEntry = {
  creator_id: string;
  post_id: string;
  post_url?: string | null;
  hook_type?: string;
  framework?: string;
  conversion_keywords?: string[];
  brand_or_product_mentioned?: string[];
  review_summary?: string;
  targeted_keywords?: string[];
};

type CreatorQuantEntry = {
  rank: number;
  creator_id: string;
  engagement_score: number;
  avg_engagement_rate_pct: number | null;
};

export default async function CreatorDeepDivePage({
  params,
}: {
  params: Promise<{ session_id: string; creator_id: string }>;
}) {
  const { session_id, creator_id } = await params;

  const [{ data: creator }, { data: posts }, { data: analysisRows }] = await Promise.all([
    supabaseAdmin
      .from("creators")
      .select("id, username, display_name, follower_count, video_count, commission_rate, profile_url")
      .eq("id", creator_id)
      .eq("session_id", session_id)
      .maybeSingle(),
    supabaseAdmin
      .from("posts")
      .select("id, caption, views, likes, comments, shares, hashtags, post_url, posted_at")
      .eq("session_id", session_id)
      .eq("creator_id", creator_id)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(30),
    supabaseAdmin
      .from("analysis_results")
      .select("analysis_type, result")
      .eq("session_id", session_id)
      .in("analysis_type", ["creator_quant", "creator_qual"]),
  ]);

  if (!creator) {
    notFound();
  }

  const creatorQuant = analysisRows?.find((r) => r.analysis_type === "creator_quant")?.result as
    | { creators?: CreatorQuantEntry[] }
    | undefined;
  const quantEntry = creatorQuant?.creators?.find((c) => c.creator_id === creator_id);

  const qualEntries = (analysisRows ?? [])
    .filter((r) => r.analysis_type === "creator_qual")
    .map((r) => r.result as CreatorQualEntry)
    .filter((q) => q.creator_id === creator_id);

  const hookPatternData = countBy(qualEntries, (q) => q.hook_type);
  const frameworkData = countBy(qualEntries, (q) => q.framework);
  const keywordCloud = countKeywords(qualEntries);

  const postList: Post[] = posts ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
        <div>
          <Link href={`/results/${session_id}`} className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            ← Kembali ke hasil riset
          </Link>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">@{creator.username}</h1>
              {creator.display_name && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{creator.display_name}</p>
              )}
            </div>
            {creator.profile_url && (
              <a
                href={creator.profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
              >
                Lihat profil TikTok ↗
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <Stat
            label="Followers"
            value={creator.follower_count != null ? Number(creator.follower_count).toLocaleString("id-ID") : "-"}
          />
          <Stat
            label="Engagement Score"
            value={quantEntry ? Number(quantEntry.engagement_score).toLocaleString("id-ID") : "-"}
          />
          <Stat label="Rank" value={quantEntry ? `#${quantEntry.rank}` : "-"} />
          <Stat
            label="Engagement Rate"
            value={quantEntry?.avg_engagement_rate_pct != null ? `${quantEntry.avg_engagement_rate_pct}%` : "-"}
          />
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-lg font-semibold">30 Post Terakhir</h2>
          {postList.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Belum ada data post untuk creator ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4">Caption</th>
                    <th className="py-2 pr-4">Views</th>
                    <th className="py-2 pr-4">Likes</th>
                    <th className="py-2 pr-4">Comments</th>
                    <th className="py-2 pr-4">Shares</th>
                    <th className="py-2 pr-4">Engagement Score</th>
                    <th className="py-2 pr-4">Tanggal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {postList.map((p, index) => (
                    <tr key={p.id}>
                      <td className="py-2 pr-4 text-zinc-500 dark:text-zinc-400">{index + 1}</td>
                      <td className="max-w-xs py-2 pr-4">
                        <div className="truncate">
                          {p.post_url ? (
                            <a href={p.post_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {p.caption || "(tanpa caption)"}
                            </a>
                          ) : (
                            p.caption || "(tanpa caption)"
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4">{Number(p.views ?? 0).toLocaleString("id-ID")}</td>
                      <td className="py-2 pr-4">{Number(p.likes ?? 0).toLocaleString("id-ID")}</td>
                      <td className="py-2 pr-4">{Number(p.comments ?? 0).toLocaleString("id-ID")}</td>
                      <td className="py-2 pr-4">{Number(p.shares ?? 0).toLocaleString("id-ID")}</td>
                      <td className="py-2 pr-4">{postEngagementScore(p).toLocaleString("id-ID")}</td>
                      <td className="py-2 pr-4">
                        {p.posted_at ? new Date(p.posted_at).toLocaleDateString("id-ID") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {qualEntries.length === 0 ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-2 text-lg font-semibold">Analisis Kualitatif</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Belum ada analisis kualitatif mendalam untuk creator ini. Hanya top 5 creator dengan Engagement Score
              tertinggi yang dianalisis oleh Claude (maks. 3 post per creator).
            </p>
          </section>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="mb-3 text-lg font-semibold">Hook Pattern</h2>
                <HookPatternChart data={hookPatternData} />
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="mb-3 text-lg font-semibold">Framework Breakdown</h2>
                <FrameworkBreakdownChart data={frameworkData} />
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-3 text-lg font-semibold">Conversion Keywords</h2>
              {keywordCloud.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Tidak ada conversion keyword terdeteksi.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {keywordCloud.map((k) => (
                    <span
                      key={k.name}
                      className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      style={{ fontSize: `${Math.min(0.75 + k.count * 0.25, 1.5)}rem` }}
                    >
                      {k.name}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Berdasarkan {qualEntries.length} post yang dianalisis Claude untuk creator ini.
            </p>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-3 text-lg font-semibold">Detail Analisis per Video</h2>
              <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
                Diekstrak dari transkrip audio tiap video (bukan caption).
              </p>
              <div className="flex flex-col gap-4">
                {qualEntries.map((entry, index) => (
                  <div
                    key={entry.post_id}
                    className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Video {index + 1}</p>
                      {entry.post_url && (
                        <a
                          href={entry.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                        >
                          Lihat video ↗
                        </a>
                      )}
                    </div>

                    <div className="mb-3">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Brand/Produk yang Disebutkan
                      </p>
                      {entry.brand_or_product_mentioned && entry.brand_or_product_mentioned.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {entry.brand_or_product_mentioned.map((brand) => (
                            <span
                              key={brand}
                              className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              {brand}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-400 dark:text-zinc-500">Tidak terdeteksi</p>
                      )}
                    </div>

                    <div className="mb-3">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Review Summary
                      </p>
                      <p className="text-sm">{entry.review_summary || "Tidak ada ringkasan review."}</p>
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Targeted Keywords
                      </p>
                      {entry.targeted_keywords && entry.targeted_keywords.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {entry.targeted_keywords.map((keyword) => (
                            <span
                              key={keyword}
                              className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-400 dark:text-zinc-500">Tidak terdeteksi</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
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

function countBy<T>(items: T[], getKey: (item: T) => string | undefined): CountEntry[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item)?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function countKeywords(qualEntries: CreatorQualEntry[]): CountEntry[] {
  const counts = new Map<string, number>();
  for (const entry of qualEntries) {
    for (const keyword of entry.conversion_keywords ?? []) {
      const key = keyword.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
