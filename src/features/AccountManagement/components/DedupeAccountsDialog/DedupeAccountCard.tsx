import type { TFunction } from "i18next"
import { Info } from "lucide-react"

import Tooltip from "~/components/Tooltip"
import { Badge, Button } from "~/components/ui"
import { CHECK_IN_SELECTION_STATUSES } from "~/constants/checkIn"
import { resolveAccountTodayStatsAvailability } from "~/services/accounts/accountTodayStatsResolver"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
import type { AccountTodayStatsAvailability, SiteAccount } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { getTodayMetricPresentation } from "~/utils/core/formatters"

import { getHealthStatusDisplay } from "../../utils/healthStatusUtils"
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
            ? "focus-visible:ring-ring cursor-help rounded-sm outline-none focus-visible:ring-2"
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

    if (presentation.value === null) {
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
      className={`dark:border-border focus-within:border-ring focus-within:ring-ring/50 border-border-subtle gap-y-density-2 py-density-3 flex flex-col gap-x-2 rounded-md border px-3 transition-[color,box-shadow] focus-within:ring-[3px] ${
        isWorking
          ? "cursor-not-allowed opacity-70"
          : "hover:bg-surface-subtle dark:hover:bg-foreground/5 cursor-pointer"
      }`}
    >
      <div className="gap-y-density-2 flex flex-col gap-x-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="gap-y-density-3 flex min-w-0 items-start gap-x-3">
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
            <div className="text-foreground truncate text-sm font-medium">
              {accountLabel}
            </div>
            <div className="text-muted-foreground truncate text-xs">
              {account.site_url}
            </div>
          </div>
        </label>

        <div className="gap-y-density-2 flex flex-wrap items-center gap-x-2">
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

      {detailsOpen && (
        <div
          id={detailsId}
          className="dark:border-border dark:bg-secondary/40 border-border-subtle bg-surface-subtle text-secondary-foreground py-density-3 rounded-md border px-3 text-xs"
        >
          <dl className="gap-y-density-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.accountId")}
              </dt>
              <dd className="text-secondary-foreground font-mono break-all">
                {account.id}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.siteType")}
              </dt>
              <dd className="text-secondary-foreground break-all">
                {account.site_type || t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.authType")}
              </dt>
              <dd className="text-secondary-foreground break-all">
                {account.authType || t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.health")}
              </dt>
              <dd className="text-secondary-foreground gap-y-density-2 flex items-center gap-x-2">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${healthDisplay.color}`}
                  aria-hidden="true"
                />
                <span>{healthDisplay.text}</span>
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.healthReason")}
              </dt>
              <dd className="text-secondary-foreground break-words">
                {account.health?.reason || t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.lastSync")}
              </dt>
              <dd className="text-secondary-foreground">
                {resolveTimestamp(account.last_sync_time)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.updatedAt")}
              </dt>
              <dd className="text-secondary-foreground">
                {resolveTimestamp(account.updated_at)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.createdAt")}
              </dt>
              <dd className="text-secondary-foreground">
                {resolveTimestamp(account.created_at)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.userId")}
              </dt>
              <dd className="text-secondary-foreground">
                {account.account_info?.id ?? t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.quota")}
              </dt>
              <dd className="text-secondary-foreground break-all">
                {account.account_info?.quota ?? t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.todayConsumption")}
              </dt>
              <dd className="text-secondary-foreground break-all">
                {resolveTodayMetricValue(
                  "consumption",
                  account.account_info?.today_quota_consumption,
                )}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.todayRequests")}
              </dt>
              <dd className="text-secondary-foreground break-all">
                {resolveTodayMetricValue(
                  "requests",
                  account.account_info?.today_requests_count,
                )}
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.todayTokens")}
              </dt>
              <dd className="text-secondary-foreground break-all">
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
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.checkinDetection")}
              </dt>
              <dd className="text-secondary-foreground">
                {builtInCheckInSelected
                  ? t("common:status.enabled")
                  : t("common:status.disabled")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.autoCheckin")}
              </dt>
              <dd className="text-secondary-foreground">
                {autoCheckinEnabled
                  ? t("common:status.enabled")
                  : t("common:status.disabled")}
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.customCheckinUrl")}
              </dt>
              <dd className="text-secondary-foreground font-mono break-all">
                {account.checkIn?.customCheckIn?.url ||
                  t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.notes")}
              </dt>
              <dd className="text-secondary-foreground break-words">
                {account.notes || t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">
                {t("ui:dialog.dedupeAccounts.details.excludeFromTotalBalance")}
              </dt>
              <dd className="text-secondary-foreground">
                {account.excludeFromTotalBalance === true
                  ? t("common:status.enabled")
                  : t("common:status.disabled")}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}
