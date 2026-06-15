// Heuristic claim/angle marketing badges derived from product name —
// no Claude call, just pattern matching on text the scraper already gives us.
const CLAIM_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "BPOM", pattern: /bpom/i },
  { label: "Original", pattern: /\b(original|ori)\b/i },
  { label: "Best Seller", pattern: /best ?seller|terlaris/i },
  { label: "Promo/Diskon", pattern: /promo|diskon|murah|hemat/i },
  { label: "Halal", pattern: /halal/i },
  { label: "Garansi", pattern: /garansi|guarantee/i },
  { label: "COD", pattern: /\bcod\b/i },
  { label: "Viral", pattern: /viral|trending/i },
  { label: "Bundle/Paket", pattern: /bundle|paket|\bset\b/i },
  { label: "Natural/Herbal", pattern: /natural|herbal|organic|alami/i },
];

export function detectProductBadges(productName: string | null): string[] {
  if (!productName) return [];
  return CLAIM_PATTERNS.filter(({ pattern }) => pattern.test(productName)).map((p) => p.label);
}
