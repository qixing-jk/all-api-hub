import type { TFunction } from "i18next"

import {
  ACCOUNT_KEY_RECONCILIATION_INVALID_REASONS,
  ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES,
  ACCOUNT_KEY_RECONCILIATION_OUTCOMES,
  type AccountKeyReconciliationInventoryIssue,
} from "~/services/accounts/accountKeyInventoryReconciliation"
import { buildAccountKeyResourceRuntimeKeyId } from "~/services/accounts/accountRuntimeKeys"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type {
  AccountKeyRepairAccountResult,
  AccountKeyRepairInvalidResource,
  AccountKeyRepairOutcome,
  AccountKeyRepairProgress,
  AccountKeyRepairRequirementResult,
  AccountKeyRepairSkipReason,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
} from "~/types/accountKeyAutoProvisioning"

export const REPAIR_RESULT_VIEWS = {
  AccountCoverage: "accountCoverage",
  InvalidKeys: "invalidKeys",
} as const

export type RepairResultView =
  (typeof REPAIR_RESULT_VIEWS)[keyof typeof REPAIR_RESULT_VIEWS]

export type RepairBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info"
  | "danger"

export const OUTCOME_BADGE_VARIANTS: Record<
  AccountKeyRepairOutcome,
  RepairBadgeVariant
> = {
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Covered]: "success",
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired]: "success",
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Partial]: "warning",
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked]: "warning",
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped]: "secondary",
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Failed]: "danger",
}

type RequirementOutcome = AccountKeyRepairRequirementResult["outcome"]

export const REQUIREMENT_OUTCOME_BADGE_VARIANTS: Record<
  RequirementOutcome,
  RepairBadgeVariant
> = {
  [ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered]: "info",
  [ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created]: "success",
  [ACCOUNT_KEY_RECONCILIATION_OUTCOMES.CoveredAfterUncertain]: "warning",
  [ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedIncompleteInventory]: "warning",
  [ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedInputRequired]: "warning",
  [ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Rejected]: "danger",
  [ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Uncertain]: "warning",
}

export const EMPTY_REPAIR_OUTCOME_COUNTS: Record<
  AccountKeyRepairOutcome,
  number
> = {
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Covered]: 0,
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired]: 0,
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Partial]: 0,
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked]: 0,
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped]: 0,
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Failed]: 0,
}

const repairFailureCodes = new Set<string>(
  Object.values(ACCOUNT_KEY_RESOURCE_FAILURE_CODES),
)

/** Prefers useful provider details and falls back to actionable guidance. */
export function getRepairFailureMessage(
  t: TFunction,
  failure: ResourceFailure,
): string {
  let guidance: string
  switch (failure.code) {
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ConfigurationRequired:
      guidance = t(
        "keyManagement:repairMissingKeys.failureGuidance.configurationRequired",
      )
      break
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.InvalidConfiguration:
      guidance = t(
        "keyManagement:repairMissingKeys.failureGuidance.invalidConfiguration",
      )
      break
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed:
      guidance = t(
        "keyManagement:repairMissingKeys.failureGuidance.authenticationFailed",
      )
      break
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied:
      guidance = t(
        "keyManagement:repairMissingKeys.failureGuidance.permissionDenied",
      )
      break
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed:
      guidance = t(
        "keyManagement:repairMissingKeys.failureGuidance.validationFailed",
      )
      break
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound:
      guidance = t("keyManagement:repairMissingKeys.failureGuidance.notFound")
      break
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain:
      guidance = t(
        "keyManagement:repairMissingKeys.failureGuidance.mutationStateUncertain",
      )
      break
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable:
      guidance = t(
        "keyManagement:repairMissingKeys.failureGuidance.unavailable",
      )
      break
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected:
      guidance = t(
        "keyManagement:repairMissingKeys.failureGuidance.upstreamRejected",
      )
      break
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted:
      guidance = t("keyManagement:repairMissingKeys.failureGuidance.aborted")
      break
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected:
      guidance = t("keyManagement:repairMissingKeys.failureGuidance.unexpected")
      break
  }

  const details = [failure.message, failure.upstreamCode]
    .map((detail) => detail?.trim())
    .filter((detail): detail is string => Boolean(detail))
    .filter((detail) => !repairFailureCodes.has(detail))

  return [...new Set(details)].join(" · ") || guidance
}

/** Restores controlled failures persisted as legacy error-message strings. */
export function getLegacyRepairFailure(
  errorMessage: string | undefined,
): ResourceFailure | undefined {
  const code = errorMessage?.trim()
  return code && repairFailureCodes.has(code)
    ? { code: code as ResourceFailure["code"] }
    : undefined
}

