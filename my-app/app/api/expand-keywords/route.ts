import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Kamu adalah market research assistant. Dari keyword produk yang diberikan, generate variasi untuk riset TikTok.

Return HANYA JSON tanpa markdown:
{
  "keywords": ["variasi keyword bahasa Indonesia, Inggris, slang"],
  "hashtags": ["#hashtag yang kemungkinan dipakai di TikTok"],
  "search_terms": ["istilah pencarian yang dipakai konsumen"]
}

Generate minimal 10 keywords, 15 hashtags, 5 search terms.
Fokus pasar Indonesia.`;

function parseClaudeJson(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  return JSON.parse(cleaned);
}

export async function POST(request: NextRequest) {
  let sessionId: string | null = null;

  try {
    const body = await request.json();
    const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";

    if (!keyword) {
      return NextResponse.json({ error: "Keyword wajib diisi" }, { status: 400 });
    }

    const { data: session, error: insertError } = await supabaseAdmin
      .from("research_sessions")
      .insert({ keyword, status: "pending" })
      .select("id")
      .single();

    if (insertError || !session) {
      throw new Error(insertError?.message || "Gagal membuat research session");
    }

    sessionId = session.id;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Keyword produk: ${keyword}` }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude tidak mengembalikan respons teks");
    }

    const expandedKeywords = parseClaudeJson(textBlock.text);

    const { error: updateError } = await supabaseAdmin
      .from("research_sessions")
      .update({ expanded_keywords: expandedKeywords })
      .eq("id", sessionId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ session_id: sessionId, expanded_keywords: expandedKeywords });
  } catch (err) {
    console.error("[/api/expand-keywords]", err);

    if (sessionId) {
      await supabaseAdmin.from("research_sessions").update({ status: "error" }).eq("id", sessionId);
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Terjadi kesalahan" },
      { status: 500 }
    );
  }
}
