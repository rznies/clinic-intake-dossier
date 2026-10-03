import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { mapClinicSite } from "./scraper/mapper.js";
import { scrapePagesBatch } from "./scraper/fetcher.js";
import { extractClinicDossier } from "./engine/gemini.js";
import { verifyDossierExtraction } from "./engine/verifier.js";
import { lintAllHooks } from "./engine/hook-linter.js";
import { evaluateGapsAndTasks } from "./engine/gap-engine.js";
import { formatTasksCsv } from "./render/csv.js";
import { renderDossierHtml } from "./render/html.js";
import { DossierRecord } from "./types/dossier.js";

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
  console.log(` Clinic Intake Dossier Pipeline`);
  console.log(` Target URL: ${targetUrl}`);
  console.log(` Model: ${process.env.GEMINI_MODEL || "gemini-3.8-flash"}`);
  console.log(`========================================\n`);

  const startTime = Date.now();

  // 1. Map Site with strict dedup and non-content exclusions
  console.log(`[1/4] Mapping clinic site (max 12 relevant pages)...`);
  const mapResult = await mapClinicSite(targetUrl, firecrawlKey, 12);
  console.log(`Discovered ${mapResult.totalDiscovered} URLs. Selected ${mapResult.selectedUrls.length} prioritized pages (deduplicated):`);
  mapResult.selectedUrls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));

  if (mapResult.warnings.length > 0) {
    mapResult.warnings.forEach((w) => console.warn(`  Warning: ${w}`));
  }

  // 2. Scrape Pages with rate-limit backoff and retries
  console.log(`\n[2/4] Scraping ${mapResult.selectedUrls.length} pages to markdown...`);
  const scrapeResult = await scrapePagesBatch(mapResult.selectedUrls, firecrawlKey, 3);
  console.log(`Successfully scraped ${scrapeResult.pages.length} pages (${scrapeResult.creditsUsed} Firecrawl credits used, ${scrapeResult.retriesAttempted} retries).`);

  if (scrapeResult.warnings.length > 0) {
    scrapeResult.warnings.forEach((w) => console.warn(`  Warning: ${w}`));
  }

  // 3. Extract with Gemini
  console.log(`\n[3/4] Extracting clinic intake dossier with Gemini (${process.env.GEMINI_MODEL || "gemini-3.8-flash"})...`);
  const extractionResult = await extractClinicDossier(targetUrl, scrapeResult.pages, geminiKey);
  console.log(`Gemini raw extraction complete (${extractionResult.tokensUsed.total} tokens used).`);

  // 4. Code Verifier (Deterministic, NO LLM)
  console.log(`\n[4/4] Running Verifier, Hook Linter & Gap Engine (Code, not LLM)...`);
  const verificationResult = verifyDossierExtraction(extractionResult.extraction, scrapeResult.pages);
  console.log(`Verifier complete: ${verificationResult.stats.totalDowngrades} downgrades recorded.`);
  if (verificationResult.stats.fieldDowngrades.length > 0) {
    verificationResult.stats.fieldDowngrades.forEach((d) => {
      console.log(`  Downgrade [${d.field}]: ${d.originalStatus} -> ${d.newStatus} (${d.reason}) - ${d.details}`);
    });
  }

  // 5. Reel Hook Linter
  const lintedHooks = lintAllHooks(verificationResult.verifiedFields.reel_hooks);
  verificationResult.verifiedFields.reel_hooks = lintedHooks.hooks;
  if (lintedHooks.warnings.length > 0) {
    lintedHooks.warnings.forEach((w) => console.warn(`  Hook Warning: ${w}`));
  }

  // 6. Gap Engine & Tasks Generator
  const gapResult = await evaluateGapsAndTasks(
    verificationResult.verifiedFields,
    verificationResult.stats
  );

  console.log(`\nStatus Header: "${gapResult.statusHeader}"`);
  console.log(`Identified ${gapResult.missingItems.length} missing onboarding items and generated ${gapResult.tasks.length} tracker tasks.`);

  const durationMs = Date.now() - startTime;
  const allWarnings = [
    ...mapResult.warnings,
    ...scrapeResult.warnings,
    ...extractionResult.warnings,
    ...lintedHooks.warnings,
  ];

  // 7. Write outputs
  const dossierPayload: DossierRecord = {
    url: targetUrl,
    run_date: new Date().toISOString(),
    gemini_model: extractionResult.modelString,
    status_header: gapResult.statusHeader,
    summary_counts: gapResult.summaryCounts,
    downgrade_reasons: verificationResult.stats.downgradeReasons,
    fields: verificationResult.verifiedFields,
    missing_items: gapResult.missingItems,
    tasks: gapResult.tasks,
    pages_scraped: scrapeResult.pages.map((p) => ({
      url: p.url,
      title: p.title,
      char_count: p.char_count,
    })),
    credits_used: scrapeResult.creditsUsed,
    tokens_used: extractionResult.tokensUsed,
    warnings: allWarnings,
  };

  const jsonOutputPath = path.join(outputDir, "dossier.json");
  await fs.writeFile(jsonOutputPath, JSON.stringify(dossierPayload, null, 2), "utf8");

  const csvOutputPath = path.join(outputDir, "tasks.csv");
  const csvContent = formatTasksCsv(gapResult.tasks);
  await fs.writeFile(csvOutputPath, csvContent, "utf8");

  const htmlOutputPath = path.join(outputDir, "dossier.html");
  const htmlContent = renderDossierHtml(dossierPayload);
  await fs.writeFile(htmlOutputPath, htmlContent, "utf8");

  console.log(`\n========================================`);
  console.log(` Pipeline Complete`);
  console.log(` Status: ${gapResult.statusHeader}`);
  console.log(` Saved dossier.json: ${path.resolve(jsonOutputPath)}`);
  console.log(` Saved dossier.html: ${path.resolve(htmlOutputPath)}`);
  console.log(` Saved tasks.csv:    ${path.resolve(csvOutputPath)}`);
  console.log(` Total Time: ${(durationMs / 1000).toFixed(1)}s`);
  console.log(` Firecrawl Credits: ${scrapeResult.creditsUsed}`);
  console.log(` Gemini Tokens: ${extractionResult.tokensUsed.total}`);
  console.log(` Model: ${extractionResult.modelString}`);
  console.log(`========================================\n`);
}

main().catch((err) => {
  console.error("\n[FATAL ERROR]", err);
  process.exit(1);
});
