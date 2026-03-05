import type { TFunction } from "i18next"
import { Info } from "lucide-react"

import { Badge, Button } from "~/components/ui"
import type { SiteAccount } from "~/types"

import { getHealthStatusDisplay } from "../../utils/healthStatusUtils"
import type {
  DedupeAccountsDialogGroup,
  DedupeAccountsKeepChangeInput,
} from "./types"
import { formatTimestamp, getAccountLabel } from "./utils"

type AccountCardGroup = Pick<
  DedupeAccountsDialogGroup,
  "groupId" | "keepAccountId" | "recommendedKeepAccountId" | "hasManualOverride"
>

export interface DedupeAccountCardProps {
  account: SiteAccount
  group: AccountCardGroup
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
  const autoCheckinEnabled = account.checkIn.autoCheckInEnabled !== false

  const resolveTimestamp = (timestamp?: number) => formatTimestamp(timestamp, t)

  return (
    <div
      className={`dark:border-dark-bg-tertiary focus-within:border-ring focus-within:ring-ring/50 flex flex-col gap-2 rounded-md border border-gray-100 p-3 transition-[color,box-shadow] focus-within:ring-[3px] ${
        isWorking
          ? "cursor-not-allowed opacity-70"
          : "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-w-0 items-start gap-3">
          <input
            type="radio"
            name={`dedupe-keep-${encodeURIComponent(group.groupId)}`}
            className="mt-1 h-3 w-3"
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
            <div className="dark:text-dark-text-primary truncate text-sm font-medium text-gray-900">
              {getAccountLabel(account)}
            </div>
            <div className="dark:text-dark-text-tertiary truncate text-xs text-gray-500">
              {account.site_url}
            </div>
          </div>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {pinned && (
            <Badge size="sm" variant="info">
              {t("account:actions.pinned")}
            </Badge>
          )}
          {disabled && (
            <Badge size="sm" variant="warning">
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
            className="h-7 px-2 text-xs"
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
          className="dark:border-dark-bg-tertiary dark:bg-dark-bg-tertiary/40 rounded-md border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700"
        >
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.accountId")}
              </dt>
              <dd className="dark:text-dark-text-secondary font-mono break-all text-gray-800">
                {account.id}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.siteType")}
              </dt>
              <dd className="dark:text-dark-text-secondary break-all text-gray-800">
                {account.site_type || t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.authType")}
              </dt>
              <dd className="dark:text-dark-text-secondary break-all text-gray-800">
                {account.authType || t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.health")}
              </dt>
              <dd className="dark:text-dark-text-secondary flex items-center gap-2 text-gray-800">
                <span
                  className={`h-2 w-2 rounded-full ${healthDisplay.color}`}
                  aria-hidden="true"
                />
                <span>{healthDisplay.text}</span>
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.healthReason")}
              </dt>
              <dd className="dark:text-dark-text-secondary break-words text-gray-800">
                {account.health?.reason || t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.lastSync")}
              </dt>
              <dd className="dark:text-dark-text-secondary text-gray-800">
                {resolveTimestamp(account.last_sync_time)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.updatedAt")}
              </dt>
              <dd className="dark:text-dark-text-secondary text-gray-800">
                {resolveTimestamp(account.updated_at)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.createdAt")}
              </dt>
              <dd className="dark:text-dark-text-secondary text-gray-800">
                {resolveTimestamp(account.created_at)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.userId")}
              </dt>
              <dd className="dark:text-dark-text-secondary text-gray-800">
                {account.account_info?.id ?? t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.quota")}
              </dt>
              <dd className="dark:text-dark-text-secondary break-all text-gray-800">
                {account.account_info?.quota ?? t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.todayConsumption")}
              </dt>
              <dd className="dark:text-dark-text-secondary break-all text-gray-800">
                {account.account_info?.today_quota_consumption ??
                  t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.todayRequests")}
              </dt>
              <dd className="dark:text-dark-text-secondary break-all text-gray-800">
                {account.account_info?.today_requests_count ??
                  t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.todayTokens")}
              </dt>
              <dd className="dark:text-dark-text-secondary break-all text-gray-800">
                <span className="font-medium">
                  {t("account:stats.prompt")}:
                </span>{" "}
                {account.account_info?.today_prompt_tokens ?? 0} ·{" "}
                <span className="font-medium">
                  {t("account:stats.completion")}:
                </span>{" "}
                {account.account_info?.today_completion_tokens ?? 0}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.checkinDetection")}
              </dt>
              <dd className="dark:text-dark-text-secondary text-gray-800">
                {account.checkIn?.enableDetection
                  ? t("common:enabled")
                  : t("common:disabled")}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.autoCheckin")}
              </dt>
              <dd className="dark:text-dark-text-secondary text-gray-800">
                {autoCheckinEnabled
                  ? t("common:enabled")
                  : t("common:disabled")}
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.customCheckinUrl")}
              </dt>
              <dd className="dark:text-dark-text-secondary font-mono break-all text-gray-800">
                {account.checkIn?.customCheckIn?.url ||
                  t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.notes")}
              </dt>
              <dd className="dark:text-dark-text-secondary break-words text-gray-800">
                {account.notes || t("common:labels.notAvailable")}
              </dd>
            </div>

            <div className="space-y-0.5 sm:col-span-2">
              <dt className="dark:text-dark-text-tertiary text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                {t("ui:dialog.dedupeAccounts.details.excludeFromTotalBalance")}
              </dt>
              <dd className="dark:text-dark-text-secondary text-gray-800">
                {account.excludeFromTotalBalance === true
                  ? t("common:enabled")
                  : t("common:disabled")}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}
