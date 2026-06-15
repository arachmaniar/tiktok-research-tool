# PROJECT BRIEF: TikTok Competitor Research & Content Psychology Platform

## Apa yang Dibangun
Platform riset kompetitor TikTok yang menggabungkan data kuantitatif (Engagement Score, sold count, komisi) dengan analisis psikologi konten (hook pattern, framework copywriting, conversion keywords).

> **Catatan pasar Indonesia:** data GMV TikTok Shop seringkali tidak tersedia/tidak lengkap untuk akun Indonesia. Metrik utama untuk ranking di seluruh dashboard adalah **Engagement Score** (lihat bagian "METRIK UTAMA" di bawah), bukan GMV. Kolom `gmv_estimate` tetap ada di schema untuk kompatibilitas data masa depan, tapi TIDAK ditampilkan di frontend MVP ini.

**Positioning:** "Fastmoss kasih angka. Kita kasih alasan di balik angka itu."

## Tech Stack
- **Framework:** Next.js (App Router)
- **Database:** Supabase
- **AI:** Claude API (claude-sonnet-4-6)
- **Data Source TikTok Shop:** Apify Actor — `pro100chok/tiktok-shop-scraper` (GMV, produk, komisi, creator)
- **Data Source Organic:** Apify Actor — `scraptik/tiktok-api` (caption, hashtag, profile, engagement)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel (nanti)

## Environment Variables yang Dibutuhkan (.env.local)
```
ANTHROPIC_API_KEY=
APIFY_API_TOKEN=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## ARCHITECTURE FLOW

```
[User Input: Niche Keyword]
        ↓
[API Route: /api/expand-keywords]
Next.js → Claude API
Generate keyword + hashtag variations
        ↓
[API Route: /api/scrape-data]
Next.js → Apify Actors (parallel)

  JALUR 1: TikTok Shop Actor        JALUR 2: Organic TikTok Actor
  - Product + GMV data               - Caption + hashtag
  - Komisi affiliator                - Creator profile
  - Top seller/creator               - Engagement data
  - Category ranking                 - Video performance

        ↓
[API Route: /api/analyze]
Split data → Angka + Teks

  Angka → Kalkulasi di Next.js       Teks → Claude API
  - Engagement Score (creator,        - Hook pattern analysis
    agregat dari posts)               - Psychological trigger (Cialdini)
  - Sold count ranking (produk)       - Framework detector (AIDA/PAS/BAB)
  - Sold count ranking (kategori)     - Conversion keywords
  - Komisi ranking                    - Summary top 10

        ↓
[Supabase: Simpan hasil per research session]
        ↓
[Dashboard: 3 Tab]
  Tab 1: Product Analysis
  Tab 2: Creator Analysis (list → deep dive per account)
  Tab 3: Category Ranking
```

---

## METRIK UTAMA: Engagement Score

**Formula (per post):**
```
Engagement Score = views + (likes × 2) + (comments × 3) + (shares × 4)
```

- **Tab 2 Creator Analysis** — rank creator by total Engagement Score (agregat dari post yang dianalisis per creator, via `posts.creator_id`).
- **Tab 1 Product Analysis** — produk tidak punya data engagement (tidak ada relasi ke `posts`), jadi rank by `sold_count` ("Terjual").
- **Tab 3 Category Ranking** — rank kategori by total `sold_count` ("Total Terjual") per kategori, diagregat dari `products.category`.
- **Dashboard** — tampilkan "Total Engagement Score (Session)" sebagai stat card agregat dari semua post di session (di luar tab, selalu visible saat status complete).

---

## DATABASE SCHEMA (Supabase)

### Table: research_sessions
```sql
CREATE TABLE research_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL,
  expanded_keywords JSONB,
  status TEXT DEFAULT 'pending', -- pending, scraping, analyzing, complete, error
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Table: products
```sql
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES research_sessions(id),
  product_name TEXT,
  product_url TEXT,
  price NUMERIC,
  sold_count INTEGER,
  gmv_estimate NUMERIC, -- retained untuk kompatibilitas masa depan, TIDAK ditampilkan di frontend MVP
  rating NUMERIC,
  commission_rate NUMERIC,
  seller_name TEXT,
  category TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Table: creators
```sql
CREATE TABLE creators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES research_sessions(id),
  username TEXT,
  display_name TEXT,
  follower_count INTEGER,
  following_count INTEGER,
  total_likes INTEGER,
  video_count INTEGER,
  gmv_estimate NUMERIC, -- retained untuk kompatibilitas masa depan, TIDAK ditampilkan di frontend MVP
  commission_rate NUMERIC,
  bio TEXT,
  profile_url TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Table: posts
