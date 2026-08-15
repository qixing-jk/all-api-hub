import type { TFunction } from "i18next"
import { ChevronDown, Search } from "lucide-react"
import { useEffect, useState } from "react"

import { Badge, EmptyState } from "~/components/ui"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { getRepairAccountResultTestId } from "~/features/KeyManagement/testIds"
import { cn } from "~/lib/utils"
import { ACCOUNT_KEY_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { AccountKeyRepairAccountResult } from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
} from "~/types/accountKeyAutoProvisioning"

import {
  getInventoryIssueLabel,
  getLegacyRepairFailure,
  getRepairFailureMessage,
  getRepairOutcomeLabel,
  getRequirementOutcomeLabel,
  getSkipReasonLabel,
  isSuccessfulRepairOutcome,
  OUTCOME_BADGE_VARIANTS,
  REQUIREMENT_OUTCOME_BADGE_VARIANTS,
} from "./repairMissingKeysDialogHelpers"

interface RepairAccountCoverageListProps {
  filteredResults: AccountKeyRepairAccountResult[]
  searchTerm: string
  t: TFunction
}

interface RepairAccountSummaryProps {
  expandable: boolean
  feedbackMessage: string
  open: boolean
  result: AccountKeyRepairAccountResult
  t: TFunction
}

interface RepairAccountDetailsProps {
  result: AccountKeyRepairAccountResult
  t: TFunction
}

interface RepairAccountCoverageItemProps {
  openWhenSearching: boolean
  result: AccountKeyRepairAccountResult
  t: TFunction
}

/** Renders the account identity, outcome, and optional disclosure indicator. */
function RepairAccountSummary({
  expandable,
  feedbackMessage,
  open,
  result,
  t,
}: RepairAccountSummaryProps) {
  return (
    <div className="grid w-full min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium">
            {result.accountName}
          </span>
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

      <div className="flex min-w-0 items-start justify-between gap-2 sm:max-w-md sm:items-center sm:justify-end">
        {feedbackMessage ? (
          <span
            className={cn(
              "min-w-0 flex-1 text-xs leading-5 break-words sm:max-w-72 sm:text-right",
              result.outcome === ACCOUNT_KEY_REPAIR_OUTCOMES.Failed
                ? "text-red-700 dark:text-red-300"
                : "dark:text-dark-text-secondary text-gray-500",
            )}
          >
            {feedbackMessage}
          </span>
        ) : null}
        <Badge
          variant={OUTCOME_BADGE_VARIANTS[result.outcome]}
          size="sm"
          className="w-fit shrink-0 border-transparent"
        >
          {getRepairOutcomeLabel(t, result.outcome)}
        </Badge>
        {expandable ? (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "dark:text-dark-text-tertiary mt-0.5 h-4 w-4 shrink-0 text-gray-500 transition-transform sm:mt-0",
              open ? "rotate-180" : "rotate-0",
            )}
          />
        ) : null}
      </div>
    </div>
  )
}

