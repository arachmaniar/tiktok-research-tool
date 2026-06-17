import { NextRequest, NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI, { toFile } from "openai";
import { supabaseAdmin } from "@/lib/supabase";
import { postEngagementScore } from "@/lib/engagement";

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// How many top creators get their posts run through Claude, and how many
// videos per creator get transcribed+analyzed. Keeps the route within
// maxDuration and Whisper/Claude cost sane.
const TOP_CREATORS_FOR_QUAL = 5;
const MAX_VIDEOS_PER_CREATOR_FOR_QUAL = 5;
const QUAL_CONCURRENCY = 3;

// Rough Whisper cost estimate for console logging only (actual OpenAI pricing
// is per-minute, not per-video — this is a conservative flat estimate).
const WHISPER_EST_COST_PER_VIDEO_USD = 0.01;

const QUALITATIVE_SYSTEM_PROMPT = `Kamu adalah content psychology analyst. Kamu akan menerima TRANSKRIP AUDIO (hasil speech-to-text) dari sebuah video TikTok — bukan caption. Analisis isi yang benar-benar DIUCAPKAN di video menggunakan framework akademis:

1. BRAND/PRODUK
   Identifikasi nama brand/produk yang disebutkan di transkrip.

2. REVIEW/TESTIMONI
   Ringkas review/testimoni yang diucapkan: positif/negatif, poin spesifik apa yang disebut (tekstur, harga, efek, dll).

3. TARGETED KEYWORDS
   Keyword yang relevan untuk SEO/discovery — bukan cuma kata trigger pembelian, tapi kata yang orang akan SEARCH untuk nemu produk/konten ini.

4. CIALDINI'S 7 PRINCIPLES
   Identifikasi mana yang dipakai: reciprocity, commitment/consistency, social proof, authority, liking, scarcity, unity.

5. COPYWRITING FRAMEWORK
   Detect struktur konten: AIDA, PAS (Problem-Agitate-Solution), BAB (Before-After-Bridge), atau StoryBrand.

6. HOOK CLASSIFICATION
   Klasifikasi hook verbal (kalimat pembuka yang diucapkan): fear, curiosity, transformation, social proof, controversy, storytelling.

7. CONVERSION KEYWORDS
   Identifikasi kata/frasa spesifik di transkrip yang likely trigger purchase action.

8. EMOTION TARGET
   Berdasarkan Plutchik's Wheel: joy, trust, fear, surprise, anticipation, dll.

Return HANYA JSON tanpa markdown:
{
  "brand_or_product_mentioned": ["nama brand/produk yang disebutkan"],
  "review_summary": "ringkasan review/testimoni yang diucapkan",
  "targeted_keywords": ["keyword SEO/discovery yang relevan"],
  "hook_type": "string",
  "hook_text": "kutipan hook dari transkrip",
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
  raw_data: unknown;
};

type TiktokRawAweme = {
  video?: {
    download_addr?: { url_list?: string[] };
    play_addr?: { url_list?: string[] };
  };
};

function extractVideoUrl(rawData: unknown): string | null {
  const aweme = rawData as TiktokRawAweme | null;
  return (
    aweme?.video?.download_addr?.url_list?.[0] ??
    aweme?.video?.play_addr?.url_list?.[0] ??
    null
  );
}

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

    // Re-analyze sesi yang sama harus ganti hasil lama, bukan numpuk baris baru.
    const { error: deleteOldResultsError } = await supabaseAdmin
      .from("analysis_results")
      .delete()
      .eq("session_id", sessionId);

    if (deleteOldResultsError) {
      throw new Error(`Gagal hapus analysis_results lama: ${deleteOldResultsError.message}`);
    }

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
        .select("id, creator_id, caption, views, likes, comments, shares, hashtags, post_url, raw_data")
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

    // ---- Teks: analisis kualitatif (download video + Whisper + Claude) ----
    // Ini bisa makan waktu beberapa menit (download video + transcribe per post),
    // jadi dijalankan via after() supaya response ke client tidak nge-hang nunggu
    // koneksi HTTP yang lama (rawan ke-cut oleh proxy/tunnel). Client poll status
    // sesi (lihat AnalyzeTrigger) sampai berubah dari "analyzing".
    const postsForAnalysis = selectPostsForQualAnalysis(creatorQuant.creators, posts);

    after(async () => {
      const warnings: string[] = [];

      try {
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

        if (qualResults.length > 0) {
          try {
            const nicheSummary = await buildNicheSummary(qualResults);
            await supabaseAdmin
              .from("analysis_results")
              .insert({ session_id: sessionId, analysis_type: "niche_summary", result: nicheSummary });
          } catch (err) {
            warnings.push(`Niche summary gagal: ${describeError(err)}`);
          }
        }

        if (warnings.length > 0) {
          console.warn(`[/api/analyze] warnings untuk session ${sessionId}:`, warnings);
        }

        await supabaseAdmin.from("research_sessions").update({ status: "complete" }).eq("id", sessionId);
      } catch (err) {
        console.error(`[/api/analyze] background qual analysis gagal untuk session ${sessionId}:`, err);
        await supabaseAdmin.from("research_sessions").update({ status: "error" }).eq("id", sessionId);
      }
    });

    return NextResponse.json({
      session_id: sessionId,
      product_quant: productQuant,
      creator_quant: creatorQuant,
      category_ranking: categoryRanking,
      qual_posts_queued: postsForAnalysis.length,
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
    if (!post.creator_id || !extractVideoUrl(post.raw_data)) continue;
    const list = postsByCreator.get(post.creator_id) ?? [];
    list.push(post);
    postsByCreator.set(post.creator_id, list);
  }

  const selected: { creator: CreatorQuantEntry; post: PostRow }[] = [];

  for (const creator of rankedCreators.slice(0, TOP_CREATORS_FOR_QUAL)) {
    const creatorPosts = (postsByCreator.get(creator.creator_id) ?? [])
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, MAX_VIDEOS_PER_CREATOR_FOR_QUAL);

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

  console.log(
    `[/api/analyze] Whisper: akan transcribe maks ${selected.length} video, estimasi biaya ~$${(
      selected.length * WHISPER_EST_COST_PER_VIDEO_USD
    ).toFixed(2)} (estimasi kasar, lihat catatan pricing).`
  );

  for (let i = 0; i < selected.length; i += QUAL_CONCURRENCY) {
    const batch = selected.slice(i, i + QUAL_CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async ({ creator, post }) => {
        try {
          const transcript = await transcribeVideoForPost(post);

          if (!transcript) {
            warnings.push(`Post ${post.id}: transcript kosong/gagal, di-skip dari analisis kualitatif.`);
            return null;
          }

          const analysis = await analyzeTranscript(transcript);
          return {
            creator_id: creator.creator_id,
            username: creator.username,
            post_id: post.id,
            post_url: post.post_url,
            transcript,
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

async function transcribeVideoForPost(post: PostRow): Promise<string | null> {
  const videoUrl = extractVideoUrl(post.raw_data);
  if (!videoUrl) return null;

  try {
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      throw new Error(`Download video gagal (HTTP ${videoRes.status})`);
    }

    const buffer = Buffer.from(await videoRes.arrayBuffer());

    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(buffer, "video.mp4", { type: "video/mp4" }),
      model: "whisper-1",
    });

    const transcript = transcription.text?.trim() || null;

    await supabaseAdmin.from("posts").update({ transcript }).eq("id", post.id);

    return transcript;
  } catch (err) {
    console.error(`[/api/analyze] gagal transcribe post ${post.id}:`, describeError(err));
    return null;
  }
}

async function analyzeTranscript(transcript: string) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: QUALITATIVE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Transkrip audio video TikTok:\n${transcript}`,
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
