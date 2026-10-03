import { ExtractionOutput, FieldStatus } from "../types/dossier.js";
import { ScrapedPage } from "../scraper/fetcher.js";

export interface VerificationStats {
  totalDowngrades: number;
  downgradeReasons: {
    quote_not_in_page: number;
    value_token_not_in_quote: number;
    quote_too_long: number;
    missing_quote: number;
  };
  fieldDowngrades: Array<{
    field: string;
    originalStatus: FieldStatus;
    newStatus: FieldStatus;
    reason: string;
    details: string;
  }>;
}

export interface VerificationResult {
  verifiedFields: ExtractionOutput;
  stats: VerificationStats;
}

/**
 * Normalizes text for substring checking: strips excess whitespace and lowercases.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Counts words in a string.
 */
function countWords(str: string): number {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

function extractTokensToCheck(val: any): string[] {
  const tokens: string[] = [];
  const text = JSON.stringify(val);

  // Emails
  const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  tokens.push(...emails);

  // Phone numbers (e.g. 614-486-7378, (614) 486-7378)
  const phones = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [];
  tokens.push(...phones.map((p) => p.replace(/\D/g, "")).filter((p) => p.length >= 7));

  return Array.from(new Set(tokens));
}

/**
 * Checks whether a token appears in the quote (tolerant of phone formatting).
 */
function tokenAppearsInQuote(token: string, normalizedQuote: string): boolean {
  const normToken = token.toLowerCase();
  if (normalizedQuote.includes(normToken)) return true;

  // If token is all digits (e.g. phone or street number), test stripped digits in quote
  if (/^\d+$/.test(token)) {
    const quoteDigits = normalizedQuote.replace(/\D/g, "");
    if (quoteDigits.includes(token)) return true;
  }

  return false;
}

/**
 * Deterministic code verifier (NO LLM):
 * Validates verbatim evidence quotes and checks grounded token presence.
 * Downgrades ungrounded fields to INFERRED or MISSING and tracks reasons.
 */
export function verifyDossierExtraction(
  extraction: ExtractionOutput,
  scrapedPages: ScrapedPage[]
): VerificationResult {
  const fields = JSON.parse(JSON.stringify(extraction)) as ExtractionOutput;

  // Build page map for fast markdown lookup
  const pageMap = new Map<string, string>();
  for (const p of scrapedPages) {
    const normUrl = p.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
    pageMap.set(normUrl, normalizeText(p.markdown));
  }

  const stats: VerificationStats = {
    totalDowngrades: 0,
    downgradeReasons: {
      quote_not_in_page: 0,
      value_token_not_in_quote: 0,
      quote_too_long: 0,
      missing_quote: 0,
    },
    fieldDowngrades: [],
  };

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

    // Check 1: Missing evidence quote
    if (!field.evidence_quote || typeof field.evidence_quote !== "string" || !field.evidence_quote.trim()) {
      field.status = "INFERRED";
      stats.totalDowngrades++;
      stats.downgradeReasons.missing_quote++;
      stats.fieldDowngrades.push({
        field: key,
        originalStatus: "FOUND",
        newStatus: "INFERRED",
        reason: "missing_quote",
        details: "Field marked FOUND had no verbatim evidence quote.",
      });
      continue;
    }

    const quote = field.evidence_quote.trim();
    const wordCount = countWords(quote);

    // Check 2: Evidence quote under 25 words
    if (wordCount > 25) {
      field.status = "INFERRED";
      stats.totalDowngrades++;
      stats.downgradeReasons.quote_too_long++;
      stats.fieldDowngrades.push({
        field: key,
        originalStatus: "FOUND",
        newStatus: "INFERRED",
        reason: "quote_too_long",
        details: `Evidence quote exceeds 25 words (${wordCount} words): "${quote.slice(0, 40)}..."`,
      });
      continue;
    }

    // Check 3: Evidence quote must be a substring of that field's OWN source_url page
    const sourceUrl = field.source_url;
    if (!sourceUrl) {
      field.status = "INFERRED";
      stats.totalDowngrades++;
      stats.downgradeReasons.quote_not_in_page++;
      stats.fieldDowngrades.push({
        field: key,
        originalStatus: "FOUND",
        newStatus: "INFERRED",
        reason: "quote_not_in_page",
        details: "Field has evidence_quote but missing source_url.",
      });
      continue;
    }

    const normSourceUrl = sourceUrl.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
    const pageText = pageMap.get(normSourceUrl);
    const normQuote = normalizeText(quote);

    let isSubstring = Boolean(pageText && pageText.includes(normQuote));

    if (!isSubstring) {
      field.status = "INFERRED";
      stats.totalDowngrades++;
      stats.downgradeReasons.quote_not_in_page++;
      stats.fieldDowngrades.push({
        field: key,
        originalStatus: "FOUND",
        newStatus: "INFERRED",
        reason: "quote_not_in_page",
        details: `Evidence quote "${quote}" is not a verbatim substring of scraped page markdown.`,
      });
      continue;
    }

    // Check 4: Every phone number, email, URL, and number in value must appear in evidence_quote
    const tokens = extractTokensToCheck(field.value);
    const missingTokens: string[] = [];
    for (const token of tokens) {
      if (!tokenAppearsInQuote(token, normQuote)) {
        missingTokens.push(token);
      }
    }

    if (missingTokens.length > 0) {
      field.status = "INFERRED";
      stats.totalDowngrades++;
      stats.downgradeReasons.value_token_not_in_quote++;
      stats.fieldDowngrades.push({
        field: key,
        originalStatus: "FOUND",
        newStatus: "INFERRED",
        reason: "value_token_not_in_quote",
        details: `Tokens [${missingTokens.join(", ")}] appear in value but are absent from evidence_quote.`,
      });
      continue;
    }
  }

  // Also verify answered_on_site FAQs
  if (fields.patient_faqs && Array.isArray(fields.patient_faqs.answered_on_site)) {
    for (const faq of fields.patient_faqs.answered_on_site) {
      if (faq.evidence_quote) {
        const normQuote = normalizeText(faq.evidence_quote);
        let foundInPages = false;
        for (const [, text] of pageMap.entries()) {
          if (text.includes(normQuote)) {
            foundInPages = true;
            break;
          }
        }
        if (!foundInPages) {
          // If quote not in scraped page, convert to inferred gap
          fields.patient_faqs.gaps.push({
            question: faq.question,
            status: "INFERRED",
          });
        }
      }
    }
  }

  return {
    verifiedFields: fields,
    stats,
  };
}
