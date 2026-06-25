import type { AccountSiteType } from "~/constants/siteType"

export const ACCOUNT_KEY_REPAIR_JOB_STATES = {
  Idle: "idle",
  Running: "running",
  Cancelled: "cancelled",
  Completed: "completed",
  Failed: "failed",
} as const

export type AccountKeyRepairJobState =
  (typeof ACCOUNT_KEY_REPAIR_JOB_STATES)[keyof typeof ACCOUNT_KEY_REPAIR_JOB_STATES]

export const ACCOUNT_KEY_REPAIR_OUTCOMES = {
  Created: "created",
  AlreadyHad: "alreadyHad",
  Skipped: "skipped",
  Failed: "failed",
} as const

export type AccountKeyRepairOutcome =
  (typeof ACCOUNT_KEY_REPAIR_OUTCOMES)[keyof typeof ACCOUNT_KEY_REPAIR_OUTCOMES]

export const ACCOUNT_KEY_REPAIR_SKIP_REASONS = {
  Sub2Api: "sub2api",
  AihubmixOneTimeKey: "aihubmixOneTimeKey",
  NoneAuth: "noneAuth",
} as const

export type AccountKeyRepairSkipReason =
  (typeof ACCOUNT_KEY_REPAIR_SKIP_REASONS)[keyof typeof ACCOUNT_KEY_REPAIR_SKIP_REASONS]

export const ACCOUNT_KEY_REPAIR_ERRORS = {
  AccountNotFound: "account_not_found",
  DeleteFailed: "delete_failed",
  InvalidDisplaySiteData: "invalid_display_site_data",
} as const

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

export interface AccountKeyRepairStartOptions {
  renameAutoTemplateTokens?: boolean
}

export interface AccountKeyRepairRenamedToken {
  tokenId: number
  group: string
  previousName: string
  nextName: string
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
  renamedTokens?: AccountKeyRepairRenamedToken[]
  renameFailedTokens?: AccountKeyRepairRenamedToken[]
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
    renamedKeys?: number
    renameFailed?: number
  }
  results: AccountKeyRepairAccountResult[]
  lastError?: string
}
