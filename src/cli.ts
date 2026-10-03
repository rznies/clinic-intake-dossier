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

  // 2. Scrape Pages with serialised requests (5.5s spacing) & reset time handling
  console.log(`\n[2/4] Scraping ${mapResult.selectedUrls.length} pages to markdown (serialised, 5.5s spacing)...`);
  const scrapeResult = await scrapePagesBatch(mapResult.selectedUrls, firecrawlKey);
  console.log(`Successfully scraped ${scrapeResult.pages.length} pages (${scrapeResult.creditsUsed} Firecrawl credits used, ${scrapeResult.retriesAttempted} retries).`);

  // Check if FAQ page was discovered but failed to scrape
  const faqPageDiscovered = mapResult.selectedUrls.find((u) => /\bfaqs?\b/i.test(u));
  const faqPageScraped = scrapeResult.pages.find((p) => /\bfaqs?\b/i.test(p.url));
  if (faqPageDiscovered && !faqPageScraped) {
    const faqWarning = `FAQ page (${faqPageDiscovered}) was not scraped; answered_on_site contains only FAQs found across other scraped pages.`;
    scrapeResult.warnings.push(faqWarning);
    console.warn(`  Warning: ${faqWarning}`);
  }

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
  console.log(`Verifier complete: ${verificationResult.stats.totalDowngrades} downgrades recorded (quote_not_found: ${verificationResult.stats.categoryCounts.quote_not_found}, phone_digits_derived: ${verificationResult.stats.categoryCounts.phone_digits_derived}, value_token_missing: ${verificationResult.stats.categoryCounts.value_token_missing}).`);
  if (verificationResult.stats.fieldDowngrades.length > 0) {
    verificationResult.stats.fieldDowngrades.forEach((d) => {
      console.log(`  Downgrade [${d.field}]: ${d.originalStatus} -> ${d.newStatus} [${d.category}] - ${d.details}`);
    });
  }

  // Handle failed pages: mark dependent fields as MISSING
  const failedPageWarnings: string[] = [];
  if (scrapeResult.failedUrls.length > 0) {
    const failedSet = new Set(scrapeResult.failedUrls.map((f) => f.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "")));
    const coreKeys = Object.keys(verificationResult.verifiedFields) as Array<keyof typeof verificationResult.verifiedFields>;
    for (const k of coreKeys) {
      const f = verificationResult.verifiedFields[k] as any;
      if (f && f.source_url) {
        const norm = f.source_url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
        if (failedSet.has(norm)) {
          f.status = "MISSING";
          f.evidence_quote = null;
          f.evidence_quotes = [];
          const warn = `Field '${k}' depends on failed page ${f.source_url} and was marked MISSING.`;
          failedPageWarnings.push(warn);
          console.warn(`  Warning: ${warn}`);
        }
      }
    }
  }

  // 5. Reel Hook Linter (Word-boundary regex deny-list)
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

  // Log downgrade details into DEVLOG.md
  if (verificationResult.stats.fieldDowngrades.length > 0) {
    try {
      const devlogPath = path.resolve(process.cwd(), "DEVLOG.md");
      const timestamp = new Date().toISOString();
      let devlogSection = `\n\n### Verifier Downgrade Audit: ${targetUrl} (${timestamp})\n`;
      devlogSection += `Total downgrades: ${verificationResult.stats.totalDowngrades} (quote_not_found: ${verificationResult.stats.categoryCounts.quote_not_found}, phone_digits_derived: ${verificationResult.stats.categoryCounts.phone_digits_derived}, value_token_missing: ${verificationResult.stats.categoryCounts.value_token_missing}) - unconfirmed until manual check\n\n`;
      devlogSection += `| Field | Status Change | Category | Normalized Quote | Nearest Snippet on Page |\n`;
      devlogSection += `| :--- | :--- | :--- | :--- | :--- |\n`;
      for (const d of verificationResult.stats.fieldDowngrades) {
        devlogSection += `| **${d.field}** | ${d.originalStatus} &rarr; ${d.newStatus} | \`${d.category}\` | \`${d.normalizedQuote.slice(0, 45)}\` | ${d.nearestSnippet.replace(/\|/g, "\\|").slice(0, 80)} |\n`;
      }
      await fs.appendFile(devlogPath, devlogSection, "utf8");
    } catch (err: any) {
      console.warn(`  Warning: Failed to append to DEVLOG.md: ${err.message}`);
    }
  }

  const durationMs = Date.now() - startTime;
  const allWarnings = [
    ...mapResult.warnings,
    ...scrapeResult.warnings,
    ...failedPageWarnings,
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
    downgrade_summary: {
      total_downgrades: verificationResult.stats.totalDowngrades,
      quote_not_found: verificationResult.stats.categoryCounts.quote_not_found,
      phone_digits_derived: verificationResult.stats.categoryCounts.phone_digits_derived,
      value_token_missing: verificationResult.stats.categoryCounts.value_token_missing,
    },
    downgrades_detail: verificationResult.stats.fieldDowngrades.map((d) => ({
      field: d.field,
      originalStatus: d.originalStatus,
      newStatus: d.newStatus,
      category: d.category,
      normalizedQuote: d.normalizedQuote,
      nearestSnippet: d.nearestSnippet,
      details: d.details,
    })),
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

main().catch((err: any) => {
  console.error("\n[FATAL ERROR]", err?.message || String(err));
  if (err?.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
