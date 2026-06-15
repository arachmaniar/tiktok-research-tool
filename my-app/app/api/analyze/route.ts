import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { postEngagementScore } from "@/lib/engagement";

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// How many top creators get their posts run through Claude, and how many
// posts per creator. Keeps the route within maxDuration and API cost sane.
const TOP_CREATORS_FOR_QUAL = 5;
const POSTS_PER_CREATOR_FOR_QUAL = 3;
const QUAL_CONCURRENCY = 3;

const QUALITATIVE_SYSTEM_PROMPT = `Kamu adalah content psychology analyst. Analisis konten TikTok berikut menggunakan framework akademis:

1. CIALDINI'S 7 PRINCIPLES
   Identifikasi mana yang dipakai: reciprocity, commitment/consistency, social proof, authority, liking, scarcity, unity.

2. COPYWRITING FRAMEWORK
   Detect struktur konten: AIDA, PAS (Problem-Agitate-Solution), BAB (Before-After-Bridge), atau StoryBrand.

3. HOOK CLASSIFICATION
   Klasifikasi hook: fear, curiosity, transformation, social proof, controversy, storytelling.

4. CONVERSION KEYWORDS
   Identifikasi kata/frasa spesifik yang likely trigger purchase action.

5. EMOTION TARGET
   Berdasarkan Plutchik's Wheel: joy, trust, fear, surprise, anticipation, dll.

Return HANYA JSON tanpa markdown:
{
  "hook_type": "string",
  "hook_text": "kutipan hook dari caption",
  "cialdini_principles": ["list principles yang dipakai"],
  "framework": "AIDA/PAS/BAB/StoryBrand/Other",
  "framework_breakdown": {
    "problem": "...",
    "agitate": "...",
    "solution": "..."
  },
  "conversion_keywords": ["list kata trigger"],
  "emotion_target": ["list emosi"],
  "effectiveness_score": 1-10,
  "reasoning": "penjelasan singkat kenapa konten ini works/tidak"
}`;

const SUMMARY_SYSTEM_PROMPT = `Kamu adalah content strategy analyst. Dari analisis 10 creator teratas di niche ini, buat summary pattern yang ditemukan.

Return HANYA JSON tanpa markdown:
{
  "dominant_hook_pattern": {
    "type": "string",
    "percentage": "berapa persen creator pakai ini",
    "example": "contoh hook yang paling efektif"
  },
  "dominant_framework": {
    "type": "string",
    "percentage": "berapa persen",
    "why_it_works": "penjelasan"
  },
  "top_conversion_keywords": [
    { "keyword": "string", "frequency": "muncul di berapa dari 10 creator" }
  ],
  "psychological_triggers": [
    { "trigger": "string", "frequency": "string", "example": "string" }
  ],
  "posting_pattern": {
    "avg_frequency": "string",
    "best_days": ["string"],
    "best_times": ["string"]
  },
  "content_strategy_recommendation": "paragraph — rekomendasi strategi konten berdasarkan semua pattern"
}`;

type ProductRow = {
  id: string;
  product_name: string | null;
  price: number | null;
  sold_count: number | null;
  rating: number | null;
  commission_rate: number | null;
  seller_name: string | null;
  category: string | null;
};

type CreatorRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  follower_count: number | null;
  video_count: number | null;
  commission_rate: number | null;
};

type PostRow = {
  id: string;
  creator_id: string | null;
  caption: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  hashtags: string[] | null;
  post_url: string | null;
};

