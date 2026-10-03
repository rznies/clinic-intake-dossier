# Development Log (DEVLOG.md)

This log records real operational engineering events encountered while building the **Clinic Intake Dossier** system for OneHeroAI.

---

### 1. Firecrawl Sliding-Window Rate Limit & Fix
* **Event:** In initial batch scrapes of 12 pages, requests consistently hit HTTP 429:
  `"Rate limit exceeded. Consumed (req/min): 12, Remaining (req/min): 0. Upgrade your plan or please retry after 53s"`.
* **Fix:**
  - Implemented strictly serialized page requests with 5.5s spacing between each fetch in `src/scraper/fetcher.ts`.
  - Added dynamic reset delay parsing respecting `retry-after` header timestamps.
* **Result:** Achieved 12/12 pages scraped with 0 retries and zero lost pages across both clinic targets.

---

### 2. Gemini OpenAPI Schema 400 & Fix
* **Event:** Passing Zod schemas converted with default `zodToJsonSchema` produced:
  `ApiError: 400 Request contains an invalid argument (INVALID_ARGUMENT)`.
* **Root Cause:** Gemini constrained decoding rejects OpenAPI 3.0 keywords `$schema`, `default`, `additionalProperties`, `not`, `minItems`, `maxItems`, and unbounded record dictionaries (`{ type: "object" }` without defined properties).
* **Fix:**
  - Built `toGeminiOpenApiSchema()` in `src/engine/gemini.ts` to recursively prune unsupported schema keys.
  - Replaced open-ended records with explicit daytime fields (`HoursValueSchema`).
  - Added `thinkingConfig: { thinkingBudget: 0 }` to prevent reasoning monologue tokens from leaking into structured scalar strings.

---

### 3. Whitespace & Syntax False Positives Fixed (5 &rarr; 3 and 5 &rarr; 4)
* **Event:** Raw string comparison resulted in 5 verifier downgrades on Grandview Dental Care and 5 on Apex Dermatology because verbatim quotes contained subtle markdown symbols (`**`, `[link](url)`), uncollapsed spaces, or punctuation shifts.
* **Fix:**
  - Upgraded `normalizeText()` in `src/engine/verifier.ts`: unicode normalization (`NFKD`), HTML tag stripping, markdown link/syntax removal (`[*#>|`~_]`), lowercasing, and collapsing all whitespace and punctuation to single spaces.
  - Allowed `evidence_quotes` array (1 to 3 short quotes per field) anchored to that field's own `source_url` page.
* **Result:** Downgrades dropped from 5 to 3 on Grandview Dental Care, and 5 to 4 on Apex Dermatology.

---

### 4. Value-Token Extraction & Vanity Phone Catch
* **Event 1 (False Positive):** Verifier ran phone regex on `JSON.stringify(field.value)`, erroneously extracting UUID digits from booking URLs (`0485234336`) and timestamp digits from image filenames (`17086366474`) as missing phone numbers.
  - **Fix:** Restructured value-token checks in `src/engine/verifier.ts` to inspect explicit `phone` and `email` properties only, completely ignoring URL and image strings.
* **Event 2 (Real Vanity Phone Catch):** On Apex Dermatology, the clinic site displays `"Call Now: 833-279-SKIN"`. Gemini converted the vanity letters to numeric digits `833-279-7546` in `phone`. The verifier compared digits only, identified that digits `7546` were absent from the quoted evidence digits (`833279`), and categorized the downgrade as `phone_digits_derived`.

---

### 5. Categorization of Remaining Downgrades (Unconfirmed)
All remaining downgrades are labeled under objective mechanical categories: `quote_not_found`, `phone_digits_derived`, and `value_token_missing`. Subjective labels (`real_fabrication` and `formatting`) have been removed; all downgrades remain unconfirmed until manual audit in `ACCURACY.md`.

#### Grandview Dental Care (3 Unconfirmed Downgrades)
| Field | Status Change | Category | Normalized Quote | Nearest Snippet on Page |
| :--- | :--- | :--- | :--- | :--- |
| **specialty** | FOUND &rarr; INFERRED | `quote_not_found` | `general dentistry or preventive care encompas` | [No matching text found on page] |
| **contact_booking_channels** | FOUND &rarr; INFERRED | `quote_not_found` | `https book modento io c 7eda0e0485234336aa817` | [No matching text found on page] |
| **existing_media_assets** | FOUND &rarr; INFERRED | `quote_not_found` | `dr abraham hoellrich grandview dental care co` | [No matching text found on page] |

#### Apex Dermatology (4 Unconfirmed Downgrades)
| Field | Status Change | Category | Normalized Quote | Nearest Snippet on Page |
| :--- | :--- | :--- | :--- | :--- |
| **specialty** | FOUND &rarr; INFERRED | `quote_not_found` | `dermatology aesthetic skin care services` | [anchor: "dermatology"] ...ment opportunities provider recruitment dermatology s |
| **contact_booking_channels** | FOUND &rarr; INFERRED | `phone_digits_derived` | `call now 833 279 skin same day dermatology ap` | Phone digits 8332797546 missing from quotes digits [833279 ] |
| **social_links** | FOUND &rarr; INFERRED | `quote_not_found` | `https www facebook com apex dermatology 23680` | [No matching text found on page] |
| **existing_media_assets** | FOUND &rarr; INFERRED | `quote_not_found` | `https www apexskin com wp content uploads 202` | [No matching text found on page] |

---

### 6. Alexandria Provider Review
* **Status:** Alexandria catalog description reviewed only. No execution calls were made against Alexandria provider endpoints.


### Verifier Downgrade Audit: https://grandviewdentalcare.com (2026-10-03T10:01:09.500Z)
Total downgrades: 1 (quote_not_found: 1, phone_digits_derived: 0, value_token_missing: 0) - unconfirmed until manual check

| Field | Status Change | Category | Normalized Quote | Nearest Snippet on Page |
| :--- | :--- | :--- | :--- | :--- |
| **existing_media_assets** | FOUND &rarr; INFERRED | `quote_not_found` | `dr abraham hoellrich grandview dental care co` | [No matching text found on page] |


### Verifier Downgrade Audit: https://apexskin.com (2026-10-03T10:05:35.255Z)
Total downgrades: 4 (quote_not_found: 3, phone_digits_derived: 1, value_token_missing: 0) - unconfirmed until manual check

| Field | Status Change | Category | Normalized Quote | Nearest Snippet on Page |
| :--- | :--- | :--- | :--- | :--- |
| **doctor_name_and_qualifications** | FOUND &rarr; INFERRED | `quote_not_found` | `kyle kelly pa c` | [No matching text found on page] |
| **contact_booking_channels** | FOUND &rarr; INFERRED | `phone_digits_derived` | `for general questions or help to schedule a d` | Phone digits 8332797546 missing from quotes digits [833279 ] |
| **social_links** | FOUND &rarr; INFERRED | `quote_not_found` | `https www facebook com apex dermatology 23680` | [No matching text found on page] |
| **existing_media_assets** | FOUND &rarr; INFERRED | `quote_not_found` | `https www apexskin com wp content uploads 202` | [No matching text found on page] |