/** Filters enabled repair results by free-text search and an optional outcome. */
export function filterRepairResults({
  outcomeFilter,
  results,
  searchTerm,
}: {
  outcomeFilter: AccountKeyRepairOutcome | null
  results: AccountKeyRepairAccountResult[]
  searchTerm: string
}) {
  const keyword = normalizeRepairSearchKeyword(searchTerm)
  const outcomeMatchedResults = outcomeFilter
    ? results.filter((result) => result.outcome === outcomeFilter)
    : results

  if (!keyword) return outcomeMatchedResults

  return outcomeMatchedResults.filter((result) => {
    const requirementNames = result.requirementResults.map(
      ({ requirement }) => requirement.displayName,
    )

    return (
      result.accountName.toLowerCase().includes(keyword) ||
      result.siteUrlOrigin.toLowerCase().includes(keyword) ||
      result.siteType.toLowerCase().includes(keyword) ||
      requirementNames.some((name) => name.toLowerCase().includes(keyword))
    )
  })
}

/** Filters invalid-resource rows by free-text search. */
export function filterRepairInvalidResources(
  resources: AccountKeyRepairInvalidResource[],
  searchTerm: string,
) {
  const keyword = normalizeRepairSearchKeyword(searchTerm)
  if (!keyword) return resources

  return resources.filter((resource) =>
    [
      resource.accountName,
      resource.siteUrlOrigin,
      resource.siteType,
      resource.displayLabel ?? "",
      resource.groupLabel ?? "",
      resource.ref.scopeKey,
      resource.ref.resourceId,
      resource.reason,
    ].some((value) => value.toLowerCase().includes(keyword)),
  )
}

/** Counts visible repair outcomes for the result filter bar. */
export function getRepairOutcomeCounts(
  results: AccountKeyRepairAccountResult[],
) {
  const counts = { ...EMPTY_REPAIR_OUTCOME_COUNTS }
  for (const result of results) counts[result.outcome] += 1
  return counts
}

/** Normalizes user-entered repair result search text for case-insensitive matching. */
function normalizeRepairSearchKeyword(searchTerm: string) {
  return searchTerm.trim().toLowerCase()
}

/** Returns the localized skip reason label used when a repair result is skipped. */
export function getSkipReasonLabel(
  t: TFunction,
  reason: AccountKeyRepairSkipReason | undefined,
) {
  if (!reason) return ""
  switch (reason) {
    case ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey:
      return t("keyManagement:repairMissingKeys.skipReasons.aihubmixOneTimeKey")
    case ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth:
      return t("keyManagement:repairMissingKeys.skipReasons.noneAuth")
    case ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable:
      return t(
        "keyManagement:repairMissingKeys.skipReasons.provisioningUnavailable",
      )
  }
}

/** Returns the localized outcome label shown for each repair result row. */
export function getRepairOutcomeLabel(
  t: TFunction,
  outcome: AccountKeyRepairOutcome,
) {
  switch (outcome) {
    case ACCOUNT_KEY_REPAIR_OUTCOMES.Covered:
      return t("keyManagement:repairMissingKeys.outcomes.covered")
    case ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired:
      return t("keyManagement:repairMissingKeys.outcomes.repaired")
    case ACCOUNT_KEY_REPAIR_OUTCOMES.Partial:
      return t("keyManagement:repairMissingKeys.outcomes.partial")
    case ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked:
      return t("keyManagement:repairMissingKeys.outcomes.blocked")
    case ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped:
      return t("keyManagement:repairMissingKeys.outcomes.skipped")
    case ACCOUNT_KEY_REPAIR_OUTCOMES.Failed:
      return t("keyManagement:repairMissingKeys.outcomes.failed")
  }
}

/** Returns whether an account has all required keys after the check. */
export function isSuccessfulRepairOutcome(outcome: AccountKeyRepairOutcome) {
  return (
    outcome === ACCOUNT_KEY_REPAIR_OUTCOMES.Covered ||
    outcome === ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired
  )
}