function parseClaudeJson(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  return JSON.parse(cleaned);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export async function POST(request: NextRequest) {
  let sessionId: string | null = null;

  try {
    const body = await request.json();
    sessionId = typeof body.session_id === "string" ? body.session_id : null;

    if (!sessionId) {
      return NextResponse.json({ error: "session_id wajib diisi" }, { status: 400 });
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("research_sessions")
      .select("id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session tidak ditemukan" }, { status: 404 });
    }

    await supabaseAdmin.from("research_sessions").update({ status: "analyzing" }).eq("id", sessionId);

    const [productsRes, creatorsRes, postsRes] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, product_name, price, sold_count, rating, commission_rate, seller_name, category")
        .eq("session_id", sessionId),
      supabaseAdmin
        .from("creators")
        .select("id, username, display_name, follower_count, video_count, commission_rate")
        .eq("session_id", sessionId),
      supabaseAdmin
        .from("posts")
        .select("id, creator_id, caption, views, likes, comments, shares, hashtags, post_url")
        .eq("session_id", sessionId),
    ]);

    if (productsRes.error) throw new Error(`Gagal ambil products: ${productsRes.error.message}`);
    if (creatorsRes.error) throw new Error(`Gagal ambil creators: ${creatorsRes.error.message}`);
    if (postsRes.error) throw new Error(`Gagal ambil posts: ${postsRes.error.message}`);

    const products = productsRes.data ?? [];
    const creators = creatorsRes.data ?? [];
    const posts = postsRes.data ?? [];

    // ---- Angka: kalkulasi quant di Next.js ----
    const productQuant = buildProductQuant(products);
    const creatorQuant = buildCreatorQuant(creators, posts);
    const categoryRanking = buildCategoryRanking(products);

    await supabaseAdmin.from("analysis_results").insert([
      { session_id: sessionId, analysis_type: "product_quant", result: productQuant },
      { session_id: sessionId, analysis_type: "creator_quant", result: creatorQuant },
      { session_id: sessionId, analysis_type: "category_ranking", result: categoryRanking },
    ]);

    // ---- Teks: analisis kualitatif via Claude ----
    const warnings: string[] = [];
    const postsForAnalysis = selectPostsForQualAnalysis(creatorQuant.creators, posts);
    const qualResults = await analyzePosts(postsForAnalysis, warnings);

    if (qualResults.length > 0) {
      await supabaseAdmin.from("analysis_results").insert(
        qualResults.map((result) => ({
          session_id: sessionId,
          analysis_type: "creator_qual",
          result,
        }))
      );
    }

    let nicheSummary = null;
    if (qualResults.length > 0) {
      try {
        nicheSummary = await buildNicheSummary(qualResults);
        await supabaseAdmin
          .from("analysis_results")
          .insert({ session_id: sessionId, analysis_type: "niche_summary", result: nicheSummary });
      } catch (err) {
        warnings.push(`Niche summary gagal: ${describeError(err)}`);
      }
    }

    await supabaseAdmin.from("research_sessions").update({ status: "complete" }).eq("id", sessionId);

    return NextResponse.json({
      session_id: sessionId,
      product_quant: productQuant,
      creator_quant: creatorQuant,
      category_ranking: categoryRanking,
      creator_qual_count: qualResults.length,
      niche_summary: nicheSummary,
      warnings,
    });
  } catch (err) {
    console.error("[/api/analyze]", err);

    if (sessionId) {
      await supabaseAdmin.from("research_sessions").update({ status: "error" }).eq("id", sessionId);
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Terjadi kesalahan" },
      { status: 500 }
    );
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---- Quant: product ranking by sold_count ("Terjual") ----

function buildProductQuant(products: ProductRow[]) {
  const ranked = [...products]
    .sort((a, b) => (b.sold_count ?? 0) - (a.sold_count ?? 0))
    .map((p, index) => ({
      rank: index + 1,
      product_id: p.id,
      product_name: p.product_name,
      price: p.price,
      sold_count: p.sold_count,
      commission_rate: p.commission_rate,
      rating: p.rating,
      seller_name: p.seller_name,
      category: p.category,
    }));

  return {
    total_products: products.length,
    products: ranked,
  };
}

// ---- Quant: category ranking by total sold_count ("Total Terjual") ----
// "Top performing creator per category" ditunda (TBD) — creators tidak punya relasi ke category.

type CategoryRankingEntry = {
  rank: number;
  category: string;
  product_count: number;
  total_sold_count: number;
  avg_commission_rate: number | null;
};

function buildCategoryRanking(products: ProductRow[]) {
  const byCategory = new Map<string, ProductRow[]>();
  for (const p of products) {
    const key = p.category?.trim() || "Lainnya";
    const list = byCategory.get(key) ?? [];
    list.push(p);
    byCategory.set(key, list);
  }

  const ranked: CategoryRankingEntry[] = Array.from(byCategory.entries())
    .map(([category, items]) => {
      const totalSoldCount = items.reduce((sum, p) => sum + (p.sold_count ?? 0), 0);

      const commissionRates = items.map((p) => p.commission_rate).filter((r): r is number => r != null);
      const avgCommissionRate =
        commissionRates.length > 0
          ? round2(commissionRates.reduce((a, b) => a + b, 0) / commissionRates.length)
          : null;

      return {
        category,
        product_count: items.length,
        total_sold_count: totalSoldCount,
        avg_commission_rate: avgCommissionRate,
      };
    })
    .sort((a, b) => b.total_sold_count - a.total_sold_count)
    .map((c, index) => ({ rank: index + 1, ...c }));

  return {
    total_categories: ranked.length,
    categories: ranked,
  };
}

// ---- Quant: creator ranking by Engagement Score ----
// Engagement Score (per post) = views + (likes x 2) + (comments x 3) + (shares x 4)

type CreatorQuantEntry = {
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
};

function buildCreatorQuant(creators: CreatorRow[], posts: PostRow[]) {
  const postsByCreator = new Map<string, PostRow[]>();
  for (const post of posts) {
    if (!post.creator_id) continue;
    const list = postsByCreator.get(post.creator_id) ?? [];
    list.push(post);
    postsByCreator.set(post.creator_id, list);
  }

  const enriched = creators.map((creator) => {
    const creatorPosts = postsByCreator.get(creator.id) ?? [];
    const totalViews = creatorPosts.reduce((sum, p) => sum + (p.views ?? 0), 0);
    const engagementScore = creatorPosts.reduce((sum, p) => sum + postEngagementScore(p), 0);

    const engagementRates = creatorPosts
      .filter((p) => (p.views ?? 0) > 0)
      .map((p) => ((p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0)) / (p.views as number));

    const avgEngagementRate =
      engagementRates.length > 0 ? engagementRates.reduce((a, b) => a + b, 0) / engagementRates.length : null;

    return {
      creator_id: creator.id,
      username: creator.username,
      display_name: creator.display_name,
      follower_count: creator.follower_count,
      video_count: creator.video_count,
      commission_rate: creator.commission_rate,
      post_count_analyzed: creatorPosts.length,
      total_views: totalViews,
      engagement_score: engagementScore,
      avg_engagement_rate_pct: avgEngagementRate !== null ? round2(avgEngagementRate * 100) : null,
    };
  });

  const ranked: CreatorQuantEntry[] = enriched
    .sort((a, b) => {
      const engagementScoreDiff = b.engagement_score - a.engagement_score;
      if (engagementScoreDiff !== 0) return engagementScoreDiff;
      const engagementRateDiff = (b.avg_engagement_rate_pct ?? 0) - (a.avg_engagement_rate_pct ?? 0);
      if (engagementRateDiff !== 0) return engagementRateDiff;
      return b.total_views - a.total_views;
    })
    .map((c, index) => ({ ...c, rank: index + 1 }));

  const totalEngagementScore = posts.reduce((sum, p) => sum + postEngagementScore(p), 0);

  return {
    total_creators: creators.length,
    total_engagement_score: totalEngagementScore,
    creators: ranked,
  };
}

// ---- Qual: per-post analysis via Claude ----

function selectPostsForQualAnalysis(rankedCreators: CreatorQuantEntry[], posts: PostRow[]) {
  const postsByCreator = new Map<string, PostRow[]>();
  for (const post of posts) {
    if (!post.creator_id || !post.caption) continue;
    const list = postsByCreator.get(post.creator_id) ?? [];
    list.push(post);
    postsByCreator.set(post.creator_id, list);
  }

  const selected: { creator: CreatorQuantEntry; post: PostRow }[] = [];

  for (const creator of rankedCreators.slice(0, TOP_CREATORS_FOR_QUAL)) {
    const creatorPosts = (postsByCreator.get(creator.creator_id) ?? [])
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, POSTS_PER_CREATOR_FOR_QUAL);

    for (const post of creatorPosts) {
      selected.push({ creator, post });
    }
  }

  return selected;
}

