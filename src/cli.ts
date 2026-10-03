import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { mapClinicSite } from "./scraper/mapper.js";
import { scrapePagesBatch } from "./scraper/fetcher.js";
import { extractClinicDossier } from "./engine/gemini.js";

async function main() {
  const args = process.argv.slice(2);
  const targetUrl = args[0];

  if (!targetUrl) {
    console.error("Usage: npx tsx src/cli.ts <clinic-url> [--output <output-dir>]");
    process.exit(1);
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!firecrawlKey) {
    console.error("Error: FIRECRAWL_API_KEY environment variable is missing.");
    process.exit(1);
  }

  if (!geminiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is missing.");
    process.exit(1);
  }

  const outputDirIndex = args.indexOf("--output");
  const outputDir = outputDirIndex !== -1 && args[outputDirIndex + 1] ? args[outputDirIndex + 1] : "./output";

  await fs.mkdir(outputDir, { recursive: true });

  console.log(`\n========================================`);
  console.log(` Clinic Intake Dossier (Step 1 Runner)`);
  console.log(` Target URL: ${targetUrl}`);
  console.log(` Status: Extracted, Unverified (Step 1)`);
  console.log(`========================================\n`);

  const startTime = Date.now();

  // 1. Map Site with strict dedup and non-content exclusions
  console.log(`[1/3] Mapping clinic site (max 12 relevant pages)...`);
  const mapResult = await mapClinicSite(targetUrl, firecrawlKey, 12);
  console.log(`Discovered ${mapResult.totalDiscovered} URLs. Selected ${mapResult.selectedUrls.length} prioritized pages (deduplicated):`);
  mapResult.selectedUrls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));

  if (mapResult.warnings.length > 0) {
    mapResult.warnings.forEach((w) => console.warn(`  Warning: ${w}`));
  }

  // 2. Scrape Pages with rate-limit backoff and retries
  console.log(`\n[2/3] Scraping ${mapResult.selectedUrls.length} pages to markdown...`);
  const scrapeResult = await scrapePagesBatch(mapResult.selectedUrls, firecrawlKey, 3);
  console.log(`Successfully scraped ${scrapeResult.pages.length} pages (${scrapeResult.creditsUsed} Firecrawl credits used, ${scrapeResult.retriesAttempted} retries).`);

  if (scrapeResult.warnings.length > 0) {
    scrapeResult.warnings.forEach((w) => console.warn(`  Warning: ${w}`));
  }

  // 3. Extract with Gemini
  console.log(`\n[3/3] Extracting clinic intake dossier with Gemini (${process.env.GEMINI_MODEL || "gemini-3.8-flash"})...`);
  const extractionResult = await extractClinicDossier(targetUrl, scrapeResult.pages, geminiKey);
  console.log(`Gemini extraction complete (${extractionResult.tokensUsed.total} tokens used).`);

  const durationMs = Date.now() - startTime;

  // Build Step 1 JSON payload (Extracted, unverified)
  const dossierJsonPayload = {
    target_url: targetUrl,
    run_date: new Date().toISOString(),
    stage: "extracted, unverified",
    gemini_model: extractionResult.modelString,
    duration_ms: durationMs,
    credits_used: scrapeResult.creditsUsed,
    retries_attempted: scrapeResult.retriesAttempted,
    tokens_used: extractionResult.tokensUsed,
    pages_scraped: scrapeResult.pages.map((p) => ({
      url: p.url,
      title: p.title,
      char_count: p.char_count,
    })),
    warnings: [...mapResult.warnings, ...scrapeResult.warnings, ...extractionResult.warnings],
    fields: extractionResult.extraction,
  };

  const jsonOutputPath = path.join(outputDir, "dossier.json");
  await fs.writeFile(jsonOutputPath, JSON.stringify(dossierJsonPayload, null, 2), "utf8");

  console.log(`\n========================================`);
  console.log(` Step 1 Success: dossier.json produced`);
  console.log(` State: Extracted, Unverified`);
  console.log(` Saved to: ${path.resolve(jsonOutputPath)}`);
  console.log(` Total Time: ${(durationMs / 1000).toFixed(1)}s`);
  console.log(` Firecrawl Credits: ${scrapeResult.creditsUsed}`);
  console.log(` Retries Attempted: ${scrapeResult.retriesAttempted}`);
  console.log(` Gemini Tokens: ${extractionResult.tokensUsed.total}`);
  console.log(` Model Logged: ${extractionResult.modelString}`);
  console.log(`========================================\n`);
}

main().catch((err) => {
  console.error("\n[FATAL ERROR]", err);
  process.exit(1);
});
