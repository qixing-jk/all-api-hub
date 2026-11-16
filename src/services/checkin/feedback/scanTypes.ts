import type { AccountSiteType } from "~/constants/siteType"
import type { AuthConfig } from "~/services/apiTransport/type"

import type { ScanReadIssue } from "./scanReader"

/** Includes page readiness and the bounded scan, without waiting after completion. */
export const FEEDBACK_SCAN_SESSION_TIMEOUT_MS = 45000

/** Terminal collection outcomes shared by the scanner and its presentation. */
export const FEEDBACK_SCAN_STATUSES = {
  Completed: "completed",
  Partial: "partial",
  Empty: "empty",
} as const

export type FeedbackScanStatus =
  (typeof FEEDBACK_SCAN_STATUSES)[keyof typeof FEEDBACK_SCAN_STATUSES]

export interface CheckInFeedbackScanInput {
  baseUrl: string
  siteType: AccountSiteType
  auth?: AuthConfig
  /**
   * Route paths this account actually uses when its deployment renamed one.
   * They are probed first so the report shows what the account really calls.
   */
  routePaths?: string[]
}

/** Additional collection issues supplement the reader's own failure reasons. */
export const FEEDBACK_SCAN_ISSUES = {
  TaskTimeout: "task_timeout",
  ResourceResponse: "resource_response",
  RouteLimit: "route_limit",
} as const

export interface CheckInFeedbackClues {
  status: FeedbackScanStatus
  statusQueries: Array<{ path: string; status?: number; keys: string[] }>
  routes: string[]
  authenticatedQueriesUnavailable: boolean
  resources?: { discovered: number; scanned: number; skipped?: number }
  keywords?: string[]
  issues?: Array<
    | ScanReadIssue
    | (typeof FEEDBACK_SCAN_ISSUES)[keyof typeof FEEDBACK_SCAN_ISSUES]
  >
}
