import { ReelHookSchema } from "../types/dossier.js";
import { z } from "zod";

type ReelHook = z.infer<typeof ReelHookSchema>;

export interface HookLintResult {
  valid: boolean;
  violations: string[];
}

export interface LintedHooksResult {
  hooks: ReelHook[];
  totalViolations: number;
  warnings: string[];
}

// Word-boundary based ban regexes
const FORBIDDEN_RULES: Array<{ name: string; regex: RegExp; message: string }> = [
  {
    name: "guarantee",
    regex: /\b(guarantee|guaranteed|guarantees|guaranteeing|promise|promised|promises|promising|100%)\b/i,
    message: "Contains outcome guarantee or promise",
  },
  {
    name: "painless",
    regex: /\b(painless|pain-free|no pain|zero pain|zero discomfort|without pain|completely pain free)\b/i,
    message: "Contains painless claim",
  },
  {
    name: "superlative",
    regex: /\b(best|cure|cures|cured|curing|miracle|#1|number one|top-rated|premier|unbeatable|revolutionary)\b/i,
    message: "Contains medical superlative or cure claim",
  },
  {
    name: "before_after",
    regex: /\b(before and after|transform your smile forever|instant results|guaranteed results)\b/i,
    message: "Contains ungrounded before/after or permanent transformation claim",
  },
];

/**
 * Lints a single hook against compliance rules.
 */
export function lintHook(hook: ReelHook): HookLintResult {
  const violations: string[] = [];

  for (const rule of FORBIDDEN_RULES) {
    if (rule.regex.test(hook.text)) {
      violations.push(`${rule.message} (matched rule: ${rule.name})`);
    }
  }

  if (hook.needs_clinical_review !== true) {
    violations.push("needs_clinical_review must be true");
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Lints and sanitizes all reel hooks.
 * Any hook violating conservative clinical safety rules has violations logged and is sanitized.
 */
export function lintAllHooks(rawHooks: ReelHook[]): LintedHooksResult {
  const warnings: string[] = [];
  let totalViolations = 0;

  const sanitized = rawHooks.slice(0, 5).map((hook, index) => {
    const lintRes = lintHook(hook);
    const cleanedText = hook.text;

    if (!lintRes.valid) {
      totalViolations += lintRes.violations.length;
      warnings.push(`Hook #${index + 1} compliance warning: ${lintRes.violations.join("; ")}`);
    }

    return {
      text: cleanedText,
      source_url: hook.source_url || null,
      status: hook.source_url ? hook.status : "INFERRED",
      needs_clinical_review: true as const,
    };
  });

  return {
    hooks: sanitized,
    totalViolations,
    warnings,
  };
}
