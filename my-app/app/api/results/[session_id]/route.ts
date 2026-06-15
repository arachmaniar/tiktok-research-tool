import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ session_id: string }> }
) {
  const { session_id } = await params;

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("research_sessions")
    .select("*")
    .eq("id", session_id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session tidak ditemukan" }, { status: 404 });
  }

  const [productsRes, creatorsRes, postsRes, analysisRes] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("*")
      .eq("session_id", session_id)
      .order("sold_count", { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from("creators")
      .select("*")
      .eq("session_id", session_id)
      .order("follower_count", { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from("posts")
      .select("*")
      .eq("session_id", session_id)
      .order("views", { ascending: false, nullsFirst: false }),
    supabaseAdmin.from("analysis_results").select("*").eq("session_id", session_id),
  ]);

  return NextResponse.json({
    session,
    products: productsRes.data ?? [],
    creators: creatorsRes.data ?? [],
    posts: postsRes.data ?? [],
    analysis_results: analysisRes.data ?? [],
  });
}
