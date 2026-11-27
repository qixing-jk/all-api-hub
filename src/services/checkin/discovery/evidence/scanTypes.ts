import type { AccountSiteType } from "~/constants/siteType"
import type { AuthConfig } from "~/services/apiTransport/type"

import type { ScanReadIssue } from "./scanReader"

/** Includes page readiness and the bounded scan, without waiting after completion. */
export const CHECK_IN_EVIDENCE_SCAN_SESSION_TIMEOUT_MS = 45000

/** Stable rejection messages shared by local and temporary-page scans. */
export const CHECK_IN_EVIDENCE_SCAN_ERRORS = {
  Cancelled: "scan_cancelled",
  Limit: "scan_limit",
  Origin: "scan_origin",
} as const

/** Terminal collection outcomes shared by the scanner and its presentation. */
export const FEEDBACK_SCAN_STATUSES = {
  Completed: "completed",
  Partial: "partial",
  Empty: "empty",
} as const

export type FeedbackScanStatus =
  (typeof FEEDBACK_SCAN_STATUSES)[keyof typeof FEEDBACK_SCAN_STATUSES]

/** Page links observed without following them; incomplete scans cannot prove uniqueness. */
export interface CheckInNavigationEvidence {
  candidates: string[]
  candidatesComplete?: boolean
}

export const CHECK_IN_EVIDENCE_SCAN_PURPOSES = {
  NativePage: "native_page",
} as const

export const NATIVE_CHECK_IN_PAGE_SOURCES = {
  Navigation: "navigation",
  Script: "script",
  Area: "area",
} as const

export const NATIVE_CHECK_IN_PAGE_STATES = {
  Actionable: "actionable",
  Area: "area",
  Unverified: "unverified",
} as const

export interface CheckInEvidenceScanInput {
  baseUrl: string
  siteType: AccountSiteType
  nativePagePath?: string
  /** Frontend exploration never reads account API status or sends credentials. */
  purpose?: typeof CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage
  auth?: AuthConfig
  /**
   * Route paths this account actually uses when its deployment renamed one.
   * They are probed first so the report shows what the account really calls.
   */
  routePaths?: string[]
}

/** Objective source facts; an observed area is never proof of a successful grant. */
export interface NativeCheckInPageCandidate {
  path: string
  sources: Array<
    (typeof NATIVE_CHECK_IN_PAGE_SOURCES)[keyof typeof NATIVE_CHECK_IN_PAGE_SOURCES]
  >
  state?: (typeof NATIVE_CHECK_IN_PAGE_STATES)[keyof typeof NATIVE_CHECK_IN_PAGE_STATES]
}

/** Additional collection issues supplement the reader's own failure reasons. */
export const FEEDBACK_SCAN_ISSUES = {
  TaskTimeout: "task_timeout",
  ResourceResponse: "resource_response",
  RouteLimit: "route_limit",
} as const

export interface CheckInEvidence {
  status: FeedbackScanStatus
  statusQueries: Array<{ path: string; status?: number; keys: string[] }>
  routes: string[]
  pageCandidates?: NativeCheckInPageCandidate[]
  authenticatedQueriesUnavailable: boolean
  resources?: { discovered: number; scanned: number; skipped?: number }
  keywords?: string[]
  issues?: Array<
    | ScanReadIssue
    | (typeof FEEDBACK_SCAN_ISSUES)[keyof typeof FEEDBACK_SCAN_ISSUES]
  >
}
