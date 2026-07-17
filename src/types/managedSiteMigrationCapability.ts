import type { ChannelType } from "~/constants/managedSite"
import type { ManagedSiteType } from "~/constants/siteType"
import type {
  ManagedResourceRef,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"

import type {
  ManagedSiteChannelMigrationBlockedReasonCode,
  ManagedSiteChannelMigrationGeneralWarningCode,
  ManagedSiteChannelMigrationItemWarningCode,
} from "./managedSiteMigration"

export type ManagedSiteMigrationSelection = {
  selectionId: string
  displayName: string
  ref: ManagedResourceRef
}

export type ManagedSiteMigrationStatus = "enabled" | "disabled" | "other"

export type ManagedSiteMigrationLossSignals = {
  hasModelMapping: boolean
  hasStatusCodeMapping: boolean
  hasAdvancedSettings: boolean
  hasMultiKeyState: boolean
}

export type ManagedSiteMigrationSource = {
  sourceSiteType: ManagedSiteType
  resourceType: ChannelType
  baseUrl: string
  models: string[]
  groups: string[]
  priority: number
  weight: number
  status: ManagedSiteMigrationStatus
  lossSignals: ManagedSiteMigrationLossSignals
}

export type ManagedSiteMigrationPreviewProjection = {
  name: string
  type: ChannelType | string
  baseUrl: string
  models: string[]
  groups: string[]
  priority: number
  weight: number
  status: 1 | 2
}

export type ManagedSiteMigrationTargetAdjustments = {
  remappedType: boolean
  normalizedBaseUrl: boolean
  forcedDefaultGroup: boolean
  ignoredPriority: boolean
  ignoredWeight: boolean
  simplifiedStatus: boolean
}

/** Execution-only ephemeral command; it must never enter previews, results, persistence, React state, analytics, logs, or caches. */
export type ManagedSiteMigrationExecutionCommand = {
  source: ManagedSiteMigrationSource
  targetSiteType: ManagedSiteType
  projection: ManagedSiteMigrationPreviewProjection
  credential: string
}

export type ManagedSiteMigrationTargetPreparation = {
  projection: ManagedSiteMigrationPreviewProjection
  adjustments: ManagedSiteMigrationTargetAdjustments
}

export type ManagedSiteMigrationSourcePreparation =
  | { status: "ready"; source: ManagedSiteMigrationSource }
  | {
      status: "blocked"
      reasonCode: ManagedSiteChannelMigrationBlockedReasonCode
    }

/** Execution-only ephemeral credential; it must never enter previews, results, persistence, React state, analytics, logs, or caches. */
export type ManagedSiteMigrationCredentialResolution =
  | { status: "ready"; credential: string }
  | {
      status: "blocked"
      reasonCode: ManagedSiteChannelMigrationBlockedReasonCode
    }

export const MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES = {
  SourceUnavailable: "source_unavailable",
  TargetUnavailable: "target_unavailable",
  TargetRejected: "target_rejected",
  MutationStateUncertain: "mutation_state_uncertain",
  Unexpected: "unexpected",
} as const

export type ManagedSiteMigrationExecutionFailureCode =
  (typeof MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES)[keyof typeof MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES]

export type ManagedSiteMigrationConfirmedFailureCode = Exclude<
  ManagedSiteMigrationExecutionFailureCode,
  typeof MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain
>

export type ManagedSiteMigrationCreateResult =
  | { status: "created" }
  | {
      status: "failed"
      failureCode: ManagedSiteMigrationConfirmedFailureCode
    }
  | { status: "uncertain" }

type ManagedSiteMigrationCanonicalPreviewItemBase = {
  selection: ManagedSiteMigrationSelection
  warningCodes: readonly ManagedSiteChannelMigrationItemWarningCode[]
}

export type ManagedSiteMigrationCanonicalPreviewItem =
  | (ManagedSiteMigrationCanonicalPreviewItemBase & {
      status: "ready"
      source: ManagedSiteMigrationSource
      target: ManagedSiteMigrationTargetPreparation
      blockingReasonCode?: never
    })
  | (ManagedSiteMigrationCanonicalPreviewItemBase & {
      status: "blocked"
      blockingReasonCode: ManagedSiteChannelMigrationBlockedReasonCode
      source?: ManagedSiteMigrationSource
      target?: never
    })

export type ManagedSiteMigrationCanonicalPreview = {
  sourceSiteType: ManagedSiteType
  targetSiteType: ManagedSiteType
  generalWarningCodes: readonly ManagedSiteChannelMigrationGeneralWarningCode[]
  items: readonly ManagedSiteMigrationCanonicalPreviewItem[]
  totalCount: number
  readyCount: number
  blockedCount: number
}

type ManagedSiteMigrationCanonicalExecutionItemBase = {
  selectionId: string
  displayName: string
}

type ManagedSiteMigrationCanonicalExecutionItem =
  | (ManagedSiteMigrationCanonicalExecutionItemBase & {
      status: "created"
      failureCode?: never
      blockingReasonCode?: never
    })
  | (ManagedSiteMigrationCanonicalExecutionItemBase & {
      status: "failed"
      failureCode: ManagedSiteMigrationConfirmedFailureCode
      blockingReasonCode?: never
    })
  | (ManagedSiteMigrationCanonicalExecutionItemBase & {
      status: "skipped"
      failureCode?: never
      blockingReasonCode: ManagedSiteChannelMigrationBlockedReasonCode
    })
  | (ManagedSiteMigrationCanonicalExecutionItemBase & {
      status: "uncertain"
      failureCode: typeof MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain
      blockingReasonCode?: never
    })

export type ManagedSiteMigrationCanonicalExecutionResult = {
  totalSelected: number
  attemptedCount: number
  createdCount: number
  failedCount: number
  skippedCount: number
  uncertainCount: number
  items: readonly ManagedSiteMigrationCanonicalExecutionItem[]
}

/**
 * Secret-free progress captured when canonical execution is cancelled.
 *
 * Invariants:
 * - `partialResult.items.length + remainingSelections.length === partialResult.totalSelected`
 * - The created, failed, skipped, and uncertain counts sum to `partialResult.items.length`.
 *
 * Credentials and execution commands must never be retained here.
 */
export type ManagedSiteMigrationExecutionAbortDetails = {
  partialResult: ManagedSiteMigrationCanonicalExecutionResult
  remainingSelections: readonly ManagedSiteMigrationSelection[]
}

/** Reports cancellation without discarding confirmed, secret-free progress. */
export class ManagedSiteMigrationExecutionAbortedError extends Error {
  readonly details: ManagedSiteMigrationExecutionAbortDetails

  constructor(
    details: ManagedSiteMigrationExecutionAbortDetails,
    options?: ErrorOptions,
  ) {
    super("Managed-site migration execution was cancelled.", options)
    this.name = "ManagedSiteMigrationExecutionAbortedError"
    this.details = details
  }
}

export type ManagedSiteMigrationCapability = {
  source?: {
    prepare(
      selection: ManagedSiteMigrationSelection,
      options?: ResourceOperationOptions,
    ): Promise<ManagedSiteMigrationSourcePreparation>
    resolveCredential(
      selection: ManagedSiteMigrationSelection,
      options?: ResourceOperationOptions,
    ): Promise<ManagedSiteMigrationCredentialResolution>
  }
  target?: {
    prepare(
      source: ManagedSiteMigrationSource,
      options?: ResourceOperationOptions,
    ): Promise<ManagedSiteMigrationTargetPreparation>
    create(
      command: ManagedSiteMigrationExecutionCommand,
      options?: ResourceOperationOptions,
    ): Promise<ManagedSiteMigrationCreateResult>
  }
}
