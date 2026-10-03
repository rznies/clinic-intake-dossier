import { z } from "zod";

export const FieldStatusSchema = z.enum(["FOUND", "INFERRED", "MISSING"]);
export type FieldStatus = z.infer<typeof FieldStatusSchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

// Generic dossier field schema
export function createFieldSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    status: FieldStatusSchema,
    source_url: z.string().nullable().optional(),
    evidence_quotes: z.array(z.string()).max(3).default([]),
    evidence_quote: z.string().nullable().optional(),
    confidence: ConfidenceSchema,
  });
}

// 1. Clinic Name
export const ClinicNameFieldSchema = createFieldSchema(z.string().nullable());

// 2. Doctor Name and Qualifications
export const DoctorItemSchema = z.object({
  name: z.string().describe("Doctor's full name, e.g. Dr. Abraham Hoellrich"),
  title: z.string().optional().nullable().describe("Professional clinical title only, e.g. Dentist, DDS. No marketing claims."),
  qualifications: z.array(z.string()).default([]).describe("Degrees and clinical credentials only, e.g. ['DDS', 'MD']"),
  quote: z.string().optional().nullable().describe("Verbatim quote under 25 words mentioning this doctor on the page"),
});
export const DoctorFieldSchema = createFieldSchema(z.array(DoctorItemSchema).max(8).default([]));

// 3. Specialty
export const SpecialtyFieldSchema = createFieldSchema(z.array(z.string()).default([]));

// 4. Services / Procedures
export const ServiceItemSchema = z.object({
  name: z.string().describe("Name of the service or procedure"),
  category: z.string().optional().nullable().describe("Category, e.g. Preventative, Cosmetic, Surgery"),
  description: z.string().optional().nullable().describe("Concise summary under 30 words"),
});
export const ServicesFieldSchema = createFieldSchema(z.array(ServiceItemSchema).max(12).default([]));

// 5. Location
export const LocationValueSchema = z.object({
  address: z.string().optional().nullable().describe("Street address only, e.g. 1220 Grandview Avenue"),
  city: z.string().optional().nullable().describe("City name only, e.g. Columbus"),
  state: z.string().optional().nullable().describe("State code or name only, e.g. OH"),
  postal_code: z.string().optional().nullable().describe("ZIP/Postal code only, e.g. 43212"),
  country: z.string().optional().nullable().describe("Country name, e.g. USA"),
});
export const LocationFieldSchema = createFieldSchema(LocationValueSchema.nullable());

// 6. Languages Spoken
export const LanguagesFieldSchema = createFieldSchema(z.array(z.string()).default([]));

// 7. Contact and Booking Channels
export const ContactChannelsValueSchema = z.object({
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  booking_url: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  emergency_note: z.string().optional().nullable(),
});
export const ContactChannelsFieldSchema = createFieldSchema(ContactChannelsValueSchema.nullable());

