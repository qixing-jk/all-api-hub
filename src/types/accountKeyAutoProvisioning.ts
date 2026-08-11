import type { AccountSiteType } from "~/constants/siteType"
import type { AccountKeyInventoryReconciliationResult } from "~/services/accounts/accountKeyInventoryReconciliation"
import type {
  AccountKeyResourceRef,
  ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"

export const ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION = 2 as const

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
  Covered: "covered",
  Repaired: "repaired",
  Partial: "partial",
  Blocked: "blocked",
  Skipped: "skipped",
  Failed: "failed",
} as const

export type AccountKeyRepairOutcome =
  (typeof ACCOUNT_KEY_REPAIR_OUTCOMES)[keyof typeof ACCOUNT_KEY_REPAIR_OUTCOMES]

export const ACCOUNT_KEY_REPAIR_SKIP_REASONS = {
  AihubmixOneTimeKey: "aihubmixOneTimeKey",
  NoneAuth: "noneAuth",
  ProvisioningUnavailable: "provisioning-unavailable",
} as const

export type AccountKeyRepairSkipReason =
  (typeof ACCOUNT_KEY_REPAIR_SKIP_REASONS)[keyof typeof ACCOUNT_KEY_REPAIR_SKIP_REASONS]

export const ACCOUNT_KEY_REPAIR_ERRORS = {
  AccountNotFound: "account_not_found",
  InvalidResourceDeleteRequest: "invalid_resource_delete_request",
  InvalidDisplaySiteData: "invalid_display_site_data",
} as const

type ReconciliationRequirementResult =
  AccountKeyInventoryReconciliationResult["requirementResults"][number]

type ReconciliationCreatedRequirementResult = Extract<
  ReconciliationRequirementResult,
  { created: unknown }
>

/** Secret-free requirement result persisted by the repair runner. */
export type AccountKeyRepairRequirementResult =
  | Exclude<ReconciliationRequirementResult, { created: unknown }>
  | (Omit<ReconciliationCreatedRequirementResult, "created"> & {
      readonly created: { readonly ref: AccountKeyResourceRef }
    })

export interface AccountKeyRepairInvalidResource {
  accountId: string
  accountName: string
  siteType: AccountSiteType
  siteUrlOrigin: string
  ref: AccountKeyResourceRef
  displayLabel?: string
  groupLabel?: string
  reason: string
}

export const ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES = {
  Applied: "applied",
  Rejected: "rejected",
  Uncertain: "uncertain",
} as const

export type AccountKeyRepairInvalidResourceMutationResult =
  | {
      resource: AccountKeyRepairInvalidResource
      outcome: typeof ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied
      finishedAt: number
    }
  | {
      resource: AccountKeyRepairInvalidResource
      outcome: typeof ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected
      failure: ResourceFailure
      finishedAt: number
    }
  | {
      resource: AccountKeyRepairInvalidResource
      outcome: typeof ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain
      failure: ResourceFailure
      finishedAt: number
    }

export interface AccountKeyRepairDeleteInvalidResourcesRequest {
  resources: AccountKeyRepairInvalidResource[]
}

export interface AccountKeyRepairDeleteInvalidResourcesResult {
  results: AccountKeyRepairInvalidResourceMutationResult[]
}

export interface AccountKeyRepairStartOptions {
  renameAutoTemplateTokens?: boolean
}

export type AccountKeyRepairRenameResult =
  | {
      ref: AccountKeyResourceRef
      outcome: typeof ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied
    }
  | {
      ref: AccountKeyResourceRef
      outcome: typeof ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected
      failure: ResourceFailure
    }
  | {
      ref: AccountKeyResourceRef
      outcome: typeof ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain
      failure: ResourceFailure
    }

export const ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES = {
  Created: "created",
  AlreadyPresent: "already-present",
  Failed: "failed",
  Uncertain: "uncertain",
} as const

export type AccountKeyRepairManagedSiteImportStatus =
  (typeof ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES)[keyof typeof ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES]

export interface AccountKeyRepairManagedSiteImportResultItem {
  resourceRef: AccountKeyResourceRef
  status: AccountKeyRepairManagedSiteImportStatus
}

export interface AccountKeyRepairRecordManagedSiteImportResultsRequest {
  jobId: string
  targetFingerprint: string
  items: AccountKeyRepairManagedSiteImportResultItem[]
}

export interface AccountKeyRepairManagedSiteImportReceipt
  extends AccountKeyRepairManagedSiteImportResultItem {
  targetFingerprint: string
  updatedAt: number
}

export interface AccountKeyRepairAccountResult {
  accountId: string
  accountName: string
  siteType: AccountSiteType
  siteUrlOrigin: string
  outcome: AccountKeyRepairOutcome
  skipReason?: AccountKeyRepairSkipReason
  /** Controlled account-key resource failure retained for repair UI disclosure. */
  failure?: ResourceFailure
  /** Fallback for non-resource exceptions. */
  errorMessage?: string
  inventoryStatus?: AccountKeyInventoryReconciliationResult["inventoryStatus"]
  inventoryIssues?: AccountKeyInventoryReconciliationResult["inventoryIssues"]
  partialFailure?: ResourceFailure
  requirementResults: AccountKeyRepairRequirementResult[]
  createdRefs: AccountKeyResourceRef[]
  invalidResources: AccountKeyRepairInvalidResource[]
  renameResults: AccountKeyRepairRenameResult[]
  finishedAt: number
}

export interface AccountKeyRepairProgress {
  schemaVersion: typeof ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION
  jobId: string
  state: AccountKeyRepairJobState
  startedAt?: number
  updatedAt?: number
  finishedAt?: number
  totals: {
    enabledAccounts: number
    eligibleAccounts: number
    processedAccounts: number
  }
  summary: {
    complete: number
    partial: number
    blocked: number
    skipped: number
    failed: number
    requirements: number
    coveredRequirements: number
    createdRequirements: number
    blockedRequirements: number
    rejectedRequirements: number
    uncertainRequirements: number
    invalidResources: number
    renameApplied: number
    renameRejected: number
    renameUncertain: number
    deleteApplied: number
    deleteRejected: number
    deleteUncertain: number
  }
  results: AccountKeyRepairAccountResult[]
  managedSiteImportReceipts?: AccountKeyRepairManagedSiteImportReceipt[]
  lastError?: string
}
