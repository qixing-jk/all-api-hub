import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ListChecks,
  ListOrdered,
  Plus,
  RotateCcw,
  Settings2,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Button, IconButton } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CHECK_IN_REQUIREMENT,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
  DATA_TYPE_HEALTH_STATUS,
  DATA_TYPE_INCOME,
} from "~/constants"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementSortButtonTestId,
} from "~/features/AccountManagement/testIds"
import { cn } from "~/lib/utils"
import type { ActiveSortField, SortField, SortOrder } from "~/types"
import { openSettingsTab } from "~/utils/navigation"

interface AccountListHeaderProps {
  displayedResultCount: number
  inSearchMode: boolean
  isBulkBusy: boolean
  isBulkMode: boolean
  isReorderLoading: boolean
  isReorderMode: boolean
  onAddAccount: () => void
  onBulkModeEnter: () => void
  onBulkModeExit: () => void
  onClearSort: () => void
  onReorderModeEnter: () => void
  onReorderModeExit: () => void
  onSort: (field: SortField) => void
  reorderDisabledReason: string | null
  showTodayCashflow: boolean
  sortField: ActiveSortField
  sortOrder: SortOrder
}

/** Compact account-list actions with a single unified sort control. */
export function AccountListHeader({
  displayedResultCount,
  inSearchMode,
  isBulkBusy,
  isBulkMode,
  isReorderLoading,
  isReorderMode,
  onAddAccount,
  onBulkModeEnter,
  onBulkModeExit,
  onClearSort,
  onReorderModeEnter,
  onReorderModeExit,
  onSort,
  reorderDisabledReason,
  showTodayCashflow,
  sortField,
  sortOrder,
}: AccountListHeaderProps) {
  const { t } = useTranslation(["account", "common"])
  const sortOptions: Array<{ field: SortField; label: string }> = [
    {
      field: DATA_TYPE_CREATED_AT,
      label: t("account:list.header.createdAt"),
    },
    {
      field: DATA_TYPE_CHECK_IN_REQUIREMENT,
      label: t("account:list.header.checkInRequirement"),
    },
    {
      field: DATA_TYPE_HEALTH_STATUS,
      label: t("account:list.header.healthStatus"),
    },
    { field: DATA_TYPE_BALANCE, label: t("account:list.header.balance") },
  ]
  if (showTodayCashflow) {
    sortOptions.push(
      {
        field: DATA_TYPE_CONSUMPTION,
        label: t("account:list.header.todayConsumption"),
      },
      {
        field: DATA_TYPE_INCOME,
        label: t("account:list.header.todayIncome"),
      },
    )
  }
  const activeSortOption = sortOptions.find(
    (option) => option.field === sortField,
  )
  const hasActiveSort = activeSortOption !== undefined && !inSearchMode
  const reorderLabel = isReorderMode
    ? t("account:list.reorderDone")
    : t("account:list.reorder")
  const bulkModeLabel = isBulkMode
    ? t("account:bulk.exit")
    : t("account:bulk.manage")
  const reorderButton = (
    <Button
      type="button"
      variant={isReorderMode ? "secondary" : "ghost"}
      size="sm"
      className={cn(
        "h-9 max-w-none shrink-0 px-2.5 text-xs whitespace-nowrap",
        reorderDisabledReason !== null &&
          "aria-disabled:pointer-events-auto aria-disabled:cursor-not-allowed",
      )}
      leftIcon={
        isReorderMode ? (
          <Check aria-hidden="true" className="size-3.5" />
        ) : (
          <ListOrdered aria-hidden="true" className="size-3.5" />
        )
      }
      onClick={() => {
        if (reorderDisabledReason !== null) return
        if (isReorderMode) {
          onReorderModeExit()
          return
        }
        onReorderModeEnter()
      }}
      aria-disabled={reorderDisabledReason !== null}
      aria-label={reorderLabel}
      aria-pressed={isReorderMode}
      loading={isReorderLoading}
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListReorderButton}
    >
      <span className="hidden sm:inline">{reorderLabel}</span>
    </Button>
  )

  return (
    <div
      className="flex min-w-0 flex-wrap items-center justify-start gap-1.5 sm:justify-end"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListHeader}
    >
      <span className="dark:text-dark-text-tertiary mr-1 hidden text-xs font-medium whitespace-nowrap text-gray-500 xl:inline">
        {t("common:total") + ": " + displayedResultCount}
      </span>

      <div
        className="flex shrink-0 items-center gap-1"
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListSortControls}
      >
        <div
          className={cn(
            "dark:border-dark-bg-tertiary flex h-9 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-transparent transition-colors",
            hasActiveSort &&
              "border-primary/40 bg-primary/5 text-primary dark:border-primary/50 dark:bg-primary/10",
          )}
        >
          <IconButton
            type="button"
            variant="ghost"
            size="none"
            className="h-full w-9 rounded-none border-r border-gray-200/70 dark:border-gray-700"
            onClick={() => activeSortOption && onSort(activeSortOption.field)}
            disabled={!hasActiveSort}
            aria-label={t("account:list.toggleSortOrder")}
            data-testid={
              ACCOUNT_MANAGEMENT_TEST_IDS.accountListSortDirectionButton
            }
          >
            {hasActiveSort ? (
              sortOrder === "asc" ? (
                <ArrowUp aria-hidden="true" className="size-4" />
              ) : (
                <ArrowDown aria-hidden="true" className="size-4" />
              )
            ) : (
              <ArrowUpDown aria-hidden="true" className="size-4" />
            )}
          </IconButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-full max-w-none gap-1 rounded-none px-2.5 text-xs whitespace-nowrap"
                disabled={inSearchMode}
                aria-label={t("account:list.sortMenu")}
                data-testid={
                  ACCOUNT_MANAGEMENT_TEST_IDS.accountListSortMenuButton
                }
              >
                {activeSortOption?.label ?? t("account:list.sortMenu")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuRadioGroup
                value={activeSortOption?.field}
                onValueChange={(value) => {
                  const field = value as SortField
                  if (field !== sortField) onSort(field)
                }}
              >
                {sortOptions.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.field}
                    value={option.field}
                    data-testid={getAccountManagementSortButtonTestId(
                      option.field,
                    )}
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={sortField === null}
                onSelect={onClearSort}
                data-testid={
                  ACCOUNT_MANAGEMENT_TEST_IDS.accountListClearSortButton
                }
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                {t("account:list.resetSort")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Tooltip content={t("settings:sorting.title")}>
          <IconButton
            variant="ghost"
            size="none"
            className="size-7 shrink-0 rounded-md"
            aria-label={t("settings:sorting.title")}
            onClick={() =>
              void openSettingsTab("accountManagement", {
                anchor: SETTINGS_ANCHORS.SORTING_PRIORITY,
                preserveHistory: true,
              })
            }
          >
            <Settings2 aria-hidden="true" className="size-3.5" />
          </IconButton>
        </Tooltip>
      </div>

      <div
        className="flex shrink-0 items-center gap-1"
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListUtilities}
      >
        {reorderDisabledReason === null ? (
          reorderButton
        ) : (
          <Tooltip
            anchorAsChild
            content={reorderDisabledReason}
            position="bottom-end"
          >
            {reorderButton}
          </Tooltip>
        )}
        <Button
          type="button"
          variant={isBulkMode ? "secondary" : "ghost"}
          size="sm"
          className="h-9 max-w-none shrink-0 px-2.5 text-xs whitespace-nowrap"
          leftIcon={
            isBulkMode ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : (
              <ListChecks aria-hidden="true" className="size-3.5" />
            )
          }
          onClick={isBulkMode ? onBulkModeExit : onBulkModeEnter}
          disabled={isBulkBusy || isReorderMode}
          aria-label={bulkModeLabel}
          aria-pressed={isBulkMode}
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListBulkManageButton}
        >
          <span className="hidden lg:inline">{bulkModeLabel}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 max-w-none shrink-0 px-3 text-xs whitespace-nowrap"
          leftIcon={<Plus aria-hidden="true" className="size-4" />}
          onClick={onAddAccount}
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton}
        >
          {t("account:addAccount")}
        </Button>
      </div>
    </div>
  )
}
