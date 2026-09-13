import { REPO_URL } from "~/constants/about"
import type { AccountSiteType } from "~/constants/siteType"
import type { AuthConfig } from "~/services/apiTransport/type"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASONS,
  CHECKIN_RESULT_STATUSES,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import type { CheckInConfig } from "~/types/checkIn"

import { formatDiagnosticSection } from "./diagnosticSection"

export interface CheckInFeedbackSnapshot {
  siteType: AccountSiteType
  baseUrl: string
  authType?: AuthConfig["authType"]
  checkIn: CheckInConfig
  execution?: Pick<CheckinAccountResult, "status" | "reasonCode"> &
    Partial<
      Pick<
        CheckinAccountResult,
        "timestamp" | "messageKey" | "messageParams" | "rawMessage" | "message"
      >
    >
}

/** Keeps only the deployment origin; malformed and non-web addresses are omitted. */
export function getFeedbackOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) ? url.origin : null
  } catch {
    return null
  }
}

/** Omits absent or invalid persisted timestamps from public diagnostics. */
function formatRecordedAt(timestamp: number | undefined): string | undefined {
  if (typeof timestamp !== "number") return undefined
  const date = new Date(timestamp)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

/** Builds technical hints from selected fields, without serializing an account. */
export function buildCheckInFeedbackDetails(
  input: CheckInFeedbackSnapshot,
  app: { version: string; platform: string; executionMessage?: string },
): string {
  const inspection = inspectAccountCheckIn({
    config: input.checkIn,
    siteType: input.siteType,
    siteUrl: input.baseUrl,
  })
  const selection = inspection.selectionState
  const executionRecordedAt = formatRecordedAt(input.execution?.timestamp)
  return [
    `app: ${app.version} (${app.platform})`,
    `siteType: ${input.siteType}`,
    `authentication: ${input.authType && Object.values(AuthTypeEnum).includes(input.authType) ? input.authType : "unavailable"}`,
    `automaticExecutionEnabled: ${input.checkIn.automaticExecutionEnabled === true}`,
    ...(input.execution &&
    CHECKIN_RESULT_STATUSES.includes(input.execution.status)
      ? [
          `execution: ${input.execution.status}`,
          ...(app.executionMessage
            ? [`executionMessage: ${app.executionMessage}`]
            : []),
          ...(executionRecordedAt
            ? [`executionRecordedAt: ${executionRecordedAt}`]
            : []),
          ...(input.execution.reasonCode &&
          AUTO_CHECKIN_SKIP_REASONS.includes(input.execution.reasonCode)
            ? [`executionReason: ${input.execution.reasonCode}`]
            : []),
        ]
      : ["execution: unavailable"]),
    `discovery: ${inspection.decision.outcome}`,
    `selectionMode: ${selection.mode}`,
    `selectionStatus: ${selection.status}${selection.status === "stale" ? ` (${selection.reason})` : selection.status === "selected" ? ` (${selection.methodId})` : ""}`,
    "methods:",
    ...(inspection.choices.length
      ? inspection.choices.map((choice) => {
          const knowledge =
            input.checkIn.methodKnowledge.methods[choice.methodId]
          const detection = knowledge?.detection
          const reason =
            detection?.outcome === "unknown"
              ? detection.reason
              : detection?.lastUnknownAttempt?.reason
          const status = knowledge?.status
          const statusDetails =
            status?.outcome === "known"
              ? `known; availability: ${status.availability === "enabled" || status.availability === "disabled" ? status.availability : "unknown"}; today: ${status.today === "checked" || status.today === "not_checked" ? status.today : "unknown"}`
              : status?.outcome === "unknown"
                ? "unknown"
                : "not_inspected"
          const observedAt =
            status?.outcome === "known" && "observedAt" in status.evidence
              ? status.evidence.observedAt
              : status?.outcome === "unknown"
                ? status.attemptedAt
                : undefined
          const recordedAt = formatRecordedAt(observedAt)
          return [
            `  - ${choice.methodId}: ${detection ? choice.detectionOutcome : "not_inspected"}${reason ? ` (${reason})` : ""}`,
            `    savedStatus: ${statusDetails}${recordedAt ? `; recordedAt: ${recordedAt}` : ""}`,
          ].join("\n")
        })
      : ["  - no_registered_candidates"]),
  ].join("\n")
}

/** Assembles the visible sections, keeping diagnostic values literal. */
export function composeCheckInFeedback(input: {
  origin: string | null
  notes: string
  details: string
  clues: string
  labels: { site: string; problem: string; details: string; clues: string }
}): string {
  return [
    input.notes.trim() ? `## ${input.labels.problem}\n\n${input.notes}` : "",
    input.origin ? `## ${input.labels.site}\n\n${input.origin}` : "",
    formatDiagnosticSection(input.labels.details, input.details),
    formatDiagnosticSection(input.labels.clues, input.clues),
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** Uses the dedicated Markdown template; oversized content stays available for copying. */
export function buildCheckInFeedbackIssue(body: string, title: string) {
  const url = new URL(`${REPO_URL}/issues/new`)
  // GitHub supports template + body query parameters; blank issues are disabled here.
  // https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue
  url.searchParams.set("template", "checkin_adaptation.md")
  url.searchParams.set("title", title)
  url.searchParams.set("body", body)
  const needsCopy = url.href.length > 6000
  if (needsCopy) url.searchParams.delete("body")
  return { url: url.href, needsCopy }
}
