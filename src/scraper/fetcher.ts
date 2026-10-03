import { Firecrawl } from "firecrawl";

export interface ScrapedPage {
  url: string;
  title: string;
  markdown: string;
  char_count: number;
}

export interface ScrapeBatchResult {
  pages: ScrapedPage[];
  failedUrls: Array<{ url: string; error: string }>;
  creditsUsed: number;
  retriesAttempted: number;
  warnings: string[];
}

/**
 * Parses seconds to wait from a rate-limit error message, or defaults to 10s.
 */
function parseRetryDelayMs(errorMessage: string): number {
  const match = errorMessage.match(/retry after (\d+)s/i);
  if (match && match[1]) {
    const seconds = parseInt(match[1], 10);
    if (!isNaN(seconds) && seconds > 0) {
      // Add 2s buffer over the published reset time to ensure window cleared
      return (seconds + 2) * 1000;
    }
  }
  return 10000;
}

/**
 * Scrapes a single URL to markdown with a 30s hard timeout.
 */
async function scrapeSingleUrl(
  firecrawl: Firecrawl,
  url: string,
  charCapPerPage: number = 25000
): Promise<{ page?: ScrapedPage; error?: string; isRateLimit: boolean; creditCost: number }> {
  try {
    const doc = await firecrawl.scrape(url, {
      formats: ["markdown"],
      timeout: 30000,
      onlyMainContent: true,
    });

    const rawMarkdown = (doc as any)?.markdown || "";
    const title = (doc as any)?.metadata?.title || url;

    // Apply per-page character cap to prevent token explosion
    const truncatedMarkdown =
      rawMarkdown.length > charCapPerPage
        ? rawMarkdown.slice(0, charCapPerPage) + "\n\n... [Content truncated at page character cap]"
        : rawMarkdown;

    return {
      page: {
        url,
        title,
        markdown: truncatedMarkdown,
        char_count: truncatedMarkdown.length,
      },
      isRateLimit: false,
      creditCost: 1,
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const isRateLimit = errMsg.includes("Rate limit exceeded") || errMsg.includes("429");

    return {
      error: errMsg,
      isRateLimit,
      creditCost: 0,
    };
  }
}

/**
 * Scrapes an array of URLs: strictly serialised, 5.5s spacing, honours reset times,
 * and retries failed pages after the reset window. Goal: zero lost pages.
 */
export async function scrapePagesBatch(
  urls: string[],
  firecrawlApiKey: string,
  charCapPerPage: number = 25000
): Promise<ScrapeBatchResult> {
  const firecrawl = new Firecrawl({ apiKey: firecrawlApiKey });
  const pages: ScrapedPage[] = [];
  const failedUrls: Array<{ url: string; error: string }> = [];
  const warnings: string[] = [];
  let creditsUsed = 0;
  let retriesAttempted = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    // Enforce 5.5s spacing between requests (skip before first request)
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 5500));
    }

    let res = await scrapeSingleUrl(firecrawl, url, charCapPerPage);

    if (res.page) {
      creditsUsed += res.creditCost;
      pages.push(res.page);
      continue;
    }

    // If rate-limited or failed, wait full reset window and retry once
    if (res.error) {
      retriesAttempted++;
      const waitMs = res.isRateLimit ? parseRetryDelayMs(res.error) : 5500;
      console.warn(`[Scraper] Page ${url} failed (${res.error}). Waiting ${(waitMs / 1000).toFixed(1)}s before retry...`);
      await new Promise((r) => setTimeout(r, waitMs));

      // Retry single URL
      res = await scrapeSingleUrl(firecrawl, url, charCapPerPage);
      if (res.page) {
        creditsUsed += res.creditCost;
        pages.push(res.page);
        warnings.push(`Page ${url} succeeded on retry after waiting ${(waitMs / 1000).toFixed(0)}s.`);
        continue;
      }

      // If still failed after retry, record failure
      failedUrls.push({ url, error: res.error || "Failed on retry" });
      warnings.push(`Failed to scrape page ${url} after 1 retry: ${res.error}. Fields depending on this page will be marked MISSING.`);
    }
  }

  return {
    pages,
    failedUrls,
    creditsUsed,
    retriesAttempted,
    warnings,
  };
}