/** Renders inventory, requirement, and rename details inside one account card. */
function RepairAccountDetails({ result, t }: RepairAccountDetailsProps) {
  const renameCounts = result.renameResults.reduce(
    (counts, renameResult) => {
      counts[renameResult.outcome] += 1
      return counts
    },
    {
      [ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied]: 0,
      [ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected]: 0,
      [ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain]: 0,
    },
  )

  return (
    <div className="space-y-2.5">
      {result.inventoryIssues?.length ? (
        <ul className="space-y-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {result.inventoryIssues.map((issue) => (
            <li key={issue.code}>{getInventoryIssueLabel(t, issue)}</li>
          ))}
        </ul>
      ) : null}

      {result.requirementResults.length > 0 ? (
        <ul className="space-y-2">
          {result.requirementResults.map((requirementResult) => {
            const requirementFailureMessage =
              "failure" in requirementResult
                ? getRepairFailureMessage(t, requirementResult.failure)
                : undefined

            return (
              <li
                key={requirementResult.requirement.requirementKey}
                className="dark:border-dark-bg-tertiary flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-gray-100 px-3 py-2"
              >
                <span className="min-w-0 truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                  {requirementResult.requirement.displayName}
                </span>
                <Badge
                  variant={
                    REQUIREMENT_OUTCOME_BADGE_VARIANTS[
                      requirementResult.outcome
                    ]
                  }
                  size="sm"
                  className="shrink-0 border-transparent"
                >
                  {getRequirementOutcomeLabel(t, requirementResult.outcome)}
                </Badge>
                {requirementFailureMessage ? (
                  <p className="w-full text-xs break-words text-red-700 dark:text-red-300">
                    {requirementFailureMessage}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {result.renameResults.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {renameCounts[ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied] > 0 ? (
            <Badge variant="info" size="sm">
              {t(
                "keyManagement:repairMissingKeys.renameSummary.accountApplied",
                {
                  count:
                    renameCounts[ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied],
                },
              )}
            </Badge>
          ) : null}
          {renameCounts[ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected] > 0 ? (
            <Badge variant="danger" size="sm">
              {t(
                "keyManagement:repairMissingKeys.renameSummary.accountRejected",
                {
                  count:
                    renameCounts[ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected],
                },
              )}
            </Badge>
          ) : null}
          {renameCounts[ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain] > 0 ? (
            <Badge variant="warning" size="sm">
              {t(
                "keyManagement:repairMissingKeys.renameSummary.accountUncertain",
                {
                  count:
                    renameCounts[
                      ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain
                    ],
                },
              )}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Renders one static or expandable account result card. */
function RepairAccountCoverageItem({
  openWhenSearching,
  result,
  t,
}: RepairAccountCoverageItemProps) {
  const legacyFailure = getLegacyRepairFailure(result.errorMessage)
  const failure = result.failure ?? result.partialFailure ?? legacyFailure
  const feedbackMessage = failure
    ? getRepairFailureMessage(t, failure)
    : result.outcome === ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped
      ? getSkipReasonLabel(t, result.skipReason)
      : result.outcome === ACCOUNT_KEY_REPAIR_OUTCOMES.Failed
        ? getRepairFailureMessage(t, {
            code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
            ...(result.errorMessage?.trim()
              ? { message: result.errorMessage.trim() }
              : {}),
          })
        : ""
  const hasDetails = Boolean(
    result.inventoryIssues?.length ||
      result.requirementResults.length ||
      result.renameResults.length,
  )
  const [open, setOpen] = useState(
    hasDetails && !isSuccessfulRepairOutcome(result.outcome),
  )

  useEffect(() => {
    if (hasDetails && openWhenSearching) {
      setOpen(true)
    }
  }, [hasDetails, openWhenSearching])

  const summary = (
    <RepairAccountSummary
      expandable={hasDetails}
      feedbackMessage={feedbackMessage}
      open={open}
      result={result}
      t={t}
    />
  )

  return (
    <li data-testid={getRepairAccountResultTestId(result.accountId)}>
      {hasDetails ? (
        <Collapsible
          open={open}
          onOpenChange={setOpen}
          className="dark:border-dark-bg-tertiary overflow-hidden rounded-lg border border-gray-200"
        >
          <CollapsibleTrigger
            aria-label={t("keyManagement:actions.detailsFor", {
              name: result.accountName,
            })}
            className="dark:hover:bg-dark-bg-tertiary/60 focus-visible:ring-ring/50 w-full p-3 text-left transition-colors hover:bg-gray-50 focus-visible:ring-[3px] focus-visible:outline-none focus-visible:ring-inset"
          >
            {summary}
          </CollapsibleTrigger>
          <CollapsibleContent className="dark:border-dark-bg-tertiary border-t border-gray-100 px-3 py-2.5">
            <RepairAccountDetails result={result} t={t} />
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <div className="dark:border-dark-bg-tertiary rounded-lg border border-gray-200 p-3">
          {summary}
        </div>
      )}
    </li>
  )
}

/** Renders per-account repair outcomes and expandable result details. */
export function RepairAccountCoverageList({
  filteredResults,
  searchTerm,
  t,
}: RepairAccountCoverageListProps) {
  if (filteredResults.length === 0) {
    return (
      <EmptyState
        icon={<Search className="h-12 w-12" />}
        title={t("keyManagement:repairMissingKeys.noMatchingResults")}
        className="py-10"
      />
    )
  }

  return (
    <ul className="space-y-2 p-2">
      {filteredResults.map((result) => (
        <RepairAccountCoverageItem
          key={`${result.accountId}-${result.finishedAt}`}
          openWhenSearching={Boolean(searchTerm.trim())}
          result={result}
          t={t}
        />
      ))}
    </ul>
  )
}
