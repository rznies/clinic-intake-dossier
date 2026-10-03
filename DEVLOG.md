# Development Log (DEVLOG.md)

This log records real operational engineering events encountered while building the **Clinic Intake Dossier** system for OneHeroAI.

---

### 1. Firecrawl Starter/Free Tier Sliding-Window Rate Limit
* **Event:** When scraping 12 prioritized pages in batches of 3, the final pages consistently hit HTTP 429:
  `"Rate limit exceeded. Consumed (req/min): 12, Remaining (req/min): 0. Upgrade your plan or please retry after 53s"`.
* **Impact:** 2 of 12 pages timed out or failed in early pipeline test runs.
* **Resolution:**
  - Built an automatic backoff and single-retry mechanism in `src/scraper/fetcher.ts` respecting `retry-after` header timestamps.
  - Added a shared `lastWaitUntil` cooldown timestamp so concurrent requests in the same chunk do not trigger redundant 35-second stacked sleep timers.
  - Succeeded in scraping all 12 pages on Apex Dermatology after a single 29s cooldown retry, preserving partial results gracefully with visible warnings if any page fails.

---

### 2. URL Deduplication & Sitemap Noise Bug
* **Event:** Firecrawl's `/map` endpoint returned both `http://` and `https://` variants for identical paths (e.g. `http://.../pediatric-dentistry` vs `https://.../pediatric-dentistry`), as well as non-content URLs (XML feeds, author archives, pagination).
* **Impact:** Redundant pages were being selected, burning precious scraping credits on non-content URLs.
* **Resolution:**
  - Implemented `normalizeUrl()` in `src/scraper/mapper.ts` stripping protocol variations, `www`, trailing slashes, fragments, and queries.
  - Added filtering against non-content extensions (`.xml`, `.pdf`, `wp-json`, feeds, category tags).
  - Prioritized team, doctor, about, services, and contact URLs in priority scoring.

---

### 3. Gemini Structured Output Schema & 400 OpenAPI Subset Error
* **Event:** When passing Zod schemas converted with standard `zodToJsonSchema` to Gemini 3.8 Flash, the API returned:
  `ApiError: 400 Request contains an invalid argument (INVALID_ARGUMENT)`.
* **Root Cause:**
  - Gemini's constrained decoding OpenAPI 3.0 engine strictly rejects:
    1. `$schema`, `default`, `additionalProperties`, and `not`.
    2. `minItems` and `maxItems` on arrays.
    3. Unbounded `z.record(z.string(), z.string())` (which converts to `{ type: "object" }` without `properties`, causing Gemini to either reject or loop infinitely generating hundreds of thousands of characters).
* **Resolution:**
  - Built `toGeminiOpenApiSchema()` in `src/engine/gemini.ts` to strip unsupported OpenAPI properties (`minItems`, `maxItems`, `additionalProperties`, etc.).
  - Replaced open-ended dynamic records with explicit daytime fields (`HoursValueSchema` with `monday`, `tuesday`, ..., `notes`).
  - Added strict string descriptions (`under 30 words`) and bounded schema fields, reducing extraction latency from 4+ minutes down to 8 seconds and token consumption to under 30,000 tokens.

---

### 4. Deterministic Code Verifier Grounding
* **Event:** LLMs frequently produce plausible-sounding summaries that subtly drift from source text or hallucinate phone numbers or doctor credentials.
* **Architecture:**
  - The LLM extracts candidate fields; pure TypeScript code verifies them.
  - Every `FOUND` field must supply an `evidence_quote` under 25 words that is a strict verbatim substring of that field's OWN `source_url` page.
  - Every phone number and email in the field value must appear in that quote, else the verifier downgrades the field to `INFERRED` with clear recorded reasons (`quote_not_in_page`, `value_token_not_in_quote`).

---

### 5. Firecrawl Alexandria Review
* **Status:** Alexandria catalog description reviewed only. No execution calls were made against Alexandria provider endpoints.

---

### 6. Scope Freeze & Deployment
* **Event:** Applied scope freeze to focus strictly on a working, code-verified, deployed static result.
* **Delivered:**
  - Clean TypeScript CLI pipeline (`src/cli.ts`)
  - Substring quote verifier (`src/engine/verifier.ts`)
  - Gap evaluation engine (`src/engine/gap-engine.ts`)
  - Standalone responsive HTML renderer (`src/render/html.ts`)
  - RFC 4180 CSV task generator (`src/render/csv.ts`)
  - 2 verified real clinic sample dossiers (`Grandview Dental Care` and `Apex Dermatology`)
  - Deployed static portal on GitHub Pages: `https://rznies.github.io/clinic-intake-dossier/`
