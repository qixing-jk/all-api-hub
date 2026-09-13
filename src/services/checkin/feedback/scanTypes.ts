import type { AccountSiteType } from "~/constants/siteType"
import type { AuthConfig } from "~/services/apiTransport/type"

import type { ScanReadIssue } from "./scanReader"

/** Includes page readiness and the bounded scan, without waiting after completion. */
export const FEEDBACK_SCAN_SESSION_TIMEOUT_MS = 45000

export interface CheckInFeedbackScanInput {
  baseUrl: string
  siteType: AccountSiteType
  auth?: AuthConfig
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