async function analyzePosts(
  selected: { creator: CreatorQuantEntry; post: PostRow }[],
  warnings: string[]
) {
  const results: Record<string, unknown>[] = [];

  for (let i = 0; i < selected.length; i += QUAL_CONCURRENCY) {
    const batch = selected.slice(i, i + QUAL_CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async ({ creator, post }) => {
        try {
          const analysis = await analyzeSinglePost(post);
          return {
            creator_id: creator.creator_id,
            username: creator.username,
            post_id: post.id,
            post_url: post.post_url,
            caption: post.caption,
            ...analysis,
          };
        } catch (err) {
          warnings.push(`Analisis post ${post.id} gagal: ${describeError(err)}`);
          return null;
        }
      })
    );

    for (const result of batchResults) {
      if (result) results.push(result);
    }
  }

  return results;
}

async function analyzeSinglePost(post: PostRow) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: QUALITATIVE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Caption: ${post.caption ?? ""}`,
          `Hashtags: ${(post.hashtags ?? []).join(", ") || "-"}`,
          `Views: ${post.views ?? "-"}`,
          `Likes: ${post.likes ?? "-"}`,
          `Comments: ${post.comments ?? "-"}`,
          `Shares: ${post.shares ?? "-"}`,
        ].join("\n"),
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude tidak mengembalikan respons teks");
  }

  return parseClaudeJson(textBlock.text);
}

// ---- Qual: niche summary dari top creator yang sudah dianalisis ----

async function buildNicheSummary(qualResults: Record<string, unknown>[]) {
  const condensed = qualResults.map((r) => ({
    username: r.username,
    hook_type: r.hook_type,
    hook_text: r.hook_text,
    cialdini_principles: r.cialdini_principles,
    framework: r.framework,
    conversion_keywords: r.conversion_keywords,
    emotion_target: r.emotion_target,
    effectiveness_score: r.effectiveness_score,
  }));

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Hasil analisis ${condensed.length} konten dari top creator di niche ini:\n${JSON.stringify(condensed, null, 2)}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude tidak mengembalikan respons teks");
  }

  return parseClaudeJson(textBlock.text);
}
