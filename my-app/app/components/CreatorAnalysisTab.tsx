import Link from "next/link";

export type CreatorQuantEntry = {
  rank: number;
  creator_id: string;
  username: string | null;
  display_name: string | null;
  follower_count: number | null;
  video_count: number | null;
  commission_rate: number | null;
  post_count_analyzed: number;
  total_views: number;
  engagement_score: number;
  avg_engagement_rate_pct: number | null;
  profile_url: string | null;
};

export type NicheSummary = {
  dominant_hook_pattern?: { type?: string; percentage?: string; example?: string };
  dominant_framework?: { type?: string; percentage?: string; why_it_works?: string };
  top_conversion_keywords?: { keyword: string; frequency: string }[];
  psychological_triggers?: { trigger: string; frequency: string; example: string }[];
  posting_pattern?: { avg_frequency?: string; best_days?: string[]; best_times?: string[] };
  content_strategy_recommendation?: string;
};

export default function CreatorAnalysisTab({
  sessionId,
  creators,
  summary,
}: {
  sessionId: string;
  creators: CreatorQuantEntry[];
  summary: NicheSummary | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      {summary && <SummaryPanel summary={summary} />}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Top Creator — Engagement Score Ranking</h2>
        {creators.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Belum ada data creator untuk dianalisis.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Username</th>
                  <th className="py-2 pr-4">Followers</th>
                  <th className="py-2 pr-4">Engagement Score</th>
                  <th className="py-2 pr-4">Komisi</th>
                  <th className="py-2 pr-4">Engagement Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {creators.map((c) => (
                  <tr key={c.creator_id}>
                    <td className="py-2 pr-4 text-zinc-500 dark:text-zinc-400">{c.rank}</td>
                    <td className="py-2 pr-4">
                      <Link href={`/results/${sessionId}/creator/${c.creator_id}`} className="hover:underline">
                        @{c.username}
                      </Link>
                      {c.profile_url && (
                        <a
                          href={c.profile_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1.5 text-zinc-400 hover:underline dark:text-zinc-500"
                          title="Lihat profil TikTok"
                        >
                          ↗
                        </a>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {c.follower_count != null ? Number(c.follower_count).toLocaleString("id-ID") : "-"}
                    </td>
                    <td className="py-2 pr-4">{Number(c.engagement_score).toLocaleString("id-ID")}</td>
                    <td className="py-2 pr-4">
                      {c.commission_rate != null ? `${Number(c.commission_rate).toFixed(1)}%` : "-"}
                    </td>
                    <td className="py-2 pr-4">
                      {c.avg_engagement_rate_pct != null ? `${c.avg_engagement_rate_pct}%` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryPanel({ summary }: { summary: NicheSummary }) {
  const keywords = summary.top_conversion_keywords ?? [];
  const triggers = summary.psychological_triggers ?? [];
  const posting = summary.posting_pattern;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 text-lg font-semibold">Pattern Dominan — Top Creator</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {summary.dominant_hook_pattern && (
          <PatternCard
            title="Dominant Hook"
            type={summary.dominant_hook_pattern.type}
            percentage={summary.dominant_hook_pattern.percentage}
            footer={summary.dominant_hook_pattern.example ? `Contoh: "${summary.dominant_hook_pattern.example}"` : undefined}
          />
        )}
        {summary.dominant_framework && (
          <PatternCard
            title="Dominant Framework"
            type={summary.dominant_framework.type}
            percentage={summary.dominant_framework.percentage}
            footer={summary.dominant_framework.why_it_works}
          />
        )}
      </div>

      {keywords.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Top Conversion Keywords
          </p>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((k) => (
              <span
                key={k.keyword}
                className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {k.keyword} <span className="text-zinc-400 dark:text-zinc-500">({k.frequency})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {triggers.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Psychological Triggers
          </p>
          <ul className="flex flex-col gap-2">
            {triggers.map((t) => (
              <li key={t.trigger} className="text-sm">
                <span className="font-medium">{t.trigger}</span>{" "}
                <span className="text-zinc-400 dark:text-zinc-500">({t.frequency})</span>
                {t.example && <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.example}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {posting && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Posting Pattern
          </p>
          <div className="flex flex-col gap-1.5 text-sm">
            {posting.avg_frequency && <p>Frekuensi: {posting.avg_frequency}</p>}
            {posting.best_days && posting.best_days.length > 0 && (
              <p>Hari terbaik: {posting.best_days.join(", ")}</p>
            )}
            {posting.best_times && posting.best_times.length > 0 && (
              <p>Jam terbaik: {posting.best_times.join(", ")}</p>
            )}
          </div>
        </div>
      )}

      {summary.content_strategy_recommendation && (
        <div className="mt-4 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-800">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Rekomendasi Strategi Konten
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">{summary.content_strategy_recommendation}</p>
        </div>
      )}
    </section>
  );
}

function PatternCard({
  title,
  type,
  percentage,
  footer,
}: {
  title: string;
  type?: string;
  percentage?: string;
  footer?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="text-base font-semibold">{type ?? "-"}</p>
        {percentage && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {percentage}
          </span>
        )}
      </div>
      {footer && <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{footer}</p>}
    </div>
  );
}
