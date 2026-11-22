import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import type { TFunction } from "i18next"
import { Info } from "lucide-react"
import { useMemo, type ReactNode } from "react"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import { FinancialMetricLabel } from "~/components/FinancialMetricLabel"
import Tooltip from "~/components/Tooltip"
import { Badge, Button } from "~/components/ui"
import { CHECK_IN_SELECTION_STATUSES } from "~/constants/checkIn"
import { CURRENCIES } from "~/constants/money"
import { AccountAllowanceDetails } from "~/features/AccountManagement/components/AccountList/rows/AccountAllowanceDetails"
import { AccountConsumptionDetails } from "~/features/AccountManagement/components/AccountList/rows/AccountConsumptionDetails"
import { BalancePositionDetails } from "~/features/AccountManagement/components/AccountList/rows/BalancePositionDetails"
import { FinancialObservationDetails } from "~/features/AccountManagement/components/FinancialObservationDetails"
import { useBalanceAsOf } from "~/features/AccountManagement/data/useBalanceAsOf"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { resolveAccountTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStatsResolver"
import { getDisplayConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import { balancePositionKey } from "~/services/amounts/balance"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/inspection"
import type { AccountTodayStatsAvailability, SiteAccount } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { formatBalanceWindow } from "~/utils/core/balancePresentation"
import { getTodayMetricPresentation } from "~/utils/core/formatters"
import { formatAssetAmount } from "~/utils/core/money"
import { getHealthStatusDisplay } from "~/utils/healthStatus"

import type {
  DedupeAccountsDialogGroup,
  DedupeAccountsKeepChangeInput,
} from "./types"
import { formatTimestamp } from "./utils"

type AccountCardGroup = Pick<
  DedupeAccountsDialogGroup,
  "groupId" | "keepAccountId" | "recommendedKeepAccountId" | "hasManualOverride"
> & {
  reason: DedupeAccountsDialogGroup["key"]["reason"]
}

export interface DedupeAccountCardProps {
  account: SiteAccount
  group: AccountCardGroup
  accountLabelById: Map<string, string>
  pinnedAccountIds: string[]
  detailsOpenByAccountId: Record<string, true>
  isWorking: boolean
  t: TFunction
  onKeepChange: (input: DedupeAccountsKeepChangeInput) => void
  onToggleDetails: (accountId: string) => void
}

/**
 * One account card inside a duplicate group, with keep-selection and an expandable details panel.
 */
export function DedupeAccountCard({
  account,
  group,
  accountLabelById,
  pinnedAccountIds,
  detailsOpenByAccountId,
  isWorking,
  t,
  onKeepChange,
  onToggleDetails,
}: DedupeAccountCardProps) {
  const pinned = pinnedAccountIds.includes(account.id)
  const disabled = account.disabled === true
  const isKeep = account.id === group.keepAccountId
  const isRecommended =
    group.hasManualOverride && account.id === group.recommendedKeepAccountId
  const detailsOpen = detailsOpenByAccountId[account.id] === true
  const detailsId = `dedupe-account-details-${encodeURIComponent(account.id)}`
  const healthDisplay = getHealthStatusDisplay(account.health?.status, t)
  const checkInInspection = inspectAccountCheckIn({
    config: account.checkIn,
    siteType: account.site_type,
    siteUrl: account.site_url,
    accountDisabled: account.disabled,
  })
  const builtInCheckInSelected =
    checkInInspection.selectionState.status ===
    CHECK_IN_SELECTION_STATUSES.Selected
  const autoCheckinEnabled = account.checkIn.automaticExecutionEnabled
  const accountLabel = accountLabelById.get(account.id) ?? account.id
  const todayStatsAvailability = resolveAccountTodayStatsAvailability(account)
  const displayData = useMemo(
    () => accountPresentation.convertToDisplayData(account),
    [account],
  )
  const timeSources = useMemo(() => [displayData], [displayData])
  const asOf = useBalanceAsOf(timeSources)
  const balance =
    displayData.manualBalanceSnapshot ?? displayData.balanceSnapshot
  const referenceConsumption = displayData.referenceConsumption
  const consumption = getDisplayConsumptionProjection([
    { ...displayData, disabled: false },
  ])

  const resolveTimestamp = (timestamp?: number) => formatTimestamp(timestamp, t)
  const renderUnavailableTodayMetric = (requiresRefresh: boolean) => {
    const helpLabel = t(
      requiresRefresh
        ? "account:todayMetricAvailability.pendingRefreshHelp"
        : "account:todayMetricAvailability.unavailable",
    )
    const value = (
      <span
        aria-label={helpLabel}
        className={
          requiresRefresh
            ? "cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            : undefined
        }
        tabIndex={requiresRefresh ? 0 : undefined}
      >
        <span aria-hidden="true">
          {requiresRefresh
            ? t("account:todayMetricAvailability.pendingRefresh")
            : "—"}
        </span>
      </span>
    )

    return requiresRefresh ? (
      <Tooltip content={helpLabel}>{value}</Tooltip>
    ) : (
      value
    )
  }
  const resolveTodayMetricValue = (
    metric: keyof AccountTodayStatsAvailability,
    value: number | undefined,
  ) => {
    const presentation = getTodayMetricPresentation(
      value ?? 0,
      todayStatsAvailability[metric],
    )

    if (presentation.value === null || value === undefined) {
      return renderUnavailableTodayMetric(presentation.requiresRefresh)
    }

    return presentation.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial ? (
      <>
        {presentation.value} ·{" "}
        <span>{t("account:todayMetricAvailability.partial")}</span>
      </>
    ) : (
      presentation.value
    )
  }
  const tokenPresentation = getTodayMetricPresentation(
    (account.account_info?.today_prompt_tokens ?? 0) +
      (account.account_info?.today_completion_tokens ?? 0),
    todayStatsAvailability.tokens,
  )

  return (
    <div
      className={`flex flex-col gap-x-2 gap-y-density-2 rounded-md border border-border-subtle px-3 py-density-3 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:border-border ${
        isWorking
          ? "cursor-not-allowed opacity-70"
          : "cursor-pointer hover:bg-surface-subtle dark:hover:bg-foreground/5"
      }`}
    >
      <div className="flex flex-col gap-x-2 gap-y-density-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-w-0 items-start gap-x-3 gap-y-density-3">
          <input
            type="radio"
            name={`dedupe-keep-${encodeURIComponent(group.groupId)}`}
            className="mt-density-1 h-3 w-3"
            checked={isKeep}
            disabled={isWorking}
            onChange={() =>
              onKeepChange({
                groupId: group.groupId,
                selectedAccountId: account.id,
                recommendedAccountId: group.recommendedKeepAccountId,
              })
            }
          />

          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {accountLabel}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {account.site_url}
            </div>
          </div>
        </label>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-density-2">
          {pinned && (
            <Badge size="sm" variant="secondary">
              {t("account:actions.pinned")}
            </Badge>
          )}
          {disabled && (
            <Badge size="sm" variant="secondary">
              {t("account:list.site.disabled")}
            </Badge>
          )}
          {isRecommended && (
            <Badge size="sm" variant="secondary">
              {t("ui:dialog.dedupeAccounts.recommended")}
            </Badge>
          )}
          <Badge size="sm" variant={isKeep ? "success" : "destructive"}>
            {isKeep
              ? t("ui:dialog.dedupeAccounts.keep")
              : t("ui:dialog.dedupeAccounts.delete")}
          </Badge>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<Info />}
            className="min-h-(--density-control-tight) px-2 text-xs"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            disabled={isWorking}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleDetails(account.id)
            }}
          >
            {detailsOpen
              ? t("ui:dialog.dedupeAccounts.detailsToggle.hide")
              : t("ui:dialog.dedupeAccounts.detailsToggle.show")}
          </Button>
        </div>
      </div>

      <AnimatedDetails open={detailsOpen} id={detailsId}>
        <div className="rounded-md border border-border-subtle bg-surface-subtle px-3 py-density-3 text-xs text-secondary-foreground dark:border-border dark:bg-secondary/40">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-density-2 sm:grid-cols-2">
            <div className="space-y-0.5">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.health")}
              </dt>
              <dd className="flex items-center gap-x-2 gap-y-density-2 text-secondary-foreground">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${healthDisplay.color}`}
                  aria-hidden="true"
                />
                <span>{healthDisplay.text}</span>
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.healthReason")}
              </dt>
              <dd className="break-words text-secondary-foreground">
                {account.health?.reason || t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.lastSync")}
              </dt>
              <dd className="text-secondary-foreground">
                {resolveTimestamp(account.last_sync_time)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.updatedAt")}
              </dt>
              <dd className="text-secondary-foreground">
                {resolveTimestamp(account.updated_at)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.createdAt")}
              </dt>
              <dd className="text-secondary-foreground">
                {resolveTimestamp(account.created_at)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.userId")}
              </dt>
              <dd className="text-secondary-foreground">
                {account.account_info?.id ?? t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                <FinancialMetricLabel kind={FINANCIAL_METRIC_KINDS.Balance}>
                  {t("account:financial.details")}
                </FinancialMetricLabel>
              </dt>
              <dd className="break-all text-secondary-foreground">
                {balance?.positions.length ? (
                  <dl>
                    {balance.positions.map((position) => (
                      <BalancePositionDetails
                        key={balancePositionKey(position)}
                        position={position}
                        asOf={asOf}
                      />
                    ))}
                  </dl>
                ) : account.account_info.allowances?.entries.length ? null : (
                  t("account:financial.unavailable")
                )}
                {account.account_info.allowances && (
                  <AccountAllowanceDetails
                    snapshot={account.account_info.allowances}
                  />
                )}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                <FinancialMetricLabel kind={FINANCIAL_METRIC_KINDS.Consumption}>
                  {t("ui:dialog.dedupeAccounts.details.todayConsumption")}
                </FinancialMetricLabel>
              </dt>
              <dd className="break-all text-secondary-foreground">
                {consumption.groups.length ? (
                  consumption.groups.map((group, index) => (
                    <div key={index}>
                      {formatAssetAmount(group.amount)}
                      {group.coverage.status ===
                        ACCOUNT_TODAY_METRIC_STATUSES.Partial &&
                        ` · ${t("account:todayMetricAvailability.partial")}`}
                      {formatBalanceWindow(group.window, t).map((line) => (
                        <span
                          className="block text-muted-foreground"
                          key={line}
                        >
                          {line}
                        </span>
                      ))}
                    </div>
                  ))
                ) : referenceConsumption ? (
                  <div>
                    {formatAssetAmount({
                      asset: {
                        kind: ASSET_KINDS.Currency,
                        code: CURRENCIES.USD,
                      },
                      value: String(referenceConsumption.amount.USD),
                    })}
                    {" · "}
                    {t("account:financial.legacy")}
                    {referenceConsumption.lastKnown &&
                      ` · ${t("account:financial.lastKnown")}`}
                  </div>
                ) : (
                  renderUnavailableTodayMetric(
                    getTodayMetricPresentation(
                      0,
                      todayStatsAvailability.consumption,
                    ).requiresRefresh,
                  )
                )}
              </dd>
            </div>

            {!!(
              account.account_info.settledConsumption?.length ||
              account.account_info.reportedIncome?.length ||
              account.account_info.usage?.cost ||
              account.account_info.usageObservations?.some(
                (usage) => usage.cost,
              ) ||
              referenceConsumption ||
              displayData.referenceIncome
            ) && (
              <div className="space-y-0.5 sm:col-span-2">
                <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t("account:financial.usagePeriod")}
                </dt>
                <dd>
                  <AccountConsumptionDetails site={displayData} />
                </dd>
              </div>
            )}

            <div className="space-y-0.5">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.todayRequests")}
              </dt>
              <dd className="break-all text-secondary-foreground">
                {resolveTodayMetricValue(
                  "requests",
                  account.account_info?.today_requests_count,
                )}
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.todayTokens")}
              </dt>
              <dd className="break-all text-secondary-foreground">
                {tokenPresentation.value === null ? (
                  renderUnavailableTodayMetric(
                    tokenPresentation.requiresRefresh,
                  )
                ) : tokenPresentation.status ===
                  ACCOUNT_TODAY_METRIC_STATUSES.Partial ? (
                  <>
                    {tokenPresentation.value} ·{" "}
                    <span>{t("account:todayMetricAvailability.partial")}</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">
                      {t("account:stats.prompt")}:
                    </span>{" "}
                    {account.account_info?.today_prompt_tokens ?? 0} ·{" "}
                    <span className="font-medium">
                      {t("account:stats.completion")}:
                    </span>{" "}
                    {account.account_info?.today_completion_tokens ?? 0}
                  </>
                )}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.checkinDetection")}
              </dt>
              <dd className="text-secondary-foreground">
                {builtInCheckInSelected
                  ? t("common:status.enabled")
                  : t("common:status.disabled")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.autoCheckin")}
              </dt>
              <dd className="text-secondary-foreground">
                {autoCheckinEnabled
                  ? t("common:status.enabled")
                  : t("common:status.disabled")}
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.customCheckinUrl")}
              </dt>
              <dd className="font-mono break-all text-secondary-foreground">
                {account.checkIn?.customCheckIn?.url ||
                  t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.notes")}
              </dt>
              <dd className="break-words text-secondary-foreground">
                {account.notes || t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ui:dialog.dedupeAccounts.details.excludeFromTotalBalance")}
              </dt>
              <dd className="text-secondary-foreground">
                {account.excludeFromTotalBalance === true
                  ? t("common:status.enabled")
                  : t("common:status.disabled")}
              </dd>
            </div>
          </dl>
          <div className="mt-3">
            <FinancialObservationDetails>
              <dl className="space-y-2">
                <div>
                  <dt>{t("ui:dialog.dedupeAccounts.details.accountId")}</dt>
                  <dd className="font-mono break-all">{account.id}</dd>
                </div>
                <div>
                  <dt>{t("ui:dialog.dedupeAccounts.details.siteType")}</dt>
                  <dd>
                    {account.site_type || t("common:labels.notAvailable")}
                  </dd>
                </div>
                <div>
                  <dt>{t("ui:dialog.dedupeAccounts.details.authType")}</dt>
                  <dd>{account.authType || t("common:labels.notAvailable")}</dd>
                </div>
              </dl>
            </FinancialObservationDetails>
          </div>
        </div>
      </AnimatedDetails>
    </div>
  )
}

/** Keeps closed detail content unmounted while letting the visible panel settle. */
function AnimatedDetails({
  open,
  id,
  children,
}: {
  open: boolean
  id: string
  children: ReactNode
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id}
          className="overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.2,
            ease: "easeOut",
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
