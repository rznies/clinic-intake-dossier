# Clinic Intake Dossier

> **A working operational demo built for the Founder's Office application at OneHeroAI.**
>
> 🌐 **Live Deployed Showcase:** [https://rznies.github.io/clinic-intake-dossier/](https://rznies.github.io/clinic-intake-dossier/)

---

## 1. Context & Operational Purpose

**OneHeroAI** sells managed AI twin services to doctors:
1. Weekly patient-education video twins
2. Clinic receptionist voice twins for inbound phone triage
3. Video twins answering patient clinical FAQs

Onboarding a doctor has traditionally been slow because critical inputs are scattered across clinic websites, social pages, and intake forms. When coordinators jump into kickoff calls unprepared, production is delayed by weeks.

**This tool takes a single clinic website URL and transforms it into:**
1. A structured clinical intake dossier with strict status labels (`FOUND`, `INFERRED`, `MISSING`).
2. Code-checked verbatim quote substrings anchored to their source pages.
3. An operational gap checklist identifying blocking assets for Video and Voice twins.
4. Pre-drafted WhatsApp messages for immediate human coordinator review.
5. An RFC 4180-compliant `tasks.csv` ready to import into ClickUp, Linear, or Notion.
6. 5 conservative educational reel hook concepts with `needs_clinical_review: true`.

---

## 2. Core Architectural Principle

> ### **"The LLM extracts; code verifies and decides what is missing."**

- **Untrusted Web Shielding:** All scraped markdown is treated as untrusted data. System prompts reject injection instructions found inside page text.
- **Strict Verbatim Code Verifier (`src/engine/verifier.ts`):**
  - An LLM cannot be trusted to self-certify whether it hallucinated.
  - Pure deterministic TypeScript code checks that every field marked `FOUND` has an `evidence_quote` under 25 words that is a literal substring of that field's OWN `source_url` page.
  - Any phone number or email in the field value must appear inside the quote; otherwise, code automatically downgrades the status to `INFERRED`.
- **Gap & Action Engine (`src/engine/gap-engine.ts`):**
  - Compares the extracted dossier against onboarding requirements (`requirements.config.json`).
  - Evaluates blockers (headshot, booking channel, clinical approval contact, audio setup, logo).
  - Calculates business-day due dates (`+2 working days`) and outputs the canonical status header:
    ```
    "X of 13 found, Y inferred, Z missing, D verifier downgrades, FAQ gaps: G, B blockers, W drafts ready. Ready for strategy: [true|false] - reason"
    ```

---

## 3. Tech Stack

- **Runtime:** Node.js + TypeScript (`tsx`)
- **Scraping & Discovery:** Firecrawl JS SDK (`firecrawl` v4.42.4) — URL mapping with scoring heuristics, content-aware filtering, deduplication, and sliding-window rate limit backoff.
- **LLM Synthesis:** Gemini 3.8 Flash via `@google/genai` (`temperature: 0.1`) with Zod schemas converted to strict OpenAPI 3.0 via `toGeminiOpenApiSchema()`.
- **Validation:** Zod schema parsing and type guarantees.
- **Renderers:** Standalone single-page responsive HTML (`src/render/html.ts`) and RFC 4180 CSV (`src/render/csv.ts`). Zero external CDN or database dependencies.

---

## 4. Real Clinic Samples

Both samples were generated from live clinic websites:

| Clinic | Specialty | Status Header | Live Links |
| :--- | :--- | :--- | :--- |
| **Grandview Dental Care** | General & Sedation Dentistry | `5 of 13 found, 6 inferred, 2 missing, 5 verifier downgrades, FAQ gaps: 5, 2 blockers, 2 drafts ready. Ready for strategy: false (Pending 2 onboarding items)` | [Interactive HTML](https://rznies.github.io/clinic-intake-dossier/samples/grandview-dental/dossier.html) &bull; [JSON](https://rznies.github.io/clinic-intake-dossier/samples/grandview-dental/dossier.json) &bull; [tasks.csv](https://rznies.github.io/clinic-intake-dossier/samples/grandview-dental/tasks.csv) |
| **Apex Dermatology** | Medical & Cosmetic Dermatology | `3 of 13 found, 6 inferred, 4 missing, 5 verifier downgrades, FAQ gaps: 5, 2 blockers, 2 drafts ready. Ready for strategy: false (Pending 2 onboarding items)` | [Interactive HTML](https://rznies.github.io/clinic-intake-dossier/samples/apex-skin/dossier.html) &bull; [JSON](https://rznies.github.io/clinic-intake-dossier/samples/apex-skin/dossier.json) &bull; [tasks.csv](https://rznies.github.io/clinic-intake-dossier/samples/apex-skin/tasks.csv) |

---

## 5. Quickstart & CLI Usage

### Prerequisites
- Node.js 18+
- `FIRECRAWL_API_KEY`
- `GEMINI_API_KEY`

### Setup
```bash
git clone https://github.com/rznies/clinic-intake-dossier.git
cd clinic-intake-dossier
npm install
```

Create a `.env` file:
```env
FIRECRAWL_API_KEY=your_firecrawl_key
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.8-flash
```

### Run Pipeline on Any Clinic URL
```bash
npx tsx src/cli.ts https://grandviewdentalcare.com --output output/grandview
```

### Outputs Generated
```
output/grandview/
├── dossier.html     # Interactive responsive visual intake report with 1-click WhatsApp copy buttons
├── dossier.json     # Complete structured JSON with run metadata and grounded evidence quotes
└── tasks.csv        # RFC 4180 tracker tasks ready for project management tools
```

---

## 6. 90-Second Walkthrough Video Script

*(Designed for a Founder's Office application screen recording)*

* **[0:00 - 0:15] The Bottleneck:**
  > *"When OneHeroAI onboards a clinic for their AI twin, the biggest drag on time-to-value isn't model training—it's scattered inputs. The coordinator spends 45 minutes manually combing a site, misses crucial gaps, and the kickoff call turns into basic fact-finding."*
* **[0:15 - 0:35] The Live Solution:**
  > *"We built the Clinic Intake Dossier to turn that into a 60-second automated pipeline. We point the CLI at a clinic URL—like Grandview Dental Care. Firecrawl maps the domain, deduplicates pages, and extracts clean markdown. Then Gemini 3.8 Flash extracts the clinical profile into a strict schema."*
* **[0:35 - 0:55] Grounded Verification (Code, Not LLM):**
  > *"Crucially: we never let an LLM self-certify its outputs. Deterministic TypeScript code verifies that every 'FOUND' field has a verbatim evidence quote under 25 words on that field's own page. If a quote or phone number doesn't match the source, code automatically downgrades it to INFERRED."*
* **[0:55 - 1:15] Operational Gaps & Tasks:**
  > *"Notice the sticky status bar: 5 found, 6 inferred, 2 missing, 2 blockers. Instead of treating missing items as errors, our gap engine turns them into owned operations tasks with pre-drafted WhatsApp messages and an exported `tasks.csv` with 2-day business SLAs."*
* **[1:15 - 1:30] Wrap-up:**
  > *"The coordinator opens this dashboard 5 minutes before their call, clicks 'Copy Draft' for missing items, and begins the relationship focused on strategy rather than clerical work."*
