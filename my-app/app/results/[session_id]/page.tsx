import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import StatusBadge from "@/app/components/StatusBadge";
import ScrapeTrigger from "@/app/components/ScrapeTrigger";
import AnalyzeTrigger from "@/app/components/AnalyzeTrigger";
import DashboardTabs from "@/app/components/DashboardTabs";
import ProductAnalysisTab, { type RankedProduct } from "@/app/components/ProductAnalysisTab";
import CreatorAnalysisTab, { type CreatorQuantEntry, type NicheSummary } from "@/app/components/CreatorAnalysisTab";
import CategoryRankingTab, { type CategoryRankingEntry } from "@/app/components/CategoryRankingTab";
import { detectProductBadges } from "@/lib/product-badges";

type ExpandedKeywords = {
  keywords?: string[];
  hashtags?: string[];
  search_terms?: string[];
};

type Product = {
  id: string;
  product_name: string | null;
  product_url: string | null;
  price: number | null;
  sold_count: number | null;
  commission_rate: number | null;
  rating: number | null;
  seller_name: string | null;
};

type StoredCreatorQuant = Omit<CreatorQuantEntry, "profile_url">;

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ session_id: string }>;
  searchParams: Promise<{ cached?: string }>;
}) {
  const { session_id } = await params;
  const { cached } = await searchParams;

  const { data: session } = await supabaseAdmin
    .from("research_sessions")
    .select("*")
    .eq("id", session_id)
    .single();

  if (!session) {
    notFound();
  }

  const [{ data: products }, { data: creatorProfiles }, { data: analysisRows }] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("id, product_name, product_url, price, sold_count, commission_rate, rating, seller_name")
      .eq("session_id", session_id)
      .order("sold_count", { ascending: false, nullsFirst: false }),
    supabaseAdmin.from("creators").select("id, profile_url").eq("session_id", session_id),
    supabaseAdmin
      .from("analysis_results")
      .select("analysis_type, result")
      .eq("session_id", session_id)
      .in("analysis_type", ["creator_quant", "niche_summary", "category_ranking"]),
  ]);

  const expanded = (session.expanded_keywords ?? {}) as ExpandedKeywords;
  const hasExpandedKeywords =
    (expanded.keywords?.length ?? 0) > 0 ||
    (expanded.hashtags?.length ?? 0) > 0 ||
    (expanded.search_terms?.length ?? 0) > 0;

  const rankedProducts = buildRankedProducts(products ?? []);

  const creatorQuant = analysisRows?.find((r) => r.analysis_type === "creator_quant")?.result as
    | { creators?: StoredCreatorQuant[]; total_engagement_score?: number }
    | undefined;
  const nicheSummary = (analysisRows?.find((r) => r.analysis_type === "niche_summary")?.result ?? null) as
    | NicheSummary
    | null;
  const categoryRanking = analysisRows?.find((r) => r.analysis_type === "category_ranking")?.result as
    | { categories?: CategoryRankingEntry[] }
    | undefined;

  const profileUrlById = new Map((creatorProfiles ?? []).map((c) => [c.id, c.profile_url as string | null]));

  const topCreators: CreatorQuantEntry[] = (creatorQuant?.creators ?? []).slice(0, 10).map((c) => ({
    ...c,
    profile_url: profileUrlById.get(c.creator_id) ?? null,
  }));

  const totalEngagementScore = creatorQuant?.total_engagement_score ?? 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            ← Kembali
          </Link>
          <div className="mt-2 flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold">{session.keyword}</h1>
            <StatusBadge status={session.status} />
          </div>
        </div>

        {cached === "1" && session.last_scraped_at && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
            Data dari cache (diambil {formatHoursAgo(session.last_scraped_at)} lalu) — tidak scrape ulang dari TikTok.
          </div>
        )}

        {hasExpandedKeywords && (
          <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Expanded Keywords
            </h2>
            <div className="flex flex-col gap-3">
              <KeywordGroup label="Keywords" items={expanded.keywords} />
              <KeywordGroup label="Hashtags" items={expanded.hashtags} />
              <KeywordGroup label="Search Terms" items={expanded.search_terms} />
            </div>
          </section>
        )}

        {session.status === "pending" && <ScrapeTrigger sessionId={session.id} />}

        {session.status === "scraping" && <AnalyzeTrigger sessionId={session.id} />}

        {session.status === "analyzing" && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white" />
            <p className="text-sm font-medium">Menganalisis konten dengan Claude...</p>
          </div>
        )}

        {(session.status === "complete" || session.status === "error") && (
          <>
            {session.status === "error" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                Terjadi error saat memproses riset ini.
              </div>
            )}

            <div className="rounded-lg border border-zinc-200 px-4 py-2 dark:border-zinc-800">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Engagement Score (Session)</p>
              <p className="text-lg font-semibold">{totalEngagementScore.toLocaleString("id-ID")}</p>
            </div>

            <DashboardTabs
              tabs={[
                {
                  id: "product",
                  label: "Product Analysis",
                  content: <ProductAnalysisTab products={rankedProducts} />,
                },
                {
                  id: "creator",
                  label: "Creator Analysis",
                  content: <CreatorAnalysisTab sessionId={session_id} creators={topCreators} summary={nicheSummary} />,
                },
                {
                  id: "category",
                  label: "Category Ranking",
                  content: <CategoryRankingTab categories={categoryRanking?.categories ?? []} />,
                },
              ]}
            />
          </>
        )}
      </main>
    </div>
  );
}

function KeywordGroup({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatHoursAgo(isoTimestamp: string): string {
  const hours = Math.max(0, (Date.now() - new Date(isoTimestamp).getTime()) / (1000 * 60 * 60));
  if (hours < 1) return `${Math.round(hours * 60)} menit`;
  return `${Math.round(hours)} jam`;
}

function buildRankedProducts(products: Product[]): RankedProduct[] {
  return [...products]
    .sort((a, b) => (b.sold_count ?? 0) - (a.sold_count ?? 0))
    .map((p, index) => ({
      id: p.id,
      rank: index + 1,
      product_name: p.product_name,
      product_url: p.product_url,
      price: p.price,
      sold_count: p.sold_count,
      commission_rate: p.commission_rate,
      rating: p.rating,
      seller_name: p.seller_name,
      badges: detectProductBadges(p.product_name),
    }));
}

