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
      // Cap wait time at 35s to prevent stalling
      return Math.min(seconds * 1000, 35000);
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
 * Scrapes an array of URLs with concurrency max 3, rate-limit backoff, and 1 retry per failed page.
 * Per-page failures produce partial results with warnings (never silent failure).
 */
export async function scrapePagesBatch(
  urls: string[],
  firecrawlApiKey: string,
  concurrency: number = 3,
  charCapPerPage: number = 25000
): Promise<ScrapeBatchResult> {
  const firecrawl = new Firecrawl({ apiKey: firecrawlApiKey });
  const pages: ScrapedPage[] = [];
  const failedUrls: Array<{ url: string; error: string }> = [];
  const warnings: string[] = [];
  let creditsUsed = 0;
  let retriesAttempted = 0;

  let lastWaitUntil = 0;

  // Process in chunks of max 3 concurrency
  for (let i = 0; i < urls.length; i += concurrency) {
    const chunk = urls.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map((u) => scrapeSingleUrl(firecrawl, u, charCapPerPage))
    );

    for (let j = 0; j < results.length; j++) {
      let res = results[j];
      const url = chunk[j];

      if (res.page) {
        creditsUsed += res.creditCost;
        pages.push(res.page);
        continue;
      }

      // If rate limited or failed, retry once after waiting
      if (res.error) {
        retriesAttempted++;
        const now = Date.now();
        const baseWaitMs = res.isRateLimit ? parseRetryDelayMs(res.error) : 3000;
        const neededWait = Math.max(1000, lastWaitUntil > now ? lastWaitUntil - now : baseWaitMs);

        if (neededWait > 1200) {
          console.warn(`[Scraper] Page ${url} failed (${res.error}). Retrying once after ${(neededWait / 1000).toFixed(0)}s wait...`);
          await new Promise((r) => setTimeout(r, neededWait));
          lastWaitUntil = Date.now() + 1000;
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }

        // Retry single URL once
        res = await scrapeSingleUrl(firecrawl, url, charCapPerPage);
        if (res.page) {
          creditsUsed += res.creditCost;
          pages.push(res.page);
          warnings.push(`Page ${url} succeeded on retry after rate-limit backoff.`);
          continue;
        }


        // If it still failed, record failure and partial results
        failedUrls.push({ url, error: res.error || "Unknown error on retry" });
        warnings.push(`Failed to scrape page ${url} after 1 retry: ${res.error}. Partial results preserved.`);
      }
    }

    // Inter-chunk throttle to stay smoothly under rate limits
    if (i + concurrency < urls.length) {
      await new Promise((resolve) => setTimeout(resolve, 800));
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
