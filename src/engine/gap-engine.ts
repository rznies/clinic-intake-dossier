import fs from "fs/promises";
import path from "path";
import { ExtractionOutput, MissingItem, TaskRow } from "../types/dossier.js";
import { VerificationStats } from "./verifier.js";

interface RequirementConfig {
  key: string;
  label: string;
  target_field: string;
  check_type: string;
  blocking_reason: string;
  who_to_ask: string;
  whatsapp_template: string;
  status: string;
}

interface RequirementsConfigFile {
  version: string;
  note: string;
  requirements: RequirementConfig[];
}

export interface GapEngineResult {
  missingItems: MissingItem[];
  tasks: TaskRow[];
  summaryCounts: {
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
  statusHeader: string;
}

/**
 * Calculates +2 working days (skips Saturday and Sunday).
 */
function getPlusTwoWorkingDays(startDate: Date = new Date()): string {
  const d = new Date(startDate);
  let addedDays = 0;
  while (addedDays < 2) {
    d.setDate(d.getDate() + 1);
    const dayOfWeek = d.getDay();
    // 0 is Sunday, 6 is Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      addedDays++;
    }
  }
  return d.toISOString().split("T")[0];
}

/**
 * Evaluates verified dossier against onboarding requirements configuration.
 * Generates gap checklist, drafted WhatsApp messages, tasks.csv rows, and status header.
 */
export async function evaluateGapsAndTasks(
  verifiedFields: ExtractionOutput,
  verificationStats: VerificationStats,
  configPath: string = path.resolve(process.cwd(), "requirements.config.json")
): Promise<GapEngineResult> {
  const rawConfig = await fs.readFile(configPath, "utf8");
  const config = JSON.parse(rawConfig) as RequirementsConfigFile;

  const clinicName = verifiedFields.clinic_name?.value || "the clinic";
  const doctors = verifiedFields.doctor_name_and_qualifications?.value || [];
  const leadDoctor = doctors.length > 0 ? doctors[0].name.replace(/^Dr\.?\s*/i, "") : "Doctor";
  const contactName = "Team";

  const missingItems: MissingItem[] = [];
  const tasks: TaskRow[] = [];
  const dueDate = getPlusTwoWorkingDays();

  for (const req of config.requirements) {
    let satisfied = false;

    switch (req.check_type) {
      case "has_headshot": {
        const assets = verifiedFields.existing_media_assets?.value || [];
        satisfied = assets.some(
          (a) => a.type === "headshot" && a.url && a.url.startsWith("http")
        );
        break;
      }
      case "has_booking_channel": {
        const contact = verifiedFields.contact_booking_channels?.value;
        satisfied = Boolean(
          contact && (contact.booking_url || contact.whatsapp || contact.phone)
        );
        break;
      }
      case "has_approval_contact": {
        satisfied =
          verifiedFields.approval_contact?.status === "FOUND" &&
          Boolean(verifiedFields.approval_contact?.value?.name);
        break;
      }
      case "has_recording_readiness": {
        satisfied =
          verifiedFields.recording_readiness?.status === "FOUND" &&
          Boolean(verifiedFields.recording_readiness?.value?.is_ready);
        break;
      }
      case "has_logo": {
        const assets = verifiedFields.existing_media_assets?.value || [];
        satisfied = assets.some(
          (a) => a.type === "logo" && a.url && a.url.startsWith("http")
        );
        break;
      }
      default:
        satisfied = false;
    }

    if (!satisfied) {
      // Draft personalized WhatsApp message
      const draft = req.whatsapp_template
        .replace(/\{doctor_name\}/g, leadDoctor)
        .replace(/\{clinic_name\}/g, clinicName)
        .replace(/\{contact_name\}/g, contactName);

      missingItems.push({
        key: req.key,
        label: req.label,
        blocking_reason: req.blocking_reason,
        who_to_ask: req.who_to_ask,
        whatsapp_draft: draft,
        target_field: req.target_field,
      });

      tasks.push({
        client: clinicName,
        item: req.label,
        owner: "Operations Coordinator",
        next_action: `Send WhatsApp request to ${req.who_to_ask}`,
        due: dueDate,
        status: "OPEN",
      });
    }
  }

  // Count core fields status (13 core fields)
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

  let foundCount = 0;
  let inferredCount = 0;
  let missingCount = 0;

  for (const k of coreFieldKeys) {
    const f = verifiedFields[k] as any;
    if (f?.status === "FOUND") foundCount++;
    else if (f?.status === "INFERRED") inferredCount++;
    else missingCount++;
  }

  const faqGapsCount = verifiedFields.patient_faqs?.gaps?.length || 0;
  const blockersCount = missingItems.length;
  const draftsReadyCount = missingItems.length;
  const readyForStrategy = blockersCount === 0;

  let strategyBlockersReason = "";
  if (!readyForStrategy) {
    const blockingLabels = missingItems.map((m) => m.label).slice(0, 2).join(" & ");
    strategyBlockersReason = `Pending ${blockersCount} onboarding items (${blockingLabels}${missingItems.length > 2 ? "..." : ""})`;
  } else {
    strategyBlockersReason = "All critical onboarding assets satisfied";
  }

  // Format canonical status header
  // "X of 13 found, Y inferred, Z missing, D verifier downgrades, FAQ gaps: G, B blockers, W drafts ready. Ready for strategy: [true|false] (reason)"
  const statusHeader = `${foundCount} of 13 found, ${inferredCount} inferred, ${missingCount} missing, ${verificationStats.totalDowngrades} verifier downgrades, FAQ gaps: ${faqGapsCount}, ${blockersCount} blockers, ${draftsReadyCount} drafts ready. Ready for strategy: ${readyForStrategy} (${strategyBlockersReason})`;

  return {
    missingItems,
    tasks,
    summaryCounts: {
      found: foundCount,
      inferred: inferredCount,
      missing: missingCount,
      verifier_downgrades: verificationStats.totalDowngrades,
      faq_gaps: faqGapsCount,
      blockers: blockersCount,
      drafts_ready: draftsReadyCount,
      ready_for_strategy: readyForStrategy,
      strategy_blockers_reason: strategyBlockersReason,
    },
    statusHeader,
  };
}
