export type AccountKeyRepairJobState =
  | "idle"
  | "running"
  | "completed"
  | "failed"

export type AccountKeyRepairOutcome =
  | "created"
  | "alreadyHad"
  | "skipped"
  | "failed"

export type AccountKeyRepairSkipReason = "sub2api" | "noneAuth"

export interface AccountKeyRepairAccountResult {
  accountId: string
  accountName: string
  siteType: string
  siteUrlOrigin: string
  outcome: AccountKeyRepairOutcome
  skipReason?: AccountKeyRepairSkipReason
  errorMessage?: string
  finishedAt: number
}

export interface AccountKeyRepairProgress {
  jobId: string
  state: AccountKeyRepairJobState
  startedAt?: number
  updatedAt?: number
  finishedAt?: number
  totals: {
    enabledAccounts: number
    eligibleAccounts: number
    processedAccounts: number
    /**
     * Count of processed eligible accounts (excludes skipped outcomes).
     *
     * Optional for backwards-compatibility with older stored progress blobs.
     */
    processedEligibleAccounts?: number
  }
  summary: {
    created: number
    alreadyHad: number
    skipped: number
    failed: number
  }
  results: AccountKeyRepairAccountResult[]
  lastError?: string
}
