import type { TFunction } from "i18next"
import { Trans } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import type { AccountDedupeKeepStrategy } from "~/services/accounts/accountDedupe"

import { DedupeAccountsGroupsList } from "./DedupeAccountsGroupsList"
import type {
  DedupeAccountsDialogGroup,
  DedupeAccountsKeepChangeInput,
} from "./types"

const STRATEGIES: Array<{
  value: AccountDedupeKeepStrategy
}> = [
  {
    value: "keepPinned",
  },
  {
    value: "keepEnabled",
  },
  {
    value: "keepMostRecentlyUpdated",
  },
]

/**
 * Resolve the localized label for a dedupe keep-strategy option.
 */
function getDedupeStrategyLabel(
  t: TFunction,
  strategy: AccountDedupeKeepStrategy,
) {
  switch (strategy) {
    case "keepPinned":
      return t("ui:dialog.dedupeAccounts.strategy.keepPinned")
    case "keepEnabled":
      return t("ui:dialog.dedupeAccounts.strategy.keepEnabled")
    case "keepMostRecentlyUpdated":
      return t("ui:dialog.dedupeAccounts.strategy.keepMostRecentlyUpdated")
  }
}

export interface DedupeAccountsDialogBodyProps {
  strategy: AccountDedupeKeepStrategy
  onStrategyChange: (strategy: AccountDedupeKeepStrategy) => void
  groups: DedupeAccountsDialogGroup[]
  accountLabelById: Map<string, string>
  deleteCount: number
  pinnedAccountIds: string[]
  orderedIndexByAccountId: Map<string, number>
  detailsOpenByAccountId: Record<string, true>
  onKeepChange: (input: DedupeAccountsKeepChangeInput) => void
  onToggleDetails: (accountId: string) => void
  unscannableCount: number
  hasSuspectedGroups?: boolean
  isWorking: boolean
  t: TFunction
}

/**
 * Modal content for the dedupe flow: strategy selector, preview list, and scan hints.
 */
export function DedupeAccountsDialogBody({
  strategy,
  onStrategyChange,
  groups,
  accountLabelById,
  deleteCount,
  pinnedAccountIds,
  orderedIndexByAccountId,
  detailsOpenByAccountId,
  onKeepChange,
  onToggleDetails,
  unscannableCount,
  hasSuspectedGroups = false,
  isWorking,
  t,
}: DedupeAccountsDialogBodyProps) {
  return (
    <div className="space-y-density-4">
      {groups.length > 0 && (
        <>
          <h3 className="text-foreground text-sm font-semibold">
            {t("ui:dialog.dedupeAccounts.exactTitle")}
          </h3>
          <div className="gap-y-density-3 flex flex-col gap-x-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-density-1 min-w-0">
              <div className="text-foreground text-sm font-medium">
                {t("ui:dialog.dedupeAccounts.strategyLabel")}
              </div>
              <Select
                value={strategy}
                disabled={isWorking}
                onValueChange={(value) =>
                  onStrategyChange(value as AccountDedupeKeepStrategy)
                }
              >
                <SelectTrigger className="w-full sm:w-[320px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {getDedupeStrategyLabel(t, item.value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
              {t("ui:dialog.dedupeAccounts.summary", {
                groups: groups.length,
                deleteCount,
              })}
            </div>
          </div>
        </>
      )}

      {groups.length > 0 && (
        <div className="text-muted-foreground text-xs">
          {t("ui:dialog.dedupeAccounts.manualPickHint")}
        </div>
      )}

      {groups.length === 0 ? (
        !hasSuspectedGroups && (
          <div className="dark:bg-secondary/30 dark:text-secondary-foreground border-border bg-surface-subtle text-muted-foreground py-density-4 rounded-lg border px-4 text-sm">
            {t("ui:dialog.dedupeAccounts.empty")}
          </div>
        )
      ) : (
        <DedupeAccountsGroupsList
          groups={groups}
          accountLabelById={accountLabelById}
          orderedIndexByAccountId={orderedIndexByAccountId}
          pinnedAccountIds={pinnedAccountIds}
          detailsOpenByAccountId={detailsOpenByAccountId}
          isWorking={isWorking}
          t={t}
          onKeepChange={onKeepChange}
          onToggleDetails={onToggleDetails}
        />
      )}

      {unscannableCount > 0 && (
        <div className="border-warning-border bg-warning-soft text-warning-soft-foreground py-density-4 rounded-lg border px-4 text-sm">
          <Trans
            t={t}
            i18nKey="ui:dialog.dedupeAccounts.unscannableHint"
            values={{ count: unscannableCount }}
          />
        </div>
      )}
    </div>
  )
}
