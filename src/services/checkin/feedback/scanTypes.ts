import type { AccountSiteType } from "~/constants/siteType"
import type { AuthConfig } from "~/services/apiTransport/type"

import type { ScanReadIssue } from "./scanReader"

/** Includes page readiness and the bounded scan, without waiting after completion. */
export const FEEDBACK_SCAN_SESSION_TIMEOUT_MS = 45000

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

export interface CheckInFeedbackClues {
  status: "completed" | "partial" | "empty"
  statusQueries: Array<{ path: string; status?: number; keys: string[] }>
  routes: string[]
  authenticatedQueriesUnavailable: boolean
  resources?: { discovered: number; scanned: number; skipped?: number }
  keywords?: string[]
  issues?: Array<
    ScanReadIssue | "task_timeout" | "resource_response" | "route_limit"
  >
}
