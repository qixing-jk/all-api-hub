import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"

import { Badge, Button, EmptyState } from "~/components/ui"
import type { AccountKeyRepairAccountResult } from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
} from "~/types/accountKeyAutoProvisioning"

import {
  getCoverageGroupLabel,
  getRepairOutcomeLabel,
  getSkipReasonLabel,
  OUTCOME_BADGE_VARIANTS,
} from "./repairMissingKeysDialogHelpers"

interface RepairAccountCoverageListProps {
  accountIds: Set<string>
  filteredResults: AccountKeyRepairAccountResult[]
  openingSub2ApiAccountId: string | null
  readOnly?: boolean
  onOpenSub2ApiTokenDialog: (accountId: string) => void
  t: TFunction
}

/**
 * Renders per-account repair outcomes and group coverage details.
 */
export function RepairAccountCoverageList({
  accountIds,
  filteredResults,
  openingSub2ApiAccountId,
  readOnly = false,
  onOpenSub2ApiTokenDialog,
  t,
}: RepairAccountCoverageListProps) {
  if (filteredResults.length === 0) {
    return (
      <EmptyState
        icon={<MagnifyingGlassIcon className="h-12 w-12" />}
        title={t("keyManagement:repairMissingKeys.noMatchingResults")}
        className="py-10"
      />
    )
  }

  return (
    <ul className="dark:divide-dark-bg-tertiary divide-y">
      {filteredResults.map((result) => {
        const outcomeLabel = getRepairOutcomeLabel(t, result.outcome)
        const details =
          result.outcome === ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped
            ? getSkipReasonLabel(t, result.skipReason)
            : result.outcome === ACCOUNT_KEY_REPAIR_OUTCOMES.Failed
              ? result.errorMessage || ""
              : ""
        const canCreateSub2ApiKey =
          !readOnly &&
          result.outcome === ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped &&
          result.skipReason === ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api &&
          accountIds.has(result.accountId)

        const badgeVariant = OUTCOME_BADGE_VARIANTS[result.outcome]
        const renamedTokenCount = result.renamedTokens?.length ?? 0
        const renameFailedTokenCount = result.renameFailedTokens?.length ?? 0
        const renameBadges =
          renamedTokenCount > 0 || renameFailedTokenCount > 0 ? (
            <>
              {renamedTokenCount > 0 ? (
                <Badge variant="info" size="sm">
                  {t(
                    "keyManagement:repairMissingKeys.renameSummary.accountRenamed",
                    { count: renamedTokenCount },
                  )}
                </Badge>
              ) : null}
              {renameFailedTokenCount > 0 ? (
                <Badge variant="warning" size="sm">
                  {t(
                    "keyManagement:repairMissingKeys.renameSummary.accountFailed",
                    { count: renameFailedTokenCount },
                  )}
                </Badge>
              ) : null}
            </>
          ) : null

        return (
          <li
            key={`${result.accountId}-${result.finishedAt}`}
            className="px-4 py-3"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-sm font-medium">
                    {result.accountName}
                  </div>
                  <Badge
                    variant="outline"
                    size="sm"
                    className="dark:border-dark-bg-tertiary shrink-0 border-gray-200 px-2 py-0.5 text-[11px] font-medium"
                    title={result.siteType}
                  >
                    {result.siteType}
                  </Badge>
                </div>
                <div className="dark:text-dark-text-secondary truncate text-xs text-gray-500">
                  {result.siteUrlOrigin}
                </div>
              </div>
              <Badge
                variant={badgeVariant}
                size="sm"
                className="shrink-0 border-transparent"
              >
                {outcomeLabel}
              </Badge>
            </div>

            {canCreateSub2ApiKey ? (
              <div className="mt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenSub2ApiTokenDialog(result.accountId)}
                  disabled={openingSub2ApiAccountId === result.accountId}
                  loading={openingSub2ApiAccountId === result.accountId}
                >
                  {t("keyManagement:dialog.createToken")}
                </Button>
              </div>
            ) : null}

            {details ? (
              <div
                className={[
                  "mt-2 text-xs",
                  result.outcome === ACCOUNT_KEY_REPAIR_OUTCOMES.Failed
                    ? "text-red-700 dark:text-red-300"
                    : "dark:text-dark-text-secondary text-gray-500",
                ].join(" ")}
              >
                {details}
              </div>
            ) : null}

            {result.availableGroups ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" size="sm">
                  {t("keyManagement:repairMissingKeys.coverage.groupsCovered", {
                    covered: result.coveredGroups?.length ?? 0,
                    total: result.availableGroups.length,
                  })}
                </Badge>
                {(result.createdGroups ?? []).map((group) => (
                  <Badge key={group} variant="success" size="sm">
                    {getCoverageGroupLabel(t, "createdGroup", group)}
                  </Badge>
                ))}
                {(result.missingGroups ?? []).map((group) => (
                  <Badge key={group} variant="warning" size="sm">
                    {getCoverageGroupLabel(t, "missingGroup", group)}
                  </Badge>
                ))}
                {renameBadges}
              </div>
            ) : renamedTokenCount > 0 || renameFailedTokenCount > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {renameBadges}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
