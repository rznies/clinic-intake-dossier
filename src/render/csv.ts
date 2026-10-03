import { TaskRow } from "../types/dossier.js";

/**
 * Escapes CSV field value according to RFC 4180.
 */
function escapeCsvValue(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * Converts array of TaskRows into CSV string with header: client,item,owner,next_action,due,status
 */
export function formatTasksCsv(tasks: TaskRow[]): string {
  const header = "client,item,owner,next_action,due,status";
  const rows = tasks.map((t) =>
    [
      escapeCsvValue(t.client),
      escapeCsvValue(t.item),
      escapeCsvValue(t.owner),
      escapeCsvValue(t.next_action),
      escapeCsvValue(t.due),
      escapeCsvValue(t.status),
    ].join(",")
  );

  return [header, ...rows].join("\n");
}
