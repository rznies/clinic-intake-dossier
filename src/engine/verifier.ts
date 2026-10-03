import { ExtractionOutput, FieldStatus } from "../types/dossier.js";
import { ScrapedPage } from "../scraper/fetcher.js";

export type DowngradeCategory = "quote_not_found" | "phone_digits_derived" | "value_token_missing";

export interface DowngradeRecord {
  field: string;
  originalStatus: FieldStatus;
  newStatus: FieldStatus;
  category: DowngradeCategory;
  normalizedQuote: string;
  nearestSnippet: string;
  details: string;
}

export interface VerificationStats {
  totalDowngrades: number;
  categoryCounts: {
    quote_not_found: number;
    phone_digits_derived: number;
    value_token_missing: number;
  };
  fieldDowngrades: DowngradeRecord[];
}

export interface VerificationResult {
  verifiedFields: ExtractionOutput;
  stats: VerificationStats;
}

/**
 * Normalises text for robust verbatim matching:
 * 1. Unicode normalise (NFKD)
 * 2. Strip HTML tags
 * 3. Strip markdown syntax (links, images, *, #, >, |, `, ~, _)
 * 4. Lowercase
 * 5. Collapse all whitespace and punctuation to single spaces
 */
export function normalizeText(text: string): string {
  if (!text) return "";
  let clean = text.normalize("NFKD");
  // Strip HTML tags if any (e.g. <br>, <p>, &nbsp; etc.)
  clean = clean.replace(/<[^>]*>/g, " ");
  // Strip markdown links [text](url) -> text
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Strip images ![alt](url) -> alt
  clean = clean.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  // Strip markdown symbols
  clean = clean.replace(/[*#>|`~_]/g, " ");
  // Lowercase
  clean = clean.toLowerCase();
  // Collapse all punctuation and whitespace to single space
  clean = clean.replace(/[^a-z0-9]+/g, " ");
  return clean.trim();
}

/**
 * Counts words in a string.
 */
function countWords(str: string): number {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Finds the nearest matching snippet on the page around the quote words.
 */
function findNearestPageSnippet(normQuote: string, normPageText: string): { snippet: string } {
  const words = normQuote.split(" ").filter((w) => w.length > 2);
  if (words.length === 0) {
    return { snippet: "[Quote contains no words > 2 chars]" };
  }

  // 1. Try finding 3-word prefix
  const searchPrefix = words.slice(0, Math.min(3, words.length)).join(" ");
  const idx = normPageText.indexOf(searchPrefix);
  if (idx !== -1) {
    const start = Math.max(0, idx - 40);
    const end = Math.min(normPageText.length, idx + searchPrefix.length + 80);
    return {
      snippet: `...${normPageText.slice(start, end)}...`,
    };
  }

  // 2. Try longest word match
  const sortedWords = [...words].sort((a, b) => b.length - a.length);
  const longestWord = sortedWords[0];
  const longIdx = normPageText.indexOf(longestWord);
  if (longIdx !== -1) {
    const start = Math.max(0, longIdx - 40);
    const end = Math.min(normPageText.length, longIdx + longestWord.length + 80);
    return {
      snippet: `[anchor: "${longestWord}"] ...${normPageText.slice(start, end)}...`,
    };
  }

  return {
    snippet: "[No matching text found on page]",
  };
}

/**
 * Safely extracts phone numbers from field value.
 * Never inspects URLs or image filenames for phone digits.
 */
function extractPhonesFromValue(obj: any): string[] {
  const phones: string[] = [];

  function recurse(val: any, keyName?: string) {
    if (!val) return;
    if (typeof val === "string") {
      const lower = val.trim().toLowerCase();
      // Skip URLs and image filenames entirely
      if (
        lower.startsWith("http://") ||
        lower.startsWith("https://") ||
        /\.(jpg|jpeg|png|webp|gif|svg|ico|pdf)($|\?)/i.test(lower) ||
        keyName === "url" ||
        keyName === "booking_url" ||
        keyName === "source_url" ||
        keyName === "image" ||
        keyName === "avatar" ||
        keyName === "src" ||
        keyName === "href"
      ) {
        return;
      }

      const isExplicitPhoneKey = Boolean(keyName && /phone|whatsapp|tel|mobile/i.test(keyName));
      const isStrictPhone = /^(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(val.trim());

      if (isExplicitPhoneKey || isStrictPhone) {
        const digits = val.replace(/\D/g, "");
        if (digits.length >= 7 && digits.length <= 15) {
          phones.push(digits);
        }
      }
    } else if (Array.isArray(val)) {
      for (const item of val) recurse(item, keyName);
    } else if (typeof val === "object") {
      for (const [k, v] of Object.entries(val)) {
        recurse(v, k);
      }
    }
  }

  recurse(obj);
  return [...new Set(phones)];
}

/**
 * Safely extracts email addresses from field value.
 * Never inspects URLs or image filenames.
 */
function extractEmailsFromValue(obj: any): string[] {
  const emails: string[] = [];

  function recurse(val: any, keyName?: string) {
    if (!val) return;
    if (typeof val === "string") {
      const lower = val.trim().toLowerCase();
      if (lower.startsWith("http://") || lower.startsWith("https://")) return;
      if (/\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(lower)) return;

      const matches = val.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (matches) {
        for (const m of matches) {
          emails.push(m.toLowerCase());
        }
      }
    } else if (Array.isArray(val)) {
      for (const item of val) recurse(item, keyName);
    } else if (typeof val === "object") {
      for (const [k, v] of Object.entries(val)) {
        recurse(v, k);
      }
    }
  }

  recurse(obj);
  return [...new Set(emails)];
}

/**
 * Safely extracts HTTP/HTTPS URLs from field value.
 */
function extractUrlsFromValue(obj: any): string[] {
  const urls: string[] = [];

  function recurse(val: any) {
    if (!val) return;
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        urls.push(trimmed);
      }
    } else if (Array.isArray(val)) {
      for (const item of val) recurse(item);
    } else if (typeof val === "object") {
      for (const v of Object.values(val)) recurse(v);
    }
  }

  recurse(obj);
  return [...new Set(urls)];
}

/**
 * Pure code verifier (NO LLM):
 * - Normalises both quote and page text (unicode, strip markdown, lowercase, collapse punct & whitespace).
 * - Accepts 1 to 3 short evidence quotes per field; all must match that field's own source page.
 * - Value token checks: apply only to phone numbers (digits only) and emails. Never extract digits from URLs/images.
 * - Checks URLs by domain and path presence in page text, not in the quote.
 * - Categorizes unconfirmed downgrades strictly as: quote_not_found, phone_digits_derived, value_token_missing.
 */
export function verifyDossierExtraction(
  extraction: ExtractionOutput,
  scrapedPages: ScrapedPage[]
): VerificationResult {
  const fields = JSON.parse(JSON.stringify(extraction)) as ExtractionOutput;

  // Build page map with both raw markdown and normalized text
  const pageMap = new Map<string, { raw: string; normalized: string }>();
  for (const p of scrapedPages) {
    const normUrl = p.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
    pageMap.set(normUrl, {
      raw: p.markdown,
      normalized: normalizeText(p.markdown),
    });
  }

  const fieldDowngrades: DowngradeRecord[] = [];

  const coreFieldKeys = [
    "clinic_name",
    "doctor_name_and_qualifications",
    "specialty",
    "services_procedures",
    "location",
    "languages",
    "contact_booking_channels",
    "hours",
    "social_links",
    "existing_media_assets",
    "tone_positioning_signals",
    "approval_contact",
    "recording_readiness",
  ] as const;

  for (const key of coreFieldKeys) {
    const field = fields[key] as any;
    if (!field || field.status !== "FOUND") {
      continue;
    }

    // 1. Gather all quotes (support both array and singular)
    const quotes: string[] = [];
    if (Array.isArray(field.evidence_quotes) && field.evidence_quotes.length > 0) {
      quotes.push(...field.evidence_quotes.filter((q: any) => typeof q === "string" && q.trim().length > 0));
    } else if (field.evidence_quote && typeof field.evidence_quote === "string" && field.evidence_quote.trim()) {
      quotes.push(field.evidence_quote.trim());
    }

    // For doctors: if evidence_quotes is empty on field, check if individual doctor objects in value have quotes
    if (quotes.length === 0 && key === "doctor_name_and_qualifications" && Array.isArray(field.value)) {
      for (const doc of field.value) {
        if (doc && typeof doc.quote === "string" && doc.quote.trim()) {
          quotes.push(doc.quote.trim());
        }
      }
      if (quotes.length > 0) {
        field.evidence_quotes = quotes;
      }
    }

    // Check 1: Missing evidence quotes
    if (quotes.length === 0) {
      field.status = "INFERRED";
      fieldDowngrades.push({
        field: key,
        originalStatus: "FOUND",
        newStatus: "INFERRED",
        category: "quote_not_found",
        normalizedQuote: "",
        nearestSnippet: "None",
        details: "Field marked FOUND has no evidence quotes.",
      });
      continue;
    }

    // Check 2: Word count on each quote (<= 25 words)
    let quoteTooLong = false;
    for (const q of quotes) {
      const words = countWords(q);
      if (words > 25) {
        quoteTooLong = true;
        field.status = "INFERRED";
        fieldDowngrades.push({
          field: key,
          originalStatus: "FOUND",
          newStatus: "INFERRED",
          category: "quote_not_found",
          normalizedQuote: normalizeText(q),
          nearestSnippet: `Word count: ${words}`,
          details: `Quote exceeds 25 words (${words} words): "${q.slice(0, 50)}..."`,
        });
        break;
      }
    }
    if (quoteTooLong) continue;

    // Check 3: Quote matching on that field's OWN source page
    const sourceUrl = field.source_url;
    if (!sourceUrl) {
      field.status = "INFERRED";
      fieldDowngrades.push({
        field: key,
        originalStatus: "FOUND",
        newStatus: "INFERRED",
        category: "quote_not_found",
        normalizedQuote: normalizeText(quotes[0]),
        nearestSnippet: "No source_url provided",
        details: "Field has quotes but no source_url.",
      });
      continue;
    }

    const normSourceUrl = sourceUrl.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
    const pageEntry = pageMap.get(normSourceUrl);

    if (!pageEntry) {
      field.status = "INFERRED";
      fieldDowngrades.push({
        field: key,
        originalStatus: "FOUND",
        newStatus: "INFERRED",
        category: "quote_not_found",
        normalizedQuote: normalizeText(quotes[0]),
        nearestSnippet: `Source page ${sourceUrl} was not scraped`,
        details: `Source URL ${sourceUrl} was not among scraped pages.`,
      });
      continue;
    }

    let allQuotesMatch = true;
    for (const q of quotes) {
      const normQ = normalizeText(q);
      if (!pageEntry.normalized.includes(normQ)) {
        allQuotesMatch = false;
        const nearest = findNearestPageSnippet(normQ, pageEntry.normalized);

        field.status = "INFERRED";
        fieldDowngrades.push({
          field: key,
          originalStatus: "FOUND",
          newStatus: "INFERRED",
          category: "quote_not_found",
          normalizedQuote: normQ,
          nearestSnippet: nearest.snippet,
          details: `Quote "${q}" is not present on source page ${sourceUrl}. Nearest: ${nearest.snippet}`,
        });
        break;
      }
    }
    if (!allQuotesMatch) continue;

    // Check 4: Value token check (PHONE NUMBERS & EMAILS ONLY)
    // "apply only to phone numbers (compare digits only) and emails. Never extract digit strings from URLs or image filenames."

    // 4a. Phone numbers: compare digits only
    const phoneDigitsList = extractPhonesFromValue(field.value);
    const quotesDigits = quotes.map((q) => q.replace(/\D/g, "")).join(" ");

    let missingPhone = false;
    for (const pDigits of phoneDigitsList) {
      const baseDigits = pDigits.length === 11 && pDigits.startsWith("1") ? pDigits.slice(1) : pDigits;
      if (!quotesDigits.includes(pDigits) && !quotesDigits.includes(baseDigits)) {
        missingPhone = true;
        field.status = "INFERRED";
        fieldDowngrades.push({
          field: key,
          originalStatus: "FOUND",
          newStatus: "INFERRED",
          category: "phone_digits_derived",
          normalizedQuote: normalizeText(quotes.join(" ")),
          nearestSnippet: `Phone digits ${pDigits} missing from quotes digits [${quotesDigits}]`,
          details: `Phone number digits [${pDigits}] appear in value but are absent from evidence quotes.`,
        });
        break;
      }
    }
    if (missingPhone) continue;

    // 4b. Emails: case-insensitive check in quotes
    const emailsList = extractEmailsFromValue(field.value);
    let missingEmail = false;
    for (const email of emailsList) {
      const inQuotes = quotes.some((q) => q.toLowerCase().includes(email));
      if (!inQuotes) {
        missingEmail = true;
        field.status = "INFERRED";
        fieldDowngrades.push({
          field: key,
          originalStatus: "FOUND",
          newStatus: "INFERRED",
          category: "value_token_missing",
          normalizedQuote: normalizeText(quotes.join(" ")),
          nearestSnippet: `Email ${email} missing from quotes`,
          details: `Email [${email}] appears in value but is absent from evidence quotes.`,
        });
        break;
      }
    }
    if (missingEmail) continue;

    // 4c. Check URLs by domain and path presence in PAGE TEXT (not in quote)
    const urlsList = extractUrlsFromValue(field.value);
    let missingUrlOnPage = false;
    for (const u of urlsList) {
      try {
        const parsed = new URL(u);
        const domain = parsed.hostname.replace(/^www\./, "").toLowerCase();
        const rawPath = parsed.pathname ? parsed.pathname.replace(/\/+$/, "").toLowerCase() : "";

        const domainInPage = pageEntry.raw.toLowerCase().includes(domain);
        const pathInPage = rawPath.length > 1 ? pageEntry.raw.toLowerCase().includes(rawPath) : true;

        if (!domainInPage || !pathInPage) {
          missingUrlOnPage = true;
          field.status = "INFERRED";
          fieldDowngrades.push({
            field: key,
            originalStatus: "FOUND",
            newStatus: "INFERRED",
            category: "value_token_missing",
            normalizedQuote: domain,
            nearestSnippet: `URL [domain: ${domain}, path: ${rawPath || "/"}] not found in source page text`,
            details: `URL ${u} (domain/path) is not present in the source page text.`,
          });
          break;
        }
      } catch {
        // ignore unparseable URLs
      }
    }
    if (missingUrlOnPage) continue;

    // 4d. Doctor qualifications and claims check
    if (key === "doctor_name_and_qualifications" && Array.isArray(field.value)) {
      for (const doc of field.value) {
        if (!doc) continue;
        if (doc.title) {
          const marketingRegex = /\b(over \d+|#1|premier|leading|top-rated|best|miracle|guarantee|renowned)\b/i;
          if (marketingRegex.test(doc.title)) {
            const match = doc.title.match(marketingRegex);
            const claim = match ? match[0].toLowerCase() : "";
            const normDocQuote = doc.quote ? normalizeText(doc.quote) : "";
            const isSupported = normDocQuote.includes(claim) || pageEntry.normalized.includes(claim);
            if (!isSupported) {
              doc.title = doc.title.replace(/\b(over \d+[^,.;]*|#1|premier|leading|top-rated|best|miracle|guarantee|renowned)\b/gi, "").replace(/\s+/g, " ").trim();
            }
          }
          // Clinical title only: trim giant sentences if stuffed in title
          if (doc.title.length > 60) {
            const parts = doc.title.split(/[,.]/);
            doc.title = parts[0].trim();
          }
        }

        // Doctor qualifications check:
        // "if a qualification string (for example 'DDS') does not appear in the doctor's page text, drop it or mark INFERRED."
        if (Array.isArray(doc.qualifications) && doc.qualifications.length > 0) {
          const validQuals: string[] = [];
          for (const qual of doc.qualifications) {
            const normQual = normalizeText(qual);
            if (normQual && (pageEntry.normalized.includes(normQual) || pageEntry.raw.toLowerCase().includes(qual.toLowerCase()))) {
              validQuals.push(qual);
            }
          }
          doc.qualifications = validQuals;
        } else {
          doc.qualifications = [];
        }

        if (doc.quote && typeof doc.quote === "string") {
          const normDocQ = normalizeText(doc.quote);
          if (normDocQ && !pageEntry.normalized.includes(normDocQ)) {
            doc.quote = null;
          }
        }
      }
    }
  }

  // FAQ check: verify answered_on_site quotes
  if (fields.patient_faqs && Array.isArray(fields.patient_faqs.answered_on_site)) {
    const verifiedFaqs: any[] = [];
    for (const faq of fields.patient_faqs.answered_on_site) {
      if (!faq.source_url || !faq.evidence_quote) continue;
      const normFaqUrl = faq.source_url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
      const faqPage = pageMap.get(normFaqUrl);

      if (faqPage && faqPage.normalized.includes(normalizeText(faq.evidence_quote))) {
        verifiedFaqs.push(faq);
      } else {
        fields.patient_faqs.gaps.push({
          question: faq.question,
          status: "INFERRED",
        });
      }
    }
    fields.patient_faqs.answered_on_site = verifiedFaqs;
  }

  const quoteNotFoundCount = fieldDowngrades.filter((d) => d.category === "quote_not_found").length;
  const phoneDigitsDerivedCount = fieldDowngrades.filter((d) => d.category === "phone_digits_derived").length;
  const valueTokenMissingCount = fieldDowngrades.filter((d) => d.category === "value_token_missing").length;

  return {
    verifiedFields: fields,
    stats: {
      totalDowngrades: fieldDowngrades.length,
      categoryCounts: {
        quote_not_found: quoteNotFoundCount,
        phone_digits_derived: phoneDigitsDerivedCount,
        value_token_missing: valueTokenMissingCount,
      },
      fieldDowngrades,
    },
  };
}
