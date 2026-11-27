import type { CheckInEvidence } from "~/services/checkin/discovery/evidence/scanTypes"

/** Formats only bounded scan facts for the editable report. */
export function formatCheckInFeedbackClues(clues: CheckInEvidence): string {
  return [
    `scan: ${clues.status}`,
    ...(clues.authenticatedQueriesUnavailable
      ? ["authenticated_status: unavailable"]
      : []),
    ...clues.statusQueries.map(
      (query) =>
        `GET ${query.path}: ${query.status ?? "unavailable"}${query.keys.length ? `; keys: ${query.keys.join(", ")}` : "; shape: unknown"}`,
    ),
    ...(clues.resources
      ? [`resources: ${clues.resources.scanned}/${clues.resources.discovered}`]
      : []),
    ...(clues.resources?.skipped
      ? [`unloaded_resources_skipped: ${clues.resources.skipped}`]
      : []),
    ...(clues.issues?.length ? [`scan_notes: ${clues.issues.join(", ")}`] : []),
    ...(clues.keywords?.length
      ? [`keywords: ${clues.keywords.join(", ")}`]
      : []),
    ...clues.routes.map((path) => `route_hint: ${path}`),
  ].join("\n")
}