// 8. Hours
export const HoursValueSchema = z.object({
  monday: z.string().optional().nullable(),
  tuesday: z.string().optional().nullable(),
  wednesday: z.string().optional().nullable(),
  thursday: z.string().optional().nullable(),
  friday: z.string().optional().nullable(),
  saturday: z.string().optional().nullable(),
  sunday: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export const HoursFieldSchema = createFieldSchema(HoursValueSchema.nullable());

// 9. Social Links
export const SocialLinkItemSchema = z.object({
  platform: z.string(),
  url: z.string(),
});
export const SocialLinksFieldSchema = createFieldSchema(z.array(SocialLinkItemSchema).max(8).default([]));

// 10. Existing Photos / Videos Found
export const MediaAssetItemSchema = z.object({
  type: z.enum(["headshot", "clinic_photo", "procedure_photo", "video_tour", "youtube_video", "logo", "other"]),
  url: z.string().optional().nullable(),
  description: z.string().describe("Concise asset description under 20 words"),
});
export const MediaAssetsFieldSchema = createFieldSchema(z.array(MediaAssetItemSchema).max(10).default([]));

// 11. Tone & Positioning Signals (INFERRED allowed)
export const TonePositioningValueSchema = z.object({
  brand_tone: z.string().describe("e.g. clinical, warm, luxury, family-friendly"),
  target_audience: z.string().describe("e.g. anxious patients, cosmetic-focused, families"),
  differentiators: z.array(z.string()).default([]),
  aesthetic_style: z.string().optional().nullable(),
});
export const TonePositioningFieldSchema = createFieldSchema(TonePositioningValueSchema.nullable());

// 12. Approval Contact (MISSING unless stated)
export const ApprovalContactValueSchema = z.object({
  name: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});
export const ApprovalContactFieldSchema = createFieldSchema(ApprovalContactValueSchema.nullable());

// 13. Recording Readiness (MISSING unless stated)
export const RecordingReadinessValueSchema = z.object({
  is_ready: z.boolean().default(false),
  has_microphone: z.boolean().optional().nullable(),
  has_quiet_space: z.boolean().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export const RecordingReadinessFieldSchema = createFieldSchema(RecordingReadinessValueSchema.nullable());

// 14. Patient FAQs
export const AnsweredFAQSchema = z.object({
  question: z.string(),
  answer_summary: z.string().describe("Concise summary under 30 words"),
  source_url: z.string(),
  evidence_quote: z.string(),
});

export const FAQGapSchema = z.object({
  question: z.string(),
  status: z.literal("INFERRED"),
});

export const PatientFAQsSchema = z.object({
  answered_on_site: z.array(AnsweredFAQSchema).max(5).default([]),
  gaps: z.array(FAQGapSchema).min(3).max(5).default([]),
});

// 15. Reel Hooks
export const ReelHookSchema = z.object({
  text: z.string(),
  source_url: z.string().nullable(),
  status: z.enum(["FOUND", "INFERRED"]),
  needs_clinical_review: z.literal(true),
});

// Complete Extraction Output Schema (from LLM)
export const ExtractionOutputSchema = z.object({
  clinic_name: ClinicNameFieldSchema,
  doctor_name_and_qualifications: DoctorFieldSchema,
  specialty: SpecialtyFieldSchema,
  services_procedures: ServicesFieldSchema,
  location: LocationFieldSchema,
  languages: LanguagesFieldSchema,
  contact_booking_channels: ContactChannelsFieldSchema,
  hours: HoursFieldSchema,
  social_links: SocialLinksFieldSchema,
  existing_media_assets: MediaAssetsFieldSchema,
  tone_positioning_signals: TonePositioningFieldSchema,
  approval_contact: ApprovalContactFieldSchema,
  recording_readiness: RecordingReadinessFieldSchema,
  patient_faqs: PatientFAQsSchema,
  reel_hooks: z.array(ReelHookSchema).min(5).max(5),
});

export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

// Missing Item & Gap schema
export interface MissingItem {
  key: string;
  label: string;
  blocking_reason: string;
  who_to_ask: string;
  whatsapp_draft: string;
  target_field: string;
}

// Tasks CSV Row schema
export interface TaskRow {
  client: string;
  item: string;
  owner: string;
  next_action: string;
  due: string;
  status: string;
}

// Complete Final Dossier Schema
export interface DossierRecord {
  url: string;
  run_date: string;
  gemini_model: string;
  status_header: string;
  summary_counts: {
    found: number;
    inferred: number;
    missing: number;
    verifier_downgrades: number;
    faq_gaps: number;
    blockers: number;
    drafts_ready: number;
    ready_for_strategy: boolean;
    strategy_blockers_reason: string;
  };
  downgrade_summary: {
    total_downgrades: number;
    quote_not_found: number;
    phone_digits_derived: number;
    value_token_missing: number;
  };
  downgrades_detail: Array<{
    field: string;
    originalStatus: string;
    newStatus: string;
    category: "quote_not_found" | "phone_digits_derived" | "value_token_missing";
    normalizedQuote: string;
    nearestSnippet: string;
    details: string;
  }>;
  fields: ExtractionOutput;
  missing_items: MissingItem[];
  tasks: TaskRow[];
  pages_scraped: Array<{ url: string; title?: string; char_count: number }>;
  credits_used: number;
  tokens_used: { input: number; output: number; total: number };
  warnings: string[];
}
