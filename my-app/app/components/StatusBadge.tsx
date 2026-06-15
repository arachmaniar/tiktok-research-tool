const STATUS_STYLES: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  scraping: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  analyzing: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  complete: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;

  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium capitalize ${style}`}>
      {status}
    </span>
  );
}
