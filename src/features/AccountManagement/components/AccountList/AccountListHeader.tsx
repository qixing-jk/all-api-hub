import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronDown,
  Link,
  ListChecks,
  ListOrdered,
  MoreHorizontal,
  Settings2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react"
import { Fragment } from "react"
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
  DATA_TYPE_CUSTOM_CHECK_IN_URL,
  DATA_TYPE_CUSTOM_REDEEM_URL,
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
  onBulkModeEnter: () => void
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
  onBulkModeEnter,
  onClearSort,
  onReorderModeEnter,
  onReorderModeExit,
  onSort,
  reorderDisabledReason,
  showTodayCashflow,
  sortField,
  sortOrder,
}: AccountListHeaderProps) {
  const { t } = useTranslation(["account", "common", "settings"])
  const sortOptions: Array<{
    field: SortField
    label: string
    icon: LucideIcon
  }> = [
    {
      field: DATA_TYPE_BALANCE,
      icon: Wallet,
      label: t("account:list.header.balance"),
    },
  ]
  if (showTodayCashflow) {
    sortOptions.push(
      {
        field: DATA_TYPE_CONSUMPTION,
        icon: TrendingDown,
        label: t("account:list.header.todayConsumption"),
      },
      {
        field: DATA_TYPE_INCOME,
        icon: TrendingUp,
        label: t("account:list.header.todayIncome"),
      },
    )
  }
  sortOptions.push(
    {
      field: DATA_TYPE_CHECK_IN_REQUIREMENT,
      icon: CalendarCheck,
      label: t("account:list.header.checkInRequirement"),
    },
    {
      field: DATA_TYPE_HEALTH_STATUS,
      icon: Activity,
      label: t("account:list.header.healthStatus"),
    },
    {
      field: DATA_TYPE_CUSTOM_CHECK_IN_URL,
      icon: Link,
      label: t("settings:sorting.customCheckInUrl"),
    },
    {
      field: DATA_TYPE_CUSTOM_REDEEM_URL,
      icon: Link,
      label: t("settings:sorting.customRedeemUrl"),
    },
    {
      field: DATA_TYPE_CREATED_AT,
      icon: CalendarClock,
      label: t("account:list.header.createdAt"),
    },
  )
  const activeSortOption = sortOptions.find(
    (option) => option.field === sortField,
  )
  const hasActiveSort = activeSortOption !== undefined && !inSearchMode
  const reorderLabel = isReorderMode
    ? t("account:list.reorderDone")
    : t("account:list.reorder")
  const bulkModeLabel = t("account:bulk.manage")
  const openSortingSettings = () =>
    void openSettingsTab("accountManagement", {
      anchor: SETTINGS_ANCHORS.SORTING_PRIORITY,
      preserveHistory: true,
    })
  const reorderButton = (
    <Button
      type="button"
      variant={isReorderMode ? "secondary" : "ghost"}
      size="sm"
      className={cn(
        "min-h-(--density-control-tight) max-w-none shrink-0 px-2 py-0 text-xs whitespace-nowrap",
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
      <span>{reorderLabel}</span>
    </Button>
  )

  return (
    <div
      className="border-border/80 bg-surface-subtle/40 dark:border-foreground/10 dark:bg-foreground/[0.015] flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-y px-3 py-1.5 sm:px-4"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListHeader}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground text-xs font-medium whitespace-nowrap">
          <span className="sr-only [@container(min-width:24rem)]:not-sr-only">
            {t("common:total") + ": "}
          </span>
          {displayedResultCount}
        </span>

        <div
          className="flex shrink-0 items-center gap-1"
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListSortControls}
        >
          <div
            className={cn(
              "bg-muted/70 dark:bg-foreground/5 flex h-(--density-control-tight) shrink-0 items-center rounded-md transition-colors",
              hasActiveSort &&
                "bg-theme-50/70 text-theme-700 dark:bg-theme-950/40 dark:text-theme-300",
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-(--density-control-tight) max-w-none gap-1 rounded-sm px-2 py-0 text-xs whitespace-nowrap has-[>svg]:px-2"
                  disabled={inSearchMode}
                  aria-label={t("account:list.sortMenu")}
                  data-testid={
                    ACCOUNT_MANAGEMENT_TEST_IDS.accountListSortMenuButton
                  }
                >
                  {activeSortOption?.label ?? t("account:list.sortMenu")}
                  <ChevronDown
                    aria-hidden="true"
                    className="text-faint-foreground size-3"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-max max-w-[calc(100vw-2rem)] min-w-40"
              >
                <DropdownMenuRadioGroup
                  value={activeSortOption?.field}
                  onValueChange={(value) => {
                    const field = value as SortField
                    if (field !== sortField) onSort(field)
                  }}
                >
                  {sortOptions.map((option) => (
                    <Fragment key={option.field}>
                      {option.field === DATA_TYPE_CHECK_IN_REQUIREMENT && (
                        <DropdownMenuSeparator className="mx-1" />
                      )}
                      <DropdownMenuRadioItem
                        className="data-[state=checked]:bg-accent gap-2 py-1.5 pr-7 pl-2 text-xs data-[state=checked]:font-medium [&>span:first-child]:right-2 [&>span:first-child]:left-auto"
                        value={option.field}
                        data-testid={getAccountManagementSortButtonTestId(
                          option.field,
                        )}
                      >
                        <option.icon
                          aria-hidden="true"
                          className="text-muted-foreground size-3.5"
                        />
                        <span>{option.label}</span>
                      </DropdownMenuRadioItem>
                    </Fragment>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <span
              aria-hidden="true"
              className="h-3 w-px bg-current opacity-15"
            />
            <IconButton
              type="button"
              variant="ghost"
              size="none"
              className="size-(--density-control-tight) rounded-sm"
              onClick={() => activeSortOption && onSort(activeSortOption.field)}
              disabled={!hasActiveSort}
              aria-label={t("account:list.toggleSortOrder")}
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.accountListSortDirectionButton
              }
            >
              {hasActiveSort ? (
                sortOrder === "asc" ? (
                  <ArrowUp aria-hidden="true" className="size-3.5" />
                ) : (
                  <ArrowDown aria-hidden="true" className="size-3.5" />
                )
              ) : (
                <ArrowUpDown aria-hidden="true" className="size-3.5" />
              )}
            </IconButton>

            {sortField !== null && !inSearchMode && (
              <>
                <span
                  aria-hidden="true"
                  className="h-3 w-px bg-current opacity-15"
                />
                <Tooltip content={t("account:list.resetSort")}>
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="none"
                    className="size-(--density-control-tight) rounded-sm"
                    onClick={onClearSort}
                    aria-label={t("account:list.resetSort")}
                    data-testid={
                      ACCOUNT_MANAGEMENT_TEST_IDS.accountListClearSortButton
                    }
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </div>
          <div className="hidden [@container(min-width:40rem)]:block">
            <Tooltip content={t("settings:sorting.title")}>
              <IconButton
                variant="ghost"
                size="none"
                className="text-muted-foreground size-(--density-control-tight) shrink-0 rounded-md"
                aria-label={t("settings:sorting.title")}
                onClick={openSortingSettings}
              >
                <Settings2 aria-hidden="true" className="size-3.5" />
              </IconButton>
            </Tooltip>
          </div>
        </div>
      </div>
      <div
        className="ml-auto flex shrink-0 items-center gap-1"
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListUtilities}
      >
        <div
          className={cn(
            !isReorderMode && "hidden [@container(min-width:40rem)]:block",
          )}
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
        </div>
        {!isBulkMode && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-(--density-control-tight) w-(--density-control-tight) max-w-none shrink-0 px-0 py-0 text-xs whitespace-nowrap [@container(min-width:24rem)]:w-auto [@container(min-width:24rem)]:px-2"
            leftIcon={<ListChecks aria-hidden="true" className="size-3.5" />}
            onClick={onBulkModeEnter}
            disabled={isBulkBusy || isReorderMode}
            aria-label={bulkModeLabel}
            title={bulkModeLabel}
            data-testid={
              ACCOUNT_MANAGEMENT_TEST_IDS.accountListBulkManageButton
            }
          >
            <span className="hidden [@container(min-width:24rem)]:inline">
              {bulkModeLabel}
            </span>
          </Button>
        )}
        <div className="[@container(min-width:40rem)]:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                variant="ghost"
                size="none"
                className="size-(--density-control-tight)"
                aria-label={t("common:actions.more")}
              >
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-w-[calc(100vw-1.5rem)]"
            >
              <DropdownMenuItem
                disabled={reorderDisabledReason !== null}
                onSelect={
                  isReorderMode ? onReorderModeExit : onReorderModeEnter
                }
              >
                <ListOrdered aria-hidden="true" className="size-4" />
                {reorderLabel}
              </DropdownMenuItem>
              {reorderDisabledReason && (
                <p className="text-muted-foreground max-w-64 px-2 py-1 text-xs">
                  {reorderDisabledReason}
                </p>
              )}
              <DropdownMenuItem onSelect={openSortingSettings}>
                <Settings2 aria-hidden="true" className="size-4" />
                {t("settings:sorting.title")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