```sql
CREATE TABLE posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES research_sessions(id),
  creator_id UUID REFERENCES creators(id),
  caption TEXT,
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  hashtags TEXT[],
  post_url TEXT,
  posted_at TIMESTAMPTZ,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Table: analysis_results
```sql
CREATE TABLE analysis_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES research_sessions(id),
  analysis_type TEXT, -- 'product_quant', 'creator_quant', 'creator_qual', 'category_ranking', 'niche_summary'
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## API ROUTES

### 1. POST /api/expand-keywords
**Input:** `{ keyword: "serum ketiak" }`
**Process:** Claude API expand keyword
**Claude System Prompt:**
```
Kamu adalah market research assistant. Dari keyword produk yang diberikan, generate variasi untuk riset TikTok.

Return HANYA JSON tanpa markdown:
{
  "keywords": ["variasi keyword bahasa Indonesia, Inggris, slang"],
  "hashtags": ["#hashtag yang kemungkinan dipakai di TikTok"],
  "search_terms": ["istilah pencarian yang dipakai konsumen"]
}

Generate minimal 10 keywords, 15 hashtags, 5 search terms.
Fokus pasar Indonesia.
```
**Output:** JSON keyword + hashtag variations

### 2. POST /api/scrape-data
**Input:** `{ session_id, keywords, hashtags }`
**Process:** Hit Apify Actors parallel
**Output:** Raw product data + creator data + post data → simpan ke Supabase

### 3. POST /api/analyze
**Input:** `{ session_id }`
**Process:** Ambil data dari Supabase → split angka/teks → analisis

**Claude System Prompt untuk Analisis Kualitatif:**
```
Kamu adalah content psychology analyst. Analisis konten TikTok berikut menggunakan framework akademis:

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
}
```

**Claude System Prompt untuk Summary Top 10:**
```
Kamu adalah content strategy analyst. Dari analisis 10 creator teratas di niche ini, buat summary pattern yang ditemukan.

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
}
```

**Output:** Simpan ke analysis_results

### 4. GET /api/results/[session_id]
**Output:** Semua data + analisis untuk ditampilkan di dashboard

---

## PAGES

### / (Homepage)
- Input field keyword
- Tombol "Analyze"
- List research sessions sebelumnya

### /results/[session_id] (Dashboard)
- Status progress (scraping → analyzing → complete)
- 3 Tab:

**Tab 1: Product Analysis**
- Table: ranking produk by `sold_count` ("Terjual")
- Kolom: nama produk, harga, sold count, komisi, rating
- Per produk: badge analisis kualitatif (claim produk, angle marketing)
- GMV/market share TIDAK ditampilkan (lihat "METRIK UTAMA")

**Tab 2: Creator Analysis**
- Table: top 10 creator by Engagement Score
- Kolom: username, followers, Engagement Score, komisi, engagement rate
- Klik username → modal/page deep dive:
  - 30 post terakhir dianalisis
  - Hook pattern chart
  - Framework breakdown
  - Conversion keywords cloud
- **Summary Panel:** pattern dominan dari top 10 (selalu visible di atas table)

**Tab 3: Category Ranking**
- Top selling product categories (by total `sold_count` / "Total Terjual")
- Top performing creator per category — **TBD, ditunda ke versi berikutnya** (butuh relasi creator↔category, menunggu data organic scraper yang lebih lengkap)
- Filter by komisi range

---

## DEVELOPMENT SEQUENCE

### Session 1 (2 jam) — Data Pipeline
```
Step 1: npx create-next-app, install dependencies, setup env
Step 2: Setup Supabase tables (jalankan SQL schema di atas)
Step 3: Buat page / dengan input form
Step 4: Buat /api/expand-keywords — integrasi Claude API
Step 5: Buat /api/scrape-data — integrasi Apify actors
Step 6: Buat /api/results/[session_id] — return raw data
Step 7: Tampilkan raw data di /results/[session_id]
```

### Session 2 (2 jam) — Analysis + Dashboard
```
Step 8: Buat /api/analyze — Claude analisis kualitatif
Step 9: Buat Tab 1 Product Analysis dengan table + ranking
Step 10: Buat Tab 2 Creator Analysis dengan table + summary panel
Step 11: Buat Tab 3 Category Ranking
Step 12: Buat creator deep dive (modal atau sub-page)
Step 13: Testing dengan 2-3 keyword berbeda
```

---

## DEPENDENCIES
```json
{
  "dependencies": {
    "next": "latest",
    "@supabase/supabase-js": "latest",
    "@anthropic-ai/sdk": "latest",
    "apify-client": "latest",
    "recharts": "latest"
  }
}
```

---

## NOTES
- Semua API calls ke Apify dan Claude harus di server-side (API routes), BUKAN di client
- Loading state penting — scraping + analisis bisa 5-15 menit, user harus tau progress
- Simpan raw_data JSONB di setiap table untuk debugging
- Error handling: kalau Apify gagal, tampilkan pesan yang jelas
- Untuk MVP ini BELUM perlu auth — itu fase 2
