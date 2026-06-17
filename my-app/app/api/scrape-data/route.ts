import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 300;

const apifyClient = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

const SHOP_ACTOR_ID = "pro100chok/tiktok-shop-scraper";
const ORGANIC_ACTOR_ID = "scraptik/tiktok-api";

const SHOP_SEARCH_KEYWORD_LIMIT = 5;
const SHOP_MAX_ITEMS_PER_KEYWORD = 20;
const ORGANIC_KEYWORD_LIMIT = 5;
const ORGANIC_POSTS_PER_KEYWORD = 10;

const CACHE_FRESHNESS_HOURS = 24;

type ExpandedKeywords = {
  keywords?: string[];
  hashtags?: string[];
  search_terms?: string[];
};

export async function POST(request: NextRequest) {
  let sessionId: string | null = null;

  try {
    const body = await request.json();
    sessionId = typeof body.session_id === "string" ? body.session_id : null;

    if (!sessionId) {
      return NextResponse.json({ error: "session_id wajib diisi" }, { status: 400 });
    }

    const { data: currentSession, error: currentSessionError } = await supabaseAdmin
      .from("research_sessions")
      .select("expanded_keywords, keyword_normalized")
      .eq("id", sessionId)
      .single();

    if (currentSessionError || !currentSession) {
      throw new Error(currentSessionError?.message || "Session tidak ditemukan");
    }

    const cachedSessionId = currentSession.keyword_normalized
      ? await findFreshCachedSession(currentSession.keyword_normalized, sessionId)
      : null;

    if (cachedSessionId) {
      // Sesi baru ini cuma dipakai untuk simpan expanded_keywords, belum ada data scrape —
      // aman dihapus supaya tidak menumpuk sesi kosong di riwayat.
      await supabaseAdmin.from("research_sessions").delete().eq("id", sessionId);

      return NextResponse.json({
        session_id: cachedSessionId,
        cached: true,
      });
    }

    let keywords: string[] = Array.isArray(body.keywords) ? body.keywords : [];

    if (keywords.length === 0) {
      const expanded = (currentSession.expanded_keywords ?? {}) as ExpandedKeywords;
      keywords = expanded.keywords ?? [];

      if (keywords.length === 0) {
        throw new Error("Session belum punya expanded_keywords. Jalankan /api/expand-keywords dulu.");
      }
    }

    await supabaseAdmin
      .from("research_sessions")
      .update({ status: "scraping", last_scraped_at: new Date().toISOString() })
      .eq("id", sessionId);

    const shopKeywords = keywords.slice(0, SHOP_SEARCH_KEYWORD_LIMIT);
    const organicKeywords = keywords.slice(0, ORGANIC_KEYWORD_LIMIT);

    const [shopResult, organicResult] = await Promise.allSettled([
      scrapeShopProducts(shopKeywords),
      scrapeOrganicPosts(organicKeywords),
    ]);

    const warnings: string[] = [];
    let productsCount = 0;
    let creatorsCount = 0;
    let postsCount = 0;

    if (shopResult.status === "fulfilled") {
      productsCount = await saveProducts(sessionId, shopResult.value);
    } else {
      warnings.push(`TikTok Shop scraper gagal: ${describeError(shopResult.reason)}`);
    }

    if (organicResult.status === "fulfilled") {
      const counts = await saveOrganicData(sessionId, organicResult.value);
      creatorsCount = counts.creators;
      postsCount = counts.posts;
    } else {
      warnings.push(`TikTok organic scraper gagal: ${describeError(organicResult.reason)}`);
    }

    if (shopResult.status === "rejected" && organicResult.status === "rejected") {
      throw new Error(warnings.join(" | "));
    }

    return NextResponse.json({
      session_id: sessionId,
      products_count: productsCount,
      creators_count: creatorsCount,
      posts_count: postsCount,
      warnings,
    });
  } catch (err) {
    console.error("[/api/scrape-data]", err);

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

// ---- Cache: reuse session lain dengan keyword sama yang masih fresh ----

async function findFreshCachedSession(keywordNormalized: string, excludeSessionId: string) {
  const freshSince = new Date(Date.now() - CACHE_FRESHNESS_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("research_sessions")
    .select("id")
    .eq("keyword_normalized", keywordNormalized)
    .eq("status", "complete")
    .gte("last_scraped_at", freshSince)
    .neq("id", excludeSessionId)
    .order("last_scraped_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[/api/scrape-data] gagal cek cache:", error.message);
    return null;
  }

  return data?.id ?? null;
}

// ---- JALUR 1: TikTok Shop product scraping ----

type ShopProductCard = {
  type?: string;
  productId?: string;
  title?: string;
  productUrl?: string;
  currentPrice?: string;
  salesVolume?: number;
  rating?: number;
  sellerName?: string;
};

async function scrapeShopProducts(searchKeywords: string[]): Promise<ShopProductCard[]> {
  const run = await apifyClient.actor(SHOP_ACTOR_ID).call({
    scrapeType: "search",
    searchKeywords,
    maxItems: SHOP_MAX_ITEMS_PER_KEYWORD,
    sortBy: "best_sellers",
  });

  const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

  return (items as ShopProductCard[]).filter((item) => item.type === "product_card");
}

function parsePrice(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

async function saveProducts(sessionId: string, items: ShopProductCard[]) {
  if (items.length === 0) return 0;

  const rows = items.map((item) => {
    const price = item.currentPrice ? parsePrice(item.currentPrice) : null;
    const soldCount = typeof item.salesVolume === "number" ? item.salesVolume : null;

    return {
      session_id: sessionId,
      product_name: item.title ?? null,
      product_url: item.productUrl ?? null,
      price,
      sold_count: soldCount,
      gmv_estimate: price !== null && soldCount !== null ? price * soldCount : null,
      rating: typeof item.rating === "number" ? item.rating : null,
      commission_rate: null,
      seller_name: item.sellerName ?? null,
      category: null,
      raw_data: item,
    };
  });

  const { error } = await supabaseAdmin.from("products").insert(rows);
  if (error) throw new Error(`Gagal simpan products: ${error.message}`);

  return rows.length;
}

// ---- JALUR 2: Organic post + creator scraping ----

type AwemeAuthor = {
  unique_id?: string;
  nickname?: string;
  signature?: string;
  follower_count?: number;
  following_count?: number;
  total_favorited?: number;
  aweme_count?: number;
};

type AwemeInfo = {
  aweme_id?: string;
  desc?: string;
  create_time?: number;
  statistics?: {
    digg_count?: number;
    comment_count?: number;
    share_count?: number;
    play_count?: number;
  };
  text_extra?: { type?: number; hashtag_name?: string }[];
  author?: AwemeAuthor;
};

async function scrapeOrganicPosts(keywords: string[]): Promise<AwemeInfo[]> {
  const runs = await Promise.all(
    keywords.map((keyword) =>
      apifyClient.actor(ORGANIC_ACTOR_ID).call({
        searchPosts_keyword: keyword,
        searchPosts_count: ORGANIC_POSTS_PER_KEYWORD,
        searchPosts_region: "ID",
      })
    )
  );

  const datasets = await Promise.all(
    runs.map((run) => apifyClient.dataset(run.defaultDatasetId).listItems())
  );

  const awemeList: AwemeInfo[] = [];
  const seenIds = new Set<string>();

  for (const { items } of datasets) {
    for (const item of items as { search_item_list?: { aweme_info?: AwemeInfo }[] }[]) {
      for (const entry of item.search_item_list ?? []) {
        const aweme = entry.aweme_info;
        if (!aweme?.aweme_id || seenIds.has(aweme.aweme_id)) continue;
        seenIds.add(aweme.aweme_id);
        awemeList.push(aweme);
      }
    }
  }

  return awemeList;
}

async function saveOrganicData(sessionId: string, awemeList: AwemeInfo[]) {
  if (awemeList.length === 0) return { creators: 0, posts: 0 };

  const creatorsByUsername = new Map<string, AwemeAuthor>();
  for (const aweme of awemeList) {
    const author = aweme.author;
    if (author?.unique_id && !creatorsByUsername.has(author.unique_id)) {
      creatorsByUsername.set(author.unique_id, author);
    }
  }

  const creatorRows = Array.from(creatorsByUsername.entries()).map(([username, author]) => ({
    session_id: sessionId,
    username,
    display_name: author.nickname ?? null,
    follower_count: author.follower_count ?? null,
    following_count: author.following_count ?? null,
    total_likes: author.total_favorited ?? null,
    video_count: author.aweme_count ?? null,
    gmv_estimate: null,
    commission_rate: null,
    bio: author.signature ?? null,
    profile_url: `https://www.tiktok.com/@${username}`,
    raw_data: author,
  }));

  const { data: insertedCreators, error: creatorError } = await supabaseAdmin
    .from("creators")
    .insert(creatorRows)
    .select("id, username");

  if (creatorError) throw new Error(`Gagal simpan creators: ${creatorError.message}`);

  const creatorIdByUsername = new Map((insertedCreators ?? []).map((c) => [c.username, c.id]));

  const postRows = awemeList
    .filter((aweme) => aweme.author?.unique_id && creatorIdByUsername.has(aweme.author.unique_id))
    .map((aweme) => {
      const stats = aweme.statistics ?? {};
      const hashtags = (aweme.text_extra ?? [])
        .filter((t) => t.type === 1 && t.hashtag_name)
        .map((t) => `#${t.hashtag_name}`);

      return {
        session_id: sessionId,
        creator_id: creatorIdByUsername.get(aweme.author!.unique_id!),
        caption: aweme.desc ?? null,
        views: stats.play_count ?? null,
        likes: stats.digg_count ?? null,
        comments: stats.comment_count ?? null,
        shares: stats.share_count ?? null,
        hashtags,
        post_url: `https://www.tiktok.com/@${aweme.author!.unique_id}/video/${aweme.aweme_id}`,
        posted_at: aweme.create_time ? new Date(aweme.create_time * 1000).toISOString() : null,
        raw_data: aweme,
      };
    });

  const { error: postError } = await supabaseAdmin.from("posts").insert(postRows);
  if (postError) throw new Error(`Gagal simpan posts: ${postError.message}`);

  return { creators: creatorRows.length, posts: postRows.length };
}
