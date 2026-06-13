import type { AccountSiteType } from "~/constants/siteType"

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

export type AccountKeyRepairSkipReason =
  | "sub2api"
  | "aihubmixOneTimeKey"
  | "noneAuth"

export const ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS = {
  GroupUnavailable: "groupUnavailable",
} as const

export type AccountKeyRepairInvalidTokenReason =
  (typeof ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS)[keyof typeof ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS]

export interface AccountKeyRepairInvalidToken {
  accountId: string
  accountName: string
  siteType: AccountSiteType
  siteUrlOrigin: string
  tokenId: number
  tokenName: string
  group: string
  reason: AccountKeyRepairInvalidTokenReason
  errorMessage?: string
}

export interface AccountKeyRepairDeletedInvalidToken
  extends AccountKeyRepairInvalidToken {
  deletedAt: number
}

export interface AccountKeyRepairFailedInvalidTokenDelete
  extends AccountKeyRepairInvalidToken {
  errorMessage: string
}

export interface AccountKeyRepairDeleteInvalidTokensRequest {
  tokens: AccountKeyRepairInvalidToken[]
}

export interface AccountKeyRepairDeleteInvalidTokensResult {
  deleted: AccountKeyRepairDeletedInvalidToken[]
  failed: AccountKeyRepairFailedInvalidTokenDelete[]
}

export interface AccountKeyRepairAccountResult {
  accountId: string
  accountName: string
  siteType: AccountSiteType
  siteUrlOrigin: string
  outcome: AccountKeyRepairOutcome
  skipReason?: AccountKeyRepairSkipReason
  errorMessage?: string
  availableGroups?: string[]
  coveredGroups?: string[]
  createdGroups?: string[]
  missingGroups?: string[]
  invalidTokens?: AccountKeyRepairInvalidToken[]
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
    availableGroups?: number
    coveredGroups?: number
    createdKeys?: number
    invalidKeys?: number
    deletedKeys?: number
    deleteFailed?: number
  }
  results: AccountKeyRepairAccountResult[]
  lastError?: string
}
