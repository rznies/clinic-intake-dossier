import { Firecrawl } from "firecrawl";

export interface MappedPage {
  url: string;
  score: number;
  category: string;
}

export interface MapResult {
  selectedUrls: string[];
  totalDiscovered: number;
  warnings: string[];
}

/**
 * Normalizes a URL:
 * - strips www.
 * - removes query strings (?...)
 * - removes hash fragments (#...)
 * - removes trailing slashes
 * - lowercases hostname
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    let pathname = parsed.pathname.replace(/\/+$/, "");
    if (pathname === "") pathname = "/";
    return `https://${hostname}${pathname}`;
  } catch {
    return rawUrl.trim().replace(/\/+$/, "");
  }
}


/**
 * Checks whether a URL is a non-content or administrative endpoint.
 */
function isExcludedUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const path = url.pathname.toLowerCase();

    // File extensions & feeds
    if (/\.(xml|pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|mp3|exe|json|css|js)$/i.test(path)) {
      return true;
    }

    // Sitemaps, feeds, APIs
    if (
      path.includes("sitemap") ||
      path.includes("feed") ||
      path.includes("rss") ||
      path.includes("wp-json") ||
      path.includes("wp-includes") ||
      path.includes("wp-content") ||
      path.includes("wp-admin") ||
      path.includes("cart") ||
      path.includes("checkout")
    ) {
      return true;
    }

    // Tag, category, author, pagination archives
    if (
      path.includes("/tag/") ||
      path.includes("/category/") ||
      path.includes("/author/") ||
      path.includes("/page/") ||
      /\/p\/\d+/.test(path)
    ) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Score a URL path based on relevant clinical onboarding categories.
 * Boosts team/doctor/meet pages and contact/booking pages.
 */
function scoreUrl(normalizedUrl: string): { score: number; category: string } {
  try {
    const url = new URL(normalizedUrl);
    const path = url.pathname.toLowerCase();

    // Homepage
    if (path === "/" || path === "/home" || path === "/index.html") {
      return { score: 100, category: "home" };
    }

    // Doctor / Team / Meet (High priority boost)
    if (
      path.includes("meet-the-doctor") ||
      path.includes("meet-our-doctor") ||
      path.includes("meet-the-team") ||
      path.includes("our-team") ||
      path.includes("doctor") ||
      path.includes("dentist") ||
      path.includes("physician") ||
      path.includes("dr-") ||
      path.includes("dr_") ||
      path.includes("staff") ||
      path.includes("providers")
    ) {
      return { score: 95, category: "doctor_team" };
    }

    // Contact / Booking / Location / Hours (High priority boost)
    if (
      path.includes("contact") ||
      path.includes("book") ||
      path.includes("appointment") ||
      path.includes("schedule") ||
      path.includes("location") ||
      path.includes("hours") ||
      path.includes("directions")
    ) {
      return { score: 90, category: "contact_booking" };
    }

    // About (general clinic background)
    if (path.includes("about")) {
      return { score: 85, category: "about" };
    }

    // Patient FAQs / Patient Resources
    if (
      path.includes("faq") ||
      path.includes("frequently-asked") ||
      path.includes("patient-info") ||
      path.includes("patient-resources") ||
      path.includes("new-patient") ||
      path.includes("questions")
    ) {
      return { score: 85, category: "faqs" };
    }

    // Services / Treatments / Procedures
    if (
      path.includes("service") ||
      path.includes("treatment") ||
      path.includes("procedure") ||
      path.includes("specialt") ||
      path.includes("care") ||
      path.includes("what-we-do")
    ) {
      return { score: 80, category: "services" };
    }

    // Pricing / Insurance
    if (
      path.includes("pricing") ||
      path.includes("cost") ||
      path.includes("fee") ||
      path.includes("insurance") ||
      path.includes("financing")
    ) {
      return { score: 75, category: "pricing_insurance" };
    }

    // Blog / Patient Education
    if (
      path.includes("blog") ||
      path.includes("article") ||
      path.includes("patient-education") ||
      path.includes("news")
    ) {
      return { score: 50, category: "blog_education" };
    }

    return { score: 10, category: "general" };
  } catch {
    return { score: 0, category: "invalid" };
  }
}

/**
 * Maps a clinic site and selects up to 12 relevant pages.
 * Enforces deduplication, excludes non-content URLs, and prioritizes core clinical pages.
 */
export async function mapClinicSite(
  rootUrl: string,
  firecrawlApiKey: string,
  maxPages: number = 12
): Promise<MapResult> {
  const warnings: string[] = [];
  const normalizedRoot = normalizeUrl(rootUrl);
  const rootDomain = new URL(normalizedRoot).hostname;

  const firecrawl = new Firecrawl({ apiKey: firecrawlApiKey });

  let rawDiscoveredUrls: string[] = [];

  try {
    const mapResponse = await firecrawl.map(normalizedRoot, {
      limit: 100,
      sitemap: "include",
    });

    if (mapResponse && Array.isArray(mapResponse.links)) {
      rawDiscoveredUrls = mapResponse.links.map((item: any) =>
        typeof item === "string" ? item : item.url
      ).filter(Boolean);
    }
  } catch (err: any) {
    warnings.push(`Firecrawl map warning: ${err.message || String(err)}. Falling back to root URL.`);
    rawDiscoveredUrls = [normalizedRoot];
  }

  // Ensure root URL is present
  if (!rawDiscoveredUrls.some((u) => normalizeUrl(u) === normalizedRoot)) {
    rawDiscoveredUrls.unshift(normalizedRoot);
  }

  // Deduplicate and filter non-content and third-party URLs
  const uniqueUrls = new Set<string>();

  for (const raw of rawDiscoveredUrls) {
    const normalized = normalizeUrl(raw);
    try {
      const parsed = new URL(normalized);
      // Domain matching
      if (parsed.hostname !== rootDomain) continue;
      // Excluded endpoints (sitemaps, media, feeds, archives)
      if (isExcludedUrl(normalized)) continue;

      uniqueUrls.add(normalized);
    } catch {
      continue;
    }
  }

  // Score each unique URL
  const scoredPages: MappedPage[] = Array.from(uniqueUrls).map((url) => {
    const { score, category } = scoreUrl(url);
    return { url, score, category };
  });

  // Sort by score descending, then by shorter path length
  scoredPages.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.url.length - b.url.length;
  });

  // Balanced selection: pick top item per key category first
  const selected: string[] = [];
  const seenCategories = new Set<string>();

  // Pass 1: pick the best URL per category for broad coverage
  for (const page of scoredPages) {
    if (selected.length >= maxPages) break;
    if (!seenCategories.has(page.category) && page.score >= 50) {
      selected.push(page.url);
      seenCategories.add(page.category);
    }
  }

  // Pass 2: fill remaining slots with highest remaining scores
  for (const page of scoredPages) {
    if (selected.length >= maxPages) break;
    if (!selected.includes(page.url)) {
      selected.push(page.url);
    }
  }

  if (selected.length === 0) {
    selected.push(normalizedRoot);
  }

  return {
    selectedUrls: selected.slice(0, maxPages),
    totalDiscovered: rawDiscoveredUrls.length,
    warnings,
  };
}
