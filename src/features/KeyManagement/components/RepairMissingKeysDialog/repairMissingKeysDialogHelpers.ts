import type { TFunction } from "i18next"

import type {
  AccountKeyRepairAccountResult,
  AccountKeyRepairInvalidToken,
  AccountKeyRepairOutcome,
  AccountKeyRepairProgress,
  AccountKeyRepairSkipReason,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS,
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
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Created]: "success",
  [ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad]: "info",
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped]: "warning",
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Failed]: "danger",
}

export const EMPTY_REPAIR_OUTCOME_COUNTS: Record<
  AccountKeyRepairOutcome,
  number
> = {
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Created]: 0,
  [ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad]: 0,
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped]: 0,
  [ACCOUNT_KEY_REPAIR_OUTCOMES.Failed]: 0,
}

/**
 * Filters enabled repair results by free-text search and an optional outcome.
 */
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

  if (!keyword) {
    return outcomeMatchedResults
  }

  return outcomeMatchedResults.filter((result) => {
    const groupNames = [
      ...(result.availableGroups ?? []),
      ...(result.coveredGroups ?? []),
      ...(result.createdGroups ?? []),
      ...(result.missingGroups ?? []),
    ]

    return (
      result.accountName.toLowerCase().includes(keyword) ||
      result.siteUrlOrigin.toLowerCase().includes(keyword) ||
      result.siteType.toLowerCase().includes(keyword) ||
      groupNames.some((group) => group.toLowerCase().includes(keyword))
    )
  })
}

/**
 * Filters invalid-key rows by free-text search.
 */
export function filterRepairInvalidTokens(
  tokens: AccountKeyRepairInvalidToken[],
  searchTerm: string,
) {
  const keyword = normalizeRepairSearchKeyword(searchTerm)
  if (!keyword) {
    return tokens
  }

  return tokens.filter((token) => {
    return (
      token.accountName.toLowerCase().includes(keyword) ||
      token.siteUrlOrigin.toLowerCase().includes(keyword) ||
      token.siteType.toLowerCase().includes(keyword) ||
      token.tokenName.toLowerCase().includes(keyword) ||
      token.group.toLowerCase().includes(keyword)
    )
  })
}

/**
 * Counts visible repair outcomes for the result filter bar.
 */
export function getRepairOutcomeCounts(
  results: AccountKeyRepairAccountResult[],
) {
  const counts = { ...EMPTY_REPAIR_OUTCOME_COUNTS }

  for (const result of results) {
    counts[result.outcome] += 1
  }

  return counts
}

/**
 * Normalizes repair dialog search input for case-insensitive matching.
 */
function normalizeRepairSearchKeyword(searchTerm: string) {
  return searchTerm.trim().toLowerCase()
}

/**
 * Returns the localized skip reason label used when a repair result is skipped.
 */
export function getSkipReasonLabel(
  t: TFunction,
  reason: AccountKeyRepairSkipReason | undefined,
) {
  if (!reason) return ""
  switch (reason) {
    case ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api:
      return t("keyManagement:repairMissingKeys.skipReasons.sub2api")
    case ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey:
      return t("keyManagement:repairMissingKeys.skipReasons.aihubmixOneTimeKey")
    case ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth:
      return t("keyManagement:repairMissingKeys.skipReasons.noneAuth")
  }
}

/**
 * Returns the localized outcome label shown for each repair result row.
 */
export function getRepairOutcomeLabel(
  t: TFunction,
  outcome: AccountKeyRepairOutcome,
) {
  switch (outcome) {
    case ACCOUNT_KEY_REPAIR_OUTCOMES.Created:
      return t("keyManagement:repairMissingKeys.outcomes.created")
    case ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad:
      return t("keyManagement:repairMissingKeys.outcomes.alreadyHad")
    case ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped:
      return t("keyManagement:repairMissingKeys.outcomes.skipped")
    case ACCOUNT_KEY_REPAIR_OUTCOMES.Failed:
      return t("keyManagement:repairMissingKeys.outcomes.failed")
  }
}

/**
 * Returns the localized view switch label.
 */
export function getRepairResultViewLabel(t: TFunction, view: RepairResultView) {
  switch (view) {
    case REPAIR_RESULT_VIEWS.AccountCoverage:
      return t("keyManagement:repairMissingKeys.views.accountCoverage")
    case REPAIR_RESULT_VIEWS.InvalidKeys:
      return t("keyManagement:repairMissingKeys.views.invalidKeys")
  }
}

/**
 * Keeps group names visible if i18n returns the missing-key fallback instead of
 * interpolated copy.
 */
export function getCoverageGroupLabel(
  t: TFunction,
  key: "createdGroup" | "missingGroup",
  group: string,
) {
  const [translationKey, label] =
    key === "createdGroup"
      ? [
          "keyManagement:repairMissingKeys.coverage.createdGroup",
          t("keyManagement:repairMissingKeys.coverage.createdGroup", {
            group,
          }),
        ]
      : [
          "keyManagement:repairMissingKeys.coverage.missingGroup",
          t("keyManagement:repairMissingKeys.coverage.missingGroup", {
            group,
          }),
        ]

  return label === translationKey ? group : label
}

/**
 * Returns the localized reason shown for invalid keys.
 */
export function getInvalidTokenReasonLabel(
  t: TFunction,
  token: AccountKeyRepairInvalidToken,
) {
  switch (token.reason) {
    case ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable:
      return t("keyManagement:repairMissingKeys.invalidKeys.groupUnavailable", {
        group: token.group,
      })
  }
}

/**
 * Builds a stable selection key for an invalid token within an account.
 */
export function getInvalidTokenKey(token: AccountKeyRepairInvalidToken) {
  return `${token.accountId}:${token.tokenId}`
}

/**
 * Derives progress bar values from repair progress totals.
 */
export function getRepairProgressTotals(progress: AccountKeyRepairProgress) {
  const eligibleTotal = progress.totals.eligibleAccounts
  const processedTotal =
    progress.totals.processedEligibleAccounts ??
    progress.totals.processedAccounts
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

/**
 * Returns the progress bar color class for the current repair state.
 */
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
