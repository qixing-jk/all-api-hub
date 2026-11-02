import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
import type { AuthConfig } from "~/services/apiTransport/type"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/inspection"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASONS,
  CHECKIN_RESULT_STATUSES,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import type { CheckInConfig } from "~/types/checkIn"

import { formatDiagnosticSection } from "./diagnosticSection"
import {
  CHECKIN_FEEDBACK_ISSUE_LIMITS,
  CHECKIN_FEEDBACK_ISSUE_URL,
  CHECKIN_FEEDBACK_ISSUE_FIELDS as fields,
} from "./githubIssue"

const DIAGNOSTIC_VALUES = {
  Unknown: "unknown",
  NotInspected: "not_inspected",
  Unavailable: "unavailable",
  SavedAccount: "saved_account",
} as const

export interface CheckInFeedbackSnapshot {
  siteType: AccountSiteType
  baseUrl: string
  authType?: AuthConfig["authType"]
  refresh?: Pick<SiteAccount, "health" | "last_sync_time">
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
  app: {
    version: string
    platform: string
    executionMessage?: string
    now?: number
    refreshMessage?: string
  },
): string {
  const inspection = inspectAccountCheckIn({
    config: input.checkIn,
    siteType: input.siteType,
    siteUrl: input.baseUrl,
  })
  const selection = inspection.selectionState
  const executionRecordedAt = formatRecordedAt(input.execution?.timestamp)
  const refreshTime = input.refresh?.last_sync_time
  const refreshRecordedAt =
    refreshTime && refreshTime > 0 ? formatRecordedAt(refreshTime) : undefined
  return [
    "checkInAssessment:",
    `automaticExecutionEnabled: ${input.checkIn.automaticExecutionEnabled === true}`,
    `discovery: ${inspection.decision.outcome}`,
    `selectionMode: ${selection.mode}`,
    `selectionStatus: ${selection.status}${selection.status === CHECK_IN_SELECTION_STATUSES.Stale ? ` (${selection.reason})` : selection.status === CHECK_IN_SELECTION_STATUSES.Selected ? ` (${selection.methodId})` : ""}`,
    "methods:",
    ...(inspection.choices.length
      ? inspection.choices.map((choice) => {
          const knowledge =
            input.checkIn.methodKnowledge.methods[choice.methodId]
          const detection = knowledge?.detection
          const reason =
            detection?.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown
              ? detection.reason
              : detection?.lastUnknownAttempt?.reason
          const status = knowledge?.status
          const statusDetails =
            status?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known
              ? `known; availability: ${status.availability === CHECK_IN_METHOD_AVAILABILITIES.Enabled || status.availability === CHECK_IN_METHOD_AVAILABILITIES.Disabled ? status.availability : DIAGNOSTIC_VALUES.Unknown}; today: ${status.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked || status.today === CHECK_IN_METHOD_TODAY_STATUSES.NotChecked ? status.today : DIAGNOSTIC_VALUES.Unknown}`
              : status?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown
                ? DIAGNOSTIC_VALUES.Unknown
                : DIAGNOSTIC_VALUES.NotInspected
          const observedAt =
            status?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
            "observedAt" in status.evidence
              ? status.evidence.observedAt
              : status?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown
                ? status.attemptedAt
                : undefined
          const recordedAt = formatRecordedAt(observedAt)
          return [
            `  - ${choice.methodId}: ${detection ? choice.detectionOutcome : DIAGNOSTIC_VALUES.NotInspected}${reason ? ` (${reason})` : ""}`,
            `    savedStatus: ${statusDetails}${recordedAt ? `; recordedAt: ${recordedAt}` : ""}`,
          ].join("\n")
        })
      : ["  - no_registered_candidates"]),
    "recentExecution:",
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
      : [`execution: ${DIAGNOSTIC_VALUES.Unavailable}`]),
    "accountRefresh:",
    `accountRefreshSource: ${input.refresh ? DIAGNOSTIC_VALUES.SavedAccount : DIAGNOSTIC_VALUES.Unavailable}`,
    `accountRefreshHealth: ${input.refresh && Object.values(SiteHealthStatus).includes(input.refresh.health.status) ? input.refresh.health.status : DIAGNOSTIC_VALUES.Unknown}`,
    ...(refreshRecordedAt
      ? [
          `accountRefreshRecordedAt: ${refreshRecordedAt}`,
          `accountRefreshAgeSeconds: ${Math.max(0, Math.floor(((app.now ?? Date.now()) - refreshTime!) / 1000))}`,
        ]
      : [`accountRefreshRecordedAt: ${DIAGNOSTIC_VALUES.Unavailable}`]),
    ...(app.refreshMessage
      ? [`accountRefreshMessage: ${app.refreshMessage}`]
      : []),
    `otherApiCapabilities: ${DIAGNOSTIC_VALUES.NotInspected}`,
    "environment:",
    `app: ${app.version} (${app.platform})`,
    `siteType: ${input.siteType}`,
    `authentication: ${input.authType && Object.values(AuthTypeEnum).includes(input.authType) ? input.authType : DIAGNOSTIC_VALUES.Unavailable}`,
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

/** Prefills the form without treating an incomplete report as complete feedback. */
export function buildCheckInFeedbackIssue(
  body: string,
  title: string,
  context?: { origin: string | null; version: string; notes: string },
) {
  const url = new URL(CHECKIN_FEEDBACK_ISSUE_URL)
  url.searchParams.set(fields.TEMPLATE, "checkin_adaptation.yml")
  url.searchParams.set(
    fields.TITLE,
    title.slice(0, CHECKIN_FEEDBACK_ISSUE_LIMITS.titleLength),
  )
  if (context) {
    const origin = context.origin && getFeedbackOrigin(context.origin)
    if (origin) url.searchParams.set(fields.SITE_URL, origin)
    url.searchParams.set(
      fields.VERSION,
      context.version.slice(0, CHECKIN_FEEDBACK_ISSUE_LIMITS.versionLength),
    )
    if (context.notes.trim()) {
      url.searchParams.set(
        fields.SUMMARY,
        context.notes.slice(0, CHECKIN_FEEDBACK_ISSUE_LIMITS.summaryLength),
      )
    }
  }
  url.searchParams.set(fields.FEEDBACK, body)
  const needsCopy = url.href.length > CHECKIN_FEEDBACK_ISSUE_LIMITS.urlLength
  if (needsCopy) {
    // Leave the required feedback field empty so GitHub asks for the full report.
    url.searchParams.delete(fields.FEEDBACK)
    for (const field of [fields.SUMMARY, fields.SITE_URL, fields.VERSION]) {
      if (url.href.length <= CHECKIN_FEEDBACK_ISSUE_LIMITS.urlLength) break
      url.searchParams.delete(field)
    }
  }
  return { url: url.href, needsCopy }
}