/** Returns the localized requirement reconciliation outcome. */
export function getRequirementOutcomeLabel(
  t: TFunction,
  outcome: RequirementOutcome,
) {
  switch (outcome) {
    case ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered:
      return t("keyManagement:repairMissingKeys.requirements.covered")
    case ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created:
      return t("keyManagement:repairMissingKeys.requirements.created")
    case ACCOUNT_KEY_RECONCILIATION_OUTCOMES.CoveredAfterUncertain:
      return t(
        "keyManagement:repairMissingKeys.requirements.coveredAfterUncertain",
      )
    case ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedIncompleteInventory:
      return t(
        "keyManagement:repairMissingKeys.requirements.blockedIncompleteInventory",
      )
    case ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedInputRequired:
      return t(
        "keyManagement:repairMissingKeys.requirements.blockedInputRequired",
      )
    case ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Rejected:
      return t("keyManagement:repairMissingKeys.requirements.rejected")
    case ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Uncertain:
      return t("keyManagement:repairMissingKeys.requirements.uncertain")
  }
}

/** Returns the localized view switch label. */
export function getRepairResultViewLabel(t: TFunction, view: RepairResultView) {
  switch (view) {
    case REPAIR_RESULT_VIEWS.AccountCoverage:
      return t("keyManagement:repairMissingKeys.views.accountCoverage")
    case REPAIR_RESULT_VIEWS.InvalidKeys:
      return t("keyManagement:repairMissingKeys.views.invalidKeys")
  }
}

/** Keeps provider-owned invalid-resource details visible without exposing ref identity. */
export function getInvalidResourceReasonLabel(
  t: TFunction,
  resource: AccountKeyRepairInvalidResource,
) {
  if (
    resource.reason ===
    ACCOUNT_KEY_RECONCILIATION_INVALID_REASONS.OrphanedPlacement
  ) {
    return t(
      "keyManagement:repairMissingKeys.invalidKeys.reasons.orphanedPlacement",
    )
  }

  const translationKey = "keyManagement:repairMissingKeys.invalidKeys.reason"
  const label = t(translationKey, { reason: resource.reason })
  return label === translationKey ? resource.reason : label
}

/** Returns a localized explanation for one controlled inventory issue. */
export function getInventoryIssueLabel(
  t: TFunction,
  issue: AccountKeyReconciliationInventoryIssue,
) {
  switch (issue.code) {
    case ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.DuplicateResourceRefs:
      return t(
        "keyManagement:repairMissingKeys.inventoryIssues.duplicateResourceRefs",
        { count: issue.count },
      )
    case ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.InheritedAccountGroupUnavailable:
      return t(
        "keyManagement:repairMissingKeys.inventoryIssues.inheritedAccountGroupUnavailable",
        { count: issue.count },
      )
    case ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.InvalidRequirementPlacement:
      return t(
        "keyManagement:repairMissingKeys.inventoryIssues.invalidRequirementPlacement",
        { count: issue.count },
      )
    case ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.PartialFailure:
      return t("keyManagement:repairMissingKeys.inventoryIssues.partialFailure")
    case ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.RefreshFailed:
      return t("keyManagement:repairMissingKeys.inventoryIssues.refreshFailed")
    case ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.UnknownCoverage:
      return t(
        "keyManagement:repairMissingKeys.inventoryIssues.unknownCoverage",
        { count: issue.count },
      )
    case ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.UnknownPlacement:
      return t(
        "keyManagement:repairMissingKeys.inventoryIssues.unknownPlacement",
        { count: issue.count },
      )
  }
}

/** Builds a stable selection key from the complete native resource identity. */
export function getInvalidResourceKey(
  resource: AccountKeyRepairInvalidResource,
) {
  return buildAccountKeyResourceRuntimeKeyId(resource.ref)
}

/** Derives progress bar values from repair progress totals. */
export function getRepairProgressTotals(progress: AccountKeyRepairProgress) {
  const eligibleTotal = progress.totals.eligibleAccounts
  const processedTotal = progress.totals.processedAccounts
  const progressMax = Math.max(1, eligibleTotal)
  const progressPercent =
    eligibleTotal <= 0
      ? 0
      : Math.min(100, Math.round((processedTotal / eligibleTotal) * 100))

  return {
    eligibleTotal,
    processedTotal,
    progressMax,
    progressPercent,
  }
}

/** Returns the progress bar color class for the current repair state. */
export function getRepairProgressBarColor(progress: AccountKeyRepairProgress) {
  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Failed) {
    return "bg-red-600 dark:bg-red-500"
  }
  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled) {
    return "bg-amber-600 dark:bg-amber-500"
  }
  if (
    progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Completed &&
    progress.summary.failed > 0
  ) {
    return "bg-amber-600 dark:bg-amber-500"
  }
  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Completed) {
    return "bg-emerald-600 dark:bg-emerald-500"
  }
  return "bg-blue-600 dark:bg-blue-500"
}
