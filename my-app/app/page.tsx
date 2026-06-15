import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import SearchForm from "./components/SearchForm";
import StatusBadge from "./components/StatusBadge";

export default async function Home() {
  const { data: sessions } = await supabaseAdmin
    .from("research_sessions")
    .select("id, keyword, status, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex max-w-3xl flex-col px-6 py-16">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            TikTok Competitor Research
          </h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            Fastmoss kasih angka. Kita kasih alasan di balik angka itu.
          </p>
        </div>

        <SearchForm />

        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">Riset Sebelumnya</h2>
          {!sessions || sessions.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Belum ada riset. Masukkan keyword di atas untuk mulai.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {sessions.map((session) => (
                <li key={session.id}>
                  <Link
                    href={`/results/${session.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    <div>
                      <p className="font-medium">{session.keyword}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(session.created_at).toLocaleString("id-ID")}
                      </p>
                    </div>
                    <StatusBadge status={session.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
