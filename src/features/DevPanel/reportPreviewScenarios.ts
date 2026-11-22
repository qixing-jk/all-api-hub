/** Page-local preview inputs shared by the report builders and dev controls. */
export const REPORT_PREVIEW_SCENARIOS = {
  Standard: "standard",
  Mixed: "mixed",
  Empty: "empty",
} as const

export type ReportPreviewScenario =
  (typeof REPORT_PREVIEW_SCENARIOS)[keyof typeof REPORT_PREVIEW_SCENARIOS]
