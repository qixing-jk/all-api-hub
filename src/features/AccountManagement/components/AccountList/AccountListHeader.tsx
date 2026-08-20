import { ChevronDown, ChevronUp, XIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button, IconButton } from "~/components/ui"
import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
  DATA_TYPE_INCOME,
} from "~/constants"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { cn } from "~/lib/utils"
import type { ActiveSortField, SortField, SortOrder } from "~/types"

interface AccountListHeaderProps {
  displayedResultCount: number
  inSearchMode: boolean
  isBulkBusy: boolean
  isBulkMode: boolean
  onBulkModeEnter: () => void
  onBulkModeExit: () => void
  onClearSort: () => void
  onSort: (field: SortField) => void
  showTodayCashflow: boolean
  sortField: ActiveSortField
  sortOrder: SortOrder
}

interface AccountListSortButtonProps {
  activeSortField: ActiveSortField
  disabled: boolean
  field: SortField
  label: string
  onSort: (field: SortField) => void
  sortLabel: string
  sortOrder: SortOrder
}

/** Renders one sort field while preserving the active direction indicator. */
function AccountListSortButton({
  activeSortField,
  disabled,
  field,
  label,
  onSort,
  sortLabel,
  sortOrder,
}: AccountListSortButtonProps) {
  const isActive = activeSortField === field

  return (
    <IconButton
      onClick={() => onSort(field)}
      variant="ghost"
      size="none"
      disabled={disabled}
      aria-label={`${sortLabel} ${label}`}
      className={cn(
        "min-h-6 space-x-0.5 rounded-md px-1.5 text-xs font-medium sm:space-x-1",
        isActive &&
          "bg-blue-100/80 font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-950/80",
      )}
    >
      <span>{label}</span>
      {isActive &&
        (sortOrder === "asc" ? (
          <ChevronUp className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        ) : (
          <ChevronDown className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        ))}
    </IconButton>
  )
}

/** Responsive account-list sorting and bulk-management controls. */
export function AccountListHeader({
  displayedResultCount,
  inSearchMode,
  isBulkBusy,
  isBulkMode,
  onBulkModeEnter,
  onBulkModeExit,
  onClearSort,
  onSort,
  showTodayCashflow,
  sortField,
  sortOrder,
}: AccountListHeaderProps) {
  const { t } = useTranslation(["account", "common"])
  const renderSortButton = (field: SortField, label: string) => (
    <AccountListSortButton
      activeSortField={sortField}
      disabled={inSearchMode}
      field={field}
      label={label}
      onSort={onSort}
      sortLabel={t("account:list.sort")}
      sortOrder={sortOrder}
    />
  )

  return (
    <div
      className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-3 py-2 sm:px-5"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListHeader}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div
          className="dark:border-dark-bg-tertiary order-2 grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-t border-gray-200/70 pt-1.5 sm:order-1 sm:flex sm:w-auto sm:flex-1 sm:items-center sm:border-0 sm:pt-0"
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListSortControls}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2">
              {renderSortButton("name", t("account:list.header.account"))}
              {renderSortButton(
                DATA_TYPE_CREATED_AT,
                t("account:list.header.createdAt"),
              )}
            </div>
            <span
              aria-hidden="true"
              className="dark:bg-dark-bg-tertiary hidden h-3.5 w-px shrink-0 bg-gray-300 sm:block"
            />
            <div className="flex min-w-0 flex-wrap items-center gap-x-2">
              {renderSortButton(
                DATA_TYPE_BALANCE,
                t("account:list.header.balance"),
              )}
              {showTodayCashflow && (
                <>
                  {renderSortButton(
                    DATA_TYPE_CONSUMPTION,
                    t("account:list.header.todayConsumption"),
                  )}
                  {renderSortButton(
                    DATA_TYPE_INCOME,
                    t("account:list.header.todayIncome"),
                  )}
                </>
              )}
            </div>
          </div>
          {sortField !== null && !inSearchMode ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs font-normal text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              leftIcon={<XIcon aria-hidden="true" className="size-3" />}
              onClick={onClearSort}
              aria-label={t("account:list.clearSort")}
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.accountListClearSortButton
              }
            >
              {t("account:list.clearSort")}
            </Button>
          ) : null}
        </div>

        <div
          className="order-1 flex w-full shrink-0 items-center justify-between gap-2 sm:order-2 sm:w-auto sm:justify-end"
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListUtilities}
        >
          <span className="dark:text-dark-text-tertiary text-xs font-medium whitespace-nowrap text-gray-500">
            {t("common:total") + ": " + displayedResultCount}
          </span>
          <Button
            type="button"
            variant={isBulkMode ? "secondary" : "outline"}
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={isBulkMode ? onBulkModeExit : onBulkModeEnter}
            disabled={isBulkBusy}
          >
            {isBulkMode ? t("account:bulk.exit") : t("account:bulk.manage")}
          </Button>
        </div>
      </div>
    </div>
  )
}
