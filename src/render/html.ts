import { DossierRecord } from "../types/dossier.js";

/**
 * Escapes HTML characters for safe rendering.
 */
function escapeHtml(str: any): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Returns a CSS badge for field status.
 */
function getStatusBadge(status: string): string {
  const s = (status || "").toUpperCase();
  if (s === "FOUND") {
    return `<span class="badge badge-found">FOUND</span>`;
  }
  if (s === "INFERRED") {
    return `<span class="badge badge-inferred">INFERRED</span>`;
  }
  return `<span class="badge badge-missing">MISSING</span>`;
}

/**
 * Formats complex or primitive values cleanly into HTML.
 */
function formatFieldValue(val: any): string {
  if (val === null || val === undefined) {
    return `<span class="text-muted italic">Not found on public site</span>`;
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return `<span class="text-muted italic">None identified</span>`;
    // Array of doctor objects
    if (val[0] && typeof val[0] === "object" && "name" in val[0]) {
      return `<ul class="list-disc pl-5 space-y-1">
        ${val
          .map(
            (d) =>
              `<li><strong>${escapeHtml(d.name)}</strong>${
                d.title ? ` &mdash; <span class="text-slate-600">${escapeHtml(d.title)}</span>` : ""
              }${
                d.qualifications && d.qualifications.length > 0
                  ? ` <span class="text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">${escapeHtml(
                      d.qualifications.join(", ")
                    )}</span>`
                  : ""
              }${d.bio_summary ? `<p class="text-xs text-slate-500 mt-0.5">${escapeHtml(d.bio_summary)}</p>` : ""}</li>`
          )
          .join("")}
      </ul>`;
    }

    // Array of services
    if (val[0] && typeof val[0] === "object" && "name" in val[0] && "description" in val[0]) {
      return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        ${val
          .map(
            (s) =>
              `<div class="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs">
                <span class="font-semibold text-slate-800">${escapeHtml(s.name)}</span>
                ${s.category ? `<span class="ml-1 text-[10px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded">${escapeHtml(s.category)}</span>` : ""}
                ${s.description ? `<p class="text-slate-500 mt-1">${escapeHtml(s.description)}</p>` : ""}
              </div>`
          )
          .join("")}
      </div>`;
    }

    // Array of social links
    if (val[0] && typeof val[0] === "object" && "platform" in val[0] && "url" in val[0]) {
      return `<div class="flex flex-wrap gap-2">
        ${val
          .map(
            (s) =>
              `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 px-2 py-1 rounded">
                ${escapeHtml(s.platform)} &nearr;
              </a>`
          )
          .join("")}
      </div>`;
    }

    // Array of media assets
    if (val[0] && typeof val[0] === "object" && "type" in val[0]) {
      return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        ${val
          .map(
            (m) =>
              `<div class="p-2 rounded bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                <div>
                  <span class="font-medium text-slate-800 uppercase text-[10px] bg-slate-200 px-1 py-0.5 rounded mr-1.5">${escapeHtml(m.type)}</span>
                  <span class="text-slate-600">${escapeHtml(m.description)}</span>
                </div>
                ${m.url ? `<a href="${escapeHtml(m.url)}" target="_blank" class="text-blue-600 hover:underline text-[11px] ml-2">View &nearr;</a>` : ""}
              </div>`
          )
          .join("")}
      </div>`;
    }

    // Simple string array
    return `<div class="flex flex-wrap gap-1.5">
      ${val.map((item) => `<span class="inline-block text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded">${escapeHtml(item)}</span>`).join("")}
    </div>`;
  }

  // Object values (location, contact, tone, hours)
  if (typeof val === "object") {
    // Location
    if ("address" in val || "city" in val) {
      const parts = [val.address, val.city, val.state, val.postal_code, val.country].filter(Boolean);
      return `<span class="text-sm text-slate-800">${escapeHtml(parts.join(", "))}</span>`;
    }

    // Contact
    if ("phone" in val || "email" in val || "booking_url" in val) {
      return `<div class="space-y-1 text-xs">
        ${val.phone ? `<div><span class="font-medium text-slate-500">Phone:</span> <a href="tel:${escapeHtml(val.phone)}" class="text-blue-600 font-mono">${escapeHtml(val.phone)}</a></div>` : ""}
        ${val.email ? `<div><span class="font-medium text-slate-500">Email:</span> <a href="mailto:${escapeHtml(val.email)}" class="text-blue-600 font-mono">${escapeHtml(val.email)}</a></div>` : ""}
        ${val.booking_url ? `<div><span class="font-medium text-slate-500">Booking:</span> <a href="${escapeHtml(val.booking_url)}" target="_blank" class="text-blue-600 underline">${escapeHtml(val.booking_url)}</a></div>` : ""}
        ${val.whatsapp ? `<div><span class="font-medium text-slate-500">WhatsApp:</span> <span class="font-mono">${escapeHtml(val.whatsapp)}</span></div>` : ""}
        ${val.emergency_note ? `<div class="text-amber-700 bg-amber-50 p-1.5 rounded mt-1">${escapeHtml(val.emergency_note)}</div>` : ""}
      </div>`;
    }

    // Hours
    if ("monday" in val || "tuesday" in val || "notes" in val) {
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
        ${days
          .map((d) => {
            const h = val[d];
            return `<div class="bg-slate-50 p-1.5 rounded border border-slate-100">
              <span class="uppercase text-[10px] text-slate-400 font-bold block">${d.slice(0, 3)}</span>
              <span class="text-slate-700">${h ? escapeHtml(h) : "Closed"}</span>
            </div>`;
          })
          .join("")}
      </div>`;
    }

    // Tone & positioning
    if ("brand_tone" in val || "target_audience" in val) {
      return `<div class="space-y-1 text-xs">
        <div><span class="font-semibold text-slate-700">Tone:</span> ${escapeHtml(val.brand_tone)}</div>
        <div><span class="font-semibold text-slate-700">Target Audience:</span> ${escapeHtml(val.target_audience)}</div>
        ${val.differentiators && val.differentiators.length > 0 ? `<div><span class="font-semibold text-slate-700">Differentiators:</span> ${escapeHtml(val.differentiators.join(" • "))}</div>` : ""}
      </div>`;
    }

    return `<pre class="text-xs bg-slate-50 p-2 rounded">${escapeHtml(JSON.stringify(val, null, 2))}</pre>`;
  }

  return `<span class="text-sm text-slate-800">${escapeHtml(val)}</span>`;
}

/**
 * Renders a single dossier field row.
 */
function renderFieldRow(label: string, field: any): string {
  if (!field) {
    return `
    <tr class="border-b border-slate-100 hover:bg-slate-50/50">
      <td class="py-3 px-4 font-medium text-slate-700 text-sm align-top w-1/4">${escapeHtml(label)}</td>
      <td class="py-3 px-4 align-top w-24"><span class="badge badge-missing">MISSING</span></td>
      <td class="py-3 px-4 text-sm text-slate-500 italic align-top" colspan="2">Not found</td>
    </tr>`;
  }

  const statusBadge = getStatusBadge(field.status);
  const valueHtml = formatFieldValue(field.value);

  const quotes: string[] = [];
  if (Array.isArray(field.evidence_quotes) && field.evidence_quotes.length > 0) {
    quotes.push(...field.evidence_quotes.filter(Boolean));
  } else if (field.evidence_quote) {
    quotes.push(field.evidence_quote);
  }

  const quotesHtml =
    quotes.length > 0
      ? `<div class="mt-2 space-y-1.5">
          ${quotes
            .map(
              (q) =>
                `<div class="text-xs text-slate-600 bg-slate-50 p-2 rounded border-l-2 border-emerald-500 italic">&ldquo;${escapeHtml(
                  q
                )}&rdquo;</div>`
            )
            .join("")}
          ${
            field.source_url
              ? `<div class="not-italic"><a href="${escapeHtml(
                  field.source_url
                )}" target="_blank" class="text-blue-600 hover:underline text-[11px]">&rarr; Source Page</a></div>`
              : ""
          }
        </div>`
      : "";

  return `
  <tr class="border-b border-slate-100 hover:bg-slate-50/50">
    <td class="py-3.5 px-4 font-medium text-slate-800 text-sm align-top w-1/4">${escapeHtml(label)}</td>
    <td class="py-3.5 px-4 align-top w-28">${statusBadge}</td>
    <td class="py-3.5 px-4 text-sm text-slate-800 align-top">
      ${valueHtml}
      ${quotesHtml}
    </td>
  </tr>`;
}

/**
 * Renders complete HTML page for a dossier.
 */
export function renderDossierHtml(dossier: DossierRecord): string {
  const fields = dossier.fields;
  const missing = dossier.missing_items || [];
  const hooks = fields.reel_hooks || [];
  const faqs = fields.patient_faqs || { answered_on_site: [], gaps: [] };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clinic Intake Dossier - ${escapeHtml(fields.clinic_name?.value || dossier.url)}</title>
  <style>
    /* Embed minimal Tailwind-compatible styles */
    *, ::before, ::after { box-sizing: border-box; border-width: 0; border-style: solid; border-color: #e2e8f0; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f8fafc; color: #1e293b; line-height: 1.5; }
    .max-w-6xl { max-width: 72rem; }
    .mx-auto { margin-left: auto; margin-right: auto; }
    .p-4 { padding: 1rem; }
    .p-6 { padding: 1.5rem; }
    .p-3 { padding: 0.75rem; }
    .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
    .py-3\\.5 { padding-top: 0.875rem; padding-bottom: 0.875rem; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .mt-1 { margin-top: 0.25rem; }
    .mt-2 { margin-top: 0.5rem; }
    .mt-4 { margin-top: 1rem; }
    .mt-6 { margin-top: 1.5rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .space-y-4 > * + * { margin-top: 1rem; }
    .space-y-6 > * + * { margin-top: 1.5rem; }
    .flex { display: flex; }
    .inline-flex { display: inline-flex; }
    .grid { display: grid; }
    .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-2 { gap: 0.5rem; }
    .gap-3 { gap: 0.75rem; }
    .gap-4 { gap: 1rem; }
    .bg-white { background-color: #ffffff; }
    .bg-slate-50 { background-color: #f8fafc; }
    .bg-slate-100 { background-color: #f1f5f9; }
    .bg-slate-800 { background-color: #1e293b; }
    .bg-emerald-50 { background-color: #ecfdf5; }
    .bg-amber-50 { background-color: #fffbeb; }
    .bg-rose-50 { background-color: #fff1f2; }
    .border { border-width: 1px; }
    .border-b { border-bottom-width: 1px; }
    .border-slate-200 { border-color: #e2e8f0; }
    .border-emerald-200 { border-color: #a7f3d0; }
    .border-amber-200 { border-color: #fde68a; }
    .border-rose-200 { border-color: #fecdd3; }
    .rounded-lg { border-radius: 0.5rem; }
    .rounded-md { border-radius: 0.375rem; }
    .rounded { border-radius: 0.25rem; }
    .rounded-full { border-radius: 9999px; }
    .shadow-sm { box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
    .font-semibold { font-weight: 600; }
    .font-medium { font-weight: 500; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .text-xs { font-size: 0.75rem; line-height: 1rem; }
    .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
    .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
    .text-xl { font-size: 1.25rem; line-height: 1.75rem; }
    .text-2xl { font-size: 1.5rem; line-height: 2rem; }
    .text-slate-500 { color: #64748b; }
    .text-slate-600 { color: #475569; }
    .text-slate-700 { color: #334155; }
    .text-slate-800 { color: #1e293b; }
    .text-emerald-700 { color: #047857; }
    .text-amber-800 { color: #92400e; }
    .text-rose-700 { color: #be123c; }
    .text-blue-600 { color: #2563eb; }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-radius: 9999px; letter-spacing: 0.025em; text-transform: uppercase; }
    .badge-found { background-color: #d1fae5; color: #065f46; }
    .badge-inferred { background-color: #fef3c7; color: #92400e; }
    .badge-missing { background-color: #ffe4e6; color: #9f1239; }
    .sticky-header { position: sticky; top: 0; z-index: 50; backdrop-filter: blur(8px); background-color: rgba(255, 255, 255, 0.95); border-bottom: 2px solid #e2e8f0; }
    table { width: 100%; border-collapse: collapse; }
    @media (min-width: 640px) {
      .sm\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .sm\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .sm\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
  </style>
</head>
<body class="bg-slate-50 pb-16">

  <!-- Sticky Operational Status Header -->
  <header class="sticky-header py-3 px-6 shadow-sm">
    <div class="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="text-xs font-semibold text-slate-500 uppercase tracking-wider">OneHeroAI Clinic Intake Dossier</div>
        <div class="text-base font-bold text-slate-900">${escapeHtml(fields.clinic_name?.value || "Clinic Profile")}</div>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-semibold">${dossier.summary_counts.found} Found</span>
        <span class="px-2.5 py-1 rounded bg-amber-100 text-amber-800 font-semibold">${dossier.summary_counts.inferred} Inferred</span>
        <span class="px-2.5 py-1 rounded bg-rose-100 text-rose-800 font-semibold">${dossier.summary_counts.missing} Missing</span>
        <span class="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-medium">${dossier.summary_counts.verifier_downgrades} Downgrades</span>
        <span class="px-2.5 py-1 rounded bg-purple-100 text-purple-800 font-medium">FAQ Gaps: ${dossier.summary_counts.faq_gaps}</span>
        <span class="px-2.5 py-1 rounded ${dossier.summary_counts.blockers > 0 ? "bg-rose-600 text-white font-bold" : "bg-emerald-600 text-white font-bold"}">
          ${dossier.summary_counts.blockers} Blockers
        </span>
      </div>
    </div>
    <div class="max-w-6xl mx-auto mt-2 text-xs text-slate-600 font-mono bg-slate-100 px-3 py-1.5 rounded flex items-center justify-between">
      <span>Status: <strong>${escapeHtml(dossier.status_header)}</strong></span>
      <span class="text-slate-400">Model: ${escapeHtml(dossier.gemini_model)}</span>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-4 mt-6 space-y-6">

    <!-- Action Tracker & Gaps -->
    <section class="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-bold text-slate-900">1. Onboarding Gap Checklist &amp; Action Plan</h2>
          <p class="text-xs text-slate-500">Every missing item is an owned operational task before recording starts.</p>
        </div>
        <span class="text-xs font-semibold px-2.5 py-1 rounded ${dossier.summary_counts.ready_for_strategy ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}">
          Ready for Strategy Call: ${dossier.summary_counts.ready_for_strategy ? "YES" : "NO"}
        </span>
      </div>

      ${
        missing.length === 0
          ? `<div class="p-4 bg-emerald-50 text-emerald-800 rounded text-sm">All core onboarding inputs are satisfied. Ready to schedule clinic kickoff call.</div>`
          : `<div class="space-y-4">
              ${missing
                .map(
                  (item, i) => `
                <div class="p-4 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-50">
                  <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div class="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <span class="w-5 h-5 rounded-full bg-rose-100 text-rose-700 text-xs flex items-center justify-center font-bold">${i + 1}</span>
                      ${escapeHtml(item.label)}
                    </div>
                    <span class="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">Ask: ${escapeHtml(item.who_to_ask)}</span>
                  </div>
                  <p class="text-xs text-rose-700 mb-3 font-medium">Blocking Reason: ${escapeHtml(item.blocking_reason)}</p>
                  <div class="bg-white p-3 rounded border border-slate-200 text-xs">
                    <div class="flex justify-between items-center text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1">
                      <span>Drafted WhatsApp Message (Human review required)</span>
                      <button onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(item.whatsapp_draft)}')); this.innerText='Copied!';" class="text-blue-600 hover:text-blue-800 text-xs font-semibold cursor-pointer">Copy Draft</button>
                    </div>
                    <div class="text-slate-800 italic font-mono bg-slate-50 p-2 rounded">${escapeHtml(item.whatsapp_draft)}</div>
                  </div>
                </div>`
                )
                .join("")}
            </div>`
      }
    </section>

    <!-- Clinic Public Information Dossier -->
    <section class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div class="p-6 border-b border-slate-100">
        <h2 class="text-lg font-bold text-slate-900">2. Clinical Intake Profile</h2>
        <p class="text-xs text-slate-500">Extracted from public website pages with code-checked verbatim quote substrings.</p>
      </div>

      <div class="overflow-x-auto">
        <table>
          <thead>
            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <th class="py-3 px-4">Field</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4">Value &amp; Grounded Evidence Quote</th>
            </tr>
          </thead>
          <tbody>
            ${renderFieldRow("Clinic Name", fields.clinic_name)}
            ${renderFieldRow("Doctor(s) & Qualifications", fields.doctor_name_and_qualifications)}
            ${renderFieldRow("Specialty", fields.specialty)}
            ${renderFieldRow("Services & Procedures", fields.services_procedures)}
            ${renderFieldRow("Clinic Location", fields.location)}
            ${renderFieldRow("Languages Spoken", fields.languages)}
            ${renderFieldRow("Contact & Booking Channels", fields.contact_booking_channels)}
            ${renderFieldRow("Operating Hours", fields.hours)}
            ${renderFieldRow("Social Links", fields.social_links)}
            ${renderFieldRow("Existing Photos & Videos", fields.existing_media_assets)}
            ${renderFieldRow("Tone & Brand Positioning", fields.tone_positioning_signals)}
            ${renderFieldRow("Clinical Approval Contact", fields.approval_contact)}
            ${renderFieldRow("Recording Readiness Setup", fields.recording_readiness)}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Patient FAQs & FAQ Gaps -->
    <section class="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
      <h2 class="text-lg font-bold text-slate-900 mb-1">3. Patient FAQs &amp; Knowledge Gaps</h2>
      <p class="text-xs text-slate-500 mb-4">Questions answered on the website vs unaddressed clinical questions for the AI Twin.</p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Answered on site -->
        <div class="space-y-3">
          <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Answered On Website (${faqs.answered_on_site.length})
          </h3>
          ${
            faqs.answered_on_site.length === 0
              ? `<p class="text-xs text-slate-400 italic">No answered FAQs found on public site.</p>`
              : faqs.answered_on_site
                  .map(
                    (f) => `
              <div class="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1">
                <div class="font-semibold text-slate-900">${escapeHtml(f.question)}</div>
                <div class="text-slate-600">${escapeHtml(f.answer_summary)}</div>
                <div class="text-[11px] text-slate-400 italic mt-1 border-t border-slate-200 pt-1">
                  &ldquo;${escapeHtml(f.evidence_quote)}&rdquo;
                  <a href="${escapeHtml(f.source_url)}" target="_blank" class="text-blue-600 not-italic ml-1">&rarr; Source</a>
                </div>
              </div>`
                  )
                  .join("")
          }
        </div>

        <!-- FAQ Gaps -->
        <div class="space-y-3">
          <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Clinical FAQ Gaps (${faqs.gaps.length})
          </h3>
          ${
            faqs.gaps.length === 0
              ? `<p class="text-xs text-slate-400 italic">No FAQ gaps noted.</p>`
              : faqs.gaps
                  .map(
                    (g) => `
              <div class="p-3 bg-amber-50/50 rounded border border-amber-200 text-xs">
                <div class="font-medium text-slate-800">${escapeHtml(g.question)}</div>
                <div class="text-[10px] text-amber-800 uppercase font-bold mt-1">Status: Unanswered on site &bull; Coordinator to verify</div>
              </div>`
                  )
                  .join("")
          }
        </div>
      </div>
    </section>

    <!-- 5 Conservative Reel Hook Ideas -->
    <section class="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-bold text-slate-900">4. Educational Video Hook Concepts</h2>
          <p class="text-xs text-slate-500">Conservative, clinically grounded hook ideas. Zero outcome guarantees, zero superlatives.</p>
        </div>
        <span class="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-semibold">5 Concepts</span>
      </div>

      <div class="space-y-3">
        ${hooks
          .map(
            (hook, i) => `
          <div class="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
            <div class="flex items-start justify-between gap-2">
              <span class="font-bold text-slate-900 text-sm">#${i + 1} &ldquo;${escapeHtml(hook.text)}&rdquo;</span>
              <span class="text-[10px] uppercase font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded whitespace-nowrap">Needs Doctor Review: Yes</span>
            </div>
            <div class="text-slate-500 text-[11px] flex items-center gap-3">
              <span>Status: <strong class="text-slate-700">${escapeHtml(hook.status)}</strong></span>
              ${hook.source_url ? `<span>Source: <a href="${escapeHtml(hook.source_url)}" target="_blank" class="text-blue-600 hover:underline">${escapeHtml(hook.source_url)}</a></span>` : ""}
            </div>
          </div>`
          )
          .join("")}
      </div>
    </section>

    <!-- Run Metadata & Pages Scraped -->
    <footer class="bg-white rounded-lg border border-slate-200 p-6 text-xs text-slate-500 space-y-2">
      <div class="flex flex-wrap justify-between items-center gap-2">
        <div><strong>Scraped Target:</strong> <a href="${escapeHtml(dossier.url)}" target="_blank" class="text-blue-600 underline">${escapeHtml(dossier.url)}</a></div>
        <div><strong>Run Date:</strong> ${escapeHtml(dossier.run_date)}</div>
        <div><strong>Tokens:</strong> In ${dossier.tokens_used.input.toLocaleString()} / Out ${dossier.tokens_used.output.toLocaleString()}</div>
      </div>
      <div class="pt-2 border-t border-slate-100">
        <span class="font-medium text-slate-700">Pages Scraped (${dossier.pages_scraped.length}):</span>
        <div class="flex flex-wrap gap-2 mt-1">
          ${dossier.pages_scraped
            .map((p) => `<a href="${escapeHtml(p.url)}" target="_blank" class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] hover:bg-slate-200">${escapeHtml(p.url.replace(/^https?:\/\/[^/]+/, ""))}</a>`)
            .join("")}
        </div>
      </div>
    </footer>

  </main>
</body>
</html>`;
}
