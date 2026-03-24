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

interface DedupeAccountsDialogBodyProps {
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
  isWorking,
  t,
}: DedupeAccountsDialogBodyProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="dark:text-dark-text-primary text-sm font-medium text-gray-900">
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

        <div className="dark:text-dark-text-secondary text-sm text-gray-500">
          {t("ui:dialog.dedupeAccounts.summary", {
            groups: groups.length,
            deleteCount,
          })}
        </div>
      </div>

      {groups.length > 0 && (
        <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
          {t("ui:dialog.dedupeAccounts.manualPickHint")}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-tertiary/30 dark:text-dark-text-secondary rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          {t("ui:dialog.dedupeAccounts.empty")}
        </div>
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
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
