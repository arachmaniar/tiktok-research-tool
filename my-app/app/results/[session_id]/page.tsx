import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import StatusBadge from "@/app/components/StatusBadge";
import ScrapeTrigger from "@/app/components/ScrapeTrigger";

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
  gmv_estimate: number | null;
  rating: number | null;
  seller_name: string | null;
};

type Creator = {
  id: string;
  username: string | null;
  display_name: string | null;
  follower_count: number | null;
  following_count: number | null;
  total_likes: number | null;
  video_count: number | null;
  profile_url: string | null;
};

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
  creators: { username: string | null; display_name: string | null } | null;
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ session_id: string }>;
}) {
  const { session_id } = await params;

  const { data: session } = await supabaseAdmin
    .from("research_sessions")
    .select("*")
    .eq("id", session_id)
    .single();

  if (!session) {
    notFound();
  }

  const [{ data: products }, { data: creators }, { data: posts }] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("id, product_name, product_url, price, sold_count, gmv_estimate, rating, seller_name")
      .eq("session_id", session_id)
      .order("sold_count", { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from("creators")
      .select("id, username, display_name, follower_count, following_count, total_likes, video_count, profile_url")
      .eq("session_id", session_id)
      .order("follower_count", { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from("posts")
      .select(
        "id, caption, views, likes, comments, shares, hashtags, post_url, posted_at, creators(username, display_name)"
      )
      .eq("session_id", session_id)
      .order("views", { ascending: false, nullsFirst: false }),
  ]);

  const expanded = (session.expanded_keywords ?? {}) as ExpandedKeywords;
  const hasExpandedKeywords =
    (expanded.keywords?.length ?? 0) > 0 ||
    (expanded.hashtags?.length ?? 0) > 0 ||
    (expanded.search_terms?.length ?? 0) > 0;

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

        {session.status === "pending" ? (
          <ScrapeTrigger sessionId={session.id} />
        ) : (
          <>
            {session.status === "error" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                Terjadi error saat memproses riset ini.
              </div>
            )}

            <ProductsSection products={products ?? []} />
            <CreatorsSection creators={creators ?? []} />
            <PostsSection posts={(posts ?? []) as unknown as Post[]} />
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

function ProductsSection({ products }: { products: Product[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-semibold">Produk ({products.length})</h2>
      {products.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Belum ada data produk.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-4">Produk</th>
                <th className="py-2 pr-4">Harga</th>
                <th className="py-2 pr-4">Terjual</th>
                <th className="py-2 pr-4">Est. GMV</th>
                <th className="py-2 pr-4">Rating</th>
                <th className="py-2 pr-4">Seller</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="max-w-xs truncate py-2 pr-4">
                    {p.product_url ? (
                      <a href={p.product_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {p.product_name}
                      </a>
                    ) : (
                      p.product_name
                    )}
                  </td>
                  <td className="py-2 pr-4">{p.price != null ? `$${Number(p.price).toFixed(2)}` : "-"}</td>
                  <td className="py-2 pr-4">
                    {p.sold_count != null ? Number(p.sold_count).toLocaleString("id-ID") : "-"}
                  </td>
                  <td className="py-2 pr-4">
                    {p.gmv_estimate != null ? `$${Number(p.gmv_estimate).toLocaleString("id-ID")}` : "-"}
                  </td>
                  <td className="py-2 pr-4">{p.rating ?? "-"}</td>
                  <td className="py-2 pr-4">{p.seller_name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CreatorsSection({ creators }: { creators: Creator[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-semibold">Creator ({creators.length})</h2>
      {creators.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Belum ada data creator.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Nama</th>
                <th className="py-2 pr-4">Followers</th>
                <th className="py-2 pr-4">Following</th>
                <th className="py-2 pr-4">Total Likes</th>
                <th className="py-2 pr-4">Video</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {creators.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4">
                    {c.profile_url ? (
                      <a href={c.profile_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        @{c.username}
                      </a>
                    ) : (
                      `@${c.username}`
                    )}
                  </td>
                  <td className="py-2 pr-4">{c.display_name ?? "-"}</td>
                  <td className="py-2 pr-4">
                    {c.follower_count != null ? Number(c.follower_count).toLocaleString("id-ID") : "-"}
                  </td>
                  <td className="py-2 pr-4">
                    {c.following_count != null ? Number(c.following_count).toLocaleString("id-ID") : "-"}
                  </td>
                  <td className="py-2 pr-4">
                    {c.total_likes != null ? Number(c.total_likes).toLocaleString("id-ID") : "-"}
                  </td>
                  <td className="py-2 pr-4">{c.video_count ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PostsSection({ posts }: { posts: Post[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-lg font-semibold">Post ({posts.length})</h2>
      {posts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Belum ada data post.</p>
      ) : (
        <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
          {posts.map((post) => (
            <div key={post.id} className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between gap-2">
                <a
                  href={post.post_url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline"
                >
                  @{post.creators?.username ?? "unknown"}
                </a>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {post.posted_at ? new Date(post.posted_at).toLocaleDateString("id-ID") : "-"}
                </span>
              </div>
              {post.caption && <p className="text-sm text-zinc-700 dark:text-zinc-300">{post.caption}</p>}
              {post.hashtags && post.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {post.hashtags.map((tag) => (
                    <span key={tag} className="text-xs text-blue-600 dark:text-blue-400">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                <span>Views: {post.views != null ? Number(post.views).toLocaleString("id-ID") : "-"}</span>
                <span>Likes: {post.likes != null ? Number(post.likes).toLocaleString("id-ID") : "-"}</span>
                <span>Komentar: {post.comments != null ? Number(post.comments).toLocaleString("id-ID") : "-"}</span>
                <span>Share: {post.shares != null ? Number(post.shares).toLocaleString("id-ID") : "-"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
