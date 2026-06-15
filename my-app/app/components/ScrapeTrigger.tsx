"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function ScrapeTrigger({ sessionId }: { sessionId: string }) {
  const [error, setError] = useState<string | null>(null);
  const triggered = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    (async () => {
      try {
        const res = await fetch("/api/scrape-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Gagal mengambil data dari TikTok");
        }

        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      }
    })();
  }, [sessionId, router]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white" />
      <p className="text-sm font-medium">Mengambil data dari TikTok...</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Proses ini bisa memakan waktu beberapa menit. Jangan tutup halaman ini.
      </p>
    </div>
  );
}
