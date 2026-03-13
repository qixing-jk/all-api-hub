import { Menu, MenuButton, MenuItems } from "@headlessui/react"
import {
  ArrowPathIcon,
  ArrowUpOnSquareIcon,
  BanknotesIcon,
  CheckCircleIcon,
  CpuChipIcon,
  EllipsisHorizontalIcon,
  KeyIcon,
  LinkIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import { isPlainObject } from "lodash-es"
import { CalendarCheck2, ChartPieIcon, PinIcon, PinOffIcon } from "lucide-react"
import React, { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { exportShareSnapshotWithToast } from "~/features/ShareSnapshots/utils/exportShareSnapshotWithToast"
import { getApiService } from "~/services/apiService"
import {
  getManagedSiteChannelExactMatch,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  type ManagedSiteChannelMatchInspection,
} from "~/services/managedSites/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import {
  getManagedSiteService,
  hasValidManagedSiteConfig,
} from "~/services/managedSites/managedSiteService"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"
import { buildAccountShareSnapshotPayload } from "~/services/sharing/shareSnapshots"
import type { DisplaySiteData } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { sanitizeOriginUrl } from "~/utils/core/url"
import {
  openKeysPage,
  openManagedSiteChannelsForChannel,
  openManagedSiteChannelsPage,
  openModelsPage,
  openRedeemPage,
  openUsagePage,
} from "~/utils/navigation"

import { AccountActionMenuItem } from "./AccountActionMenuItem"

/**
 * Derives a user-facing toast message from the latest auto check-in result for one account.
 */
function resolveAutoCheckinResultMessage(params: {
  t: TFunction
  result: {
    rawMessage?: unknown
    messageKey?: unknown
    messageParams?: unknown
    message?: unknown
  } | null
  status?: string
}): string {
  if (
    typeof params.result?.rawMessage === "string" &&
    params.result.rawMessage.trim().length > 0
  ) {
    return params.result.rawMessage
  }

  if (
    typeof params.result?.messageKey === "string" &&
    params.result.messageKey.trim().length > 0
  ) {
    const messageParams: Record<string, unknown> = isPlainObject(
      params.result.messageParams,
    )
      ? (params.result.messageParams as Record<string, unknown>)
      : {}

    return params.t(params.result.messageKey, {
      ...messageParams,
      defaultValue: params.result.messageKey,
    })
  }

  if (
    typeof params.result?.message === "string" &&
    params.result.message.trim().length > 0
  ) {
    return params.result.message
  }

  if (params.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED) {
    return params.t("autoCheckin:providerFallback.alreadyCheckedToday")
  }
  if (params.status === CHECKIN_RESULT_STATUS.SUCCESS) {
    return params.t("autoCheckin:providerFallback.checkinSuccessful")
  }
  if (params.status === CHECKIN_RESULT_STATUS.FAILED) {
    return params.t("autoCheckin:providerFallback.checkinFailed")
  }

  return params.t("autoCheckin:providerFallback.unknownError")
}

export interface ActionButtonsProps {
  site: DisplaySiteData
  onCopyKey: (site: DisplaySiteData) => void
  onDeleteAccount: (site: DisplaySiteData) => void
}

/**
 * Logger scoped to per-account action buttons so token-fetch failures can be diagnosed without logging secrets.
 */
const logger = createLogger("AccountActionButtons")

const getLocateManagedSiteChannelToastKey = (
  inspection: ManagedSiteChannelMatchInspection,
) => {
  if (inspection.key.matched && inspection.models.matched) {
    if (
      inspection.key.channel?.id != null &&
      inspection.key.channel.id === inspection.models.channel?.id
    ) {
      return "actions.channelLocateKeyMatchedModelsDrifted"
    }

    return "actions.channelLocateSignalsConflict"
  }

  if (inspection.key.matched) {
    return "actions.channelLocateKeyMatchOnly"
  }

  switch (inspection.models.reason) {
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT:
      return "actions.channelLocateSecondaryExactModels"
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.CONTAINED:
      return "actions.channelLocateSecondaryModelsContained"
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.SIMILAR:
      return "actions.channelLocateSecondaryModelsSimilar"
  }

  if (inspection.url.matched) {
    return "actions.channelLocateFuzzyUrlOnly"
  }

  return "actions.channelLocateUnresolved"
}

/**
 * Primary/secondary action controls for each account card.
 * Provides copy URL/key, edit, refresh, pin, delete, and page navigation shortcuts.
 */
export default function AccountActionButtons({
  site,
  onCopyKey,
  onDeleteAccount,
}: ActionButtonsProps) {
  const { t } = useTranslation([
    "account",
    "shareSnapshots",
    "messages",
    "common",
    "autoCheckin",
  ])
  const { currencyType, showTodayCashflow, preferences } =
    useUserPreferencesContext()
  const {
    refreshingAccountId,
    handleRefreshAccount,
    handleSetAccountDisabled,
  } = useAccountActionsContext()
  const {
    isAccountPinned,
    togglePinAccount,
    isPinFeatureEnabled,
    loadAccountData,
  } = useAccountDataContext()
  const { openEditAccount } = useDialogStateContext()
  const [isCheckingTokens, setIsCheckingTokens] = useState(false)

  const isAccountDisabled = site.disabled === true
  const isQuickCheckinEligible =
    !isAccountDisabled &&
    site.checkIn?.enableDetection === true &&
    site.checkIn?.autoCheckInEnabled !== false
  const canLocateManagedSiteChannel = hasValidManagedSiteConfig(preferences)

  const isPinned = isAccountPinned(site.id)
  const pinLabel = isPinned ? t("actions.unpin") : t("actions.pin")
  const PinToggleIcon = isPinned ? PinOffIcon : PinIcon

  const handleTogglePin = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    const success = await togglePinAccount(site.id)
    if (success) {
      const message = isPinned
        ? t("messages:toast.success.accountUnpinned", {
            accountName: site.name,
          })
        : t("messages:toast.success.accountPinned", {
            accountName: site.name,
          })
      toast.success(message)
    }
  }

  // Smart copy key logic - check token count before deciding action
  const handleSmartCopyKey = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isCheckingTokens) return

    setIsCheckingTokens(true)

    try {
      // Fetch tokens to check count before deciding action
      const tokensResponse = await getApiService(
        site.siteType,
      ).fetchAccountTokens({
        baseUrl: site.baseUrl,
        accountId: site.id,
        auth: {
          authType: site.authType,
          userId: site.userId,
          accessToken: site.token,
          cookie: site.cookieAuthSessionCookie,
        },
      })

      if (Array.isArray(tokensResponse)) {
        if (tokensResponse.length === 1) {
          // Single token - copy directly
          const token = tokensResponse[0]
          await navigator.clipboard.writeText(token.key)
          toast.success(t("actions.keyCopied"))
        } else if (tokensResponse.length > 1) {
          // Multiple tokens - open dialog
          onCopyKey(site)
        } else {
          // No tokens found - open dialog for actionable empty state
          onCopyKey(site)
        }
      } else {
        logger.warn("Token response is not an array", {
          siteId: site.id,
          baseUrl: site.baseUrl,
          responseType: typeof tokensResponse,
          siteType: site.siteType,
        })
        toast.error(t("actions.fetchKeyInfoFailed"))
      }
    } catch (error) {
      logger.error("Failed to fetch key list", {
        error,
        siteId: site.id,
        baseUrl: site.baseUrl,
        siteType: site.siteType,
      })
      const errorMessage = getErrorMessage(error)
      toast.error(t("actions.fetchKeyListFailed", { errorMessage }))
      // Fallback to opening dialog
      onCopyKey(site)
    } finally {
      setIsCheckingTokens(false)
    }
  }

  const handleCopyUrlLocal = async () => {
    await navigator.clipboard.writeText(site.baseUrl)
    toast.success(t("actions.urlCopied"))
  }

  // Navigation functions for secondary menu items
  const handleNavigateToKeyManagement = () => {
    openKeysPage(site.id)
  }

  const handleNavigateToModelManagement = () => {
    openModelsPage(site.id)
  }

  const handleNavigateToUsageManagement = () => {
    openUsagePage(site)
  }

  const handleNavigateToRedeemPage = () => {
    openRedeemPage(site)
  }

  const handleLocateManagedSiteChannel = async () => {
    if (!canLocateManagedSiteChannel) {
      return
    }

    const accountBaseUrl = site.baseUrl.trim()
    const normalizedAccountBaseUrl =
      normalizeManagedSiteChannelBaseUrl(accountBaseUrl)
    if (!normalizedAccountBaseUrl) {
      return
    }

    try {
      const service = await getManagedSiteService()
      const managedConfig = await service.getConfig()

      if (!managedConfig) {
        toast.error(t(`messages:${service.messagesKey}.configMissing`))
        openManagedSiteChannelsPage({ search: normalizedAccountBaseUrl })
        return
      }

      const tokensResponse = await getApiService(
        site.siteType,
      ).fetchAccountTokens({
        baseUrl: accountBaseUrl,
        accountId: site.id,
        auth: {
          authType: site.authType,
          userId: site.userId,
          accessToken: site.token,
          cookie: site.cookieAuthSessionCookie,
        },
      })

      if (!Array.isArray(tokensResponse)) {
        toast.error(t("actions.channelLocateFailed"))
        openManagedSiteChannelsPage({ search: normalizedAccountBaseUrl })
        return
      }

      if (tokensResponse.length === 0) {
        openManagedSiteChannelsPage({ search: normalizedAccountBaseUrl })
        toast.success(t("actions.channelLocateNoKeyFallback"))
        return
      }

      if (tokensResponse.length > 1) {
        openManagedSiteChannelsPage({ search: normalizedAccountBaseUrl })
        toast.success(t("actions.channelLocateMultipleKeysFallback"))
        return
      }

      const apiToken = tokensResponse[0]
      let formData: Awaited<ReturnType<typeof service.prepareChannelFormData>>
      try {
        formData = await service.prepareChannelFormData(
          { ...site, baseUrl: normalizedAccountBaseUrl },
          apiToken,
        )
      } catch (error) {
        logger.warn(
          "Failed to build channel match inputs; using URL-only match",
          {
            error,
            siteId: site.id,
            baseUrl: site.baseUrl,
            siteType: site.siteType,
          },
        )
        openManagedSiteChannelsPage({ search: normalizedAccountBaseUrl })
        toast.success(t("actions.channelLocateInputPreparationFallback"))
        return
      }

      const searchBaseUrl = normalizeManagedSiteChannelBaseUrl(
        formData.base_url,
      )

      if (!searchBaseUrl || formData.models.length === 0) {
        openManagedSiteChannelsPage({ search: normalizedAccountBaseUrl })
        toast.success(t("actions.channelLocateInputPreparationFallback"))
        return
      }

      const resolution = await resolveManagedSiteChannelMatch({
        service,
        managedConfig,
        accountBaseUrl: searchBaseUrl,
        models: formData.models,
        key: formData.key,
      })
      const exactMatch = getManagedSiteChannelExactMatch(resolution)

      if (
        exactMatch &&
        exactMatch.id != null &&
        resolution.models.reason ===
          MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT
      ) {
        openManagedSiteChannelsForChannel(exactMatch.id)
        return
      }

      openManagedSiteChannelsPage({ search: resolution.searchBaseUrl })

      if (!resolution.searchCompleted) {
        toast.error(t("actions.channelLocateFailed"))
        return
      }

      toast.success(t(getLocateManagedSiteChannelToastKey(resolution)))
    } catch (error) {
      logger.error("Failed to locate managed site channel", {
        error,
        siteId: site.id,
        baseUrl: site.baseUrl,
        siteType: site.siteType,
      })

      openManagedSiteChannelsPage({ search: normalizedAccountBaseUrl })
      toast.error(t("actions.channelLocateFailed"))
    }
  }

  const handleOpenKeyList = () => {
    onCopyKey(site)
  }

  const handleRefreshLocal = () => {
    handleRefreshAccount(site)
  }

  const handleDeleteLocal = () => {
    onDeleteAccount(site)
  }

  const handleDisableToggle = () => {
    void handleSetAccountDisabled(site, !isAccountDisabled)
  }

  const handleShareSnapshot = async () => {
    if (isAccountDisabled) {
      toast.error(t("messages:toast.error.shareSnapshotAccountDisabled"))
      return
    }

    const includeToday = showTodayCashflow !== false

    // Build an allowlisted, share-safe payload (origin-only URL; no secret-bearing fields).
    const payload = buildAccountShareSnapshotPayload({
      currencyType,
      siteName: site.name,
      originUrl: sanitizeOriginUrl(site.baseUrl),
      balance: site.balance?.[currencyType] ?? 0,
      includeTodayCashflow: includeToday,
      todayIncome: includeToday
        ? site.todayIncome?.[currencyType] ?? 0
        : undefined,
      todayOutcome: includeToday
        ? site.todayConsumption?.[currencyType] ?? 0
        : undefined,
      asOf:
        site.last_sync_time && site.last_sync_time > 0
          ? site.last_sync_time
          : undefined,
    })

    await exportShareSnapshotWithToast({ payload })
  }

  /**
   * Trigger a manual auto check-in run scoped to this account only.
   * Uses the shared background scheduler so provider/persistence behavior stays consistent.
   */
  const handleQuickCheckin = async () => {
    if (isAccountDisabled) {
      toast.error(t("autoCheckin:messages.error.accountDisabled"))
      return
    }

    let toastId: string | undefined
    try {
      toastId = toast.loading(t("autoCheckin:messages.loading.running"))

      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinRunNow,
        accountIds: [site.id],
      })

      if (toastId) toast.dismiss(toastId)

      if (!response?.success) {
        toast.error(
          t("autoCheckin:messages.error.runFailed", {
            error: response?.error ?? "",
          }),
        )
        return
      }

      const statusResponse = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinGetStatus,
      })

      const result =
        statusResponse?.success && statusResponse?.data?.perAccount
          ? statusResponse.data.perAccount[site.id]
          : null

      const status = result?.status

      const displayMessage = resolveAutoCheckinResultMessage({
        t,
        result,
        status,
      })

      const toastMessage = `${site.name}: ${displayMessage}`

      if (
        status === CHECKIN_RESULT_STATUS.SUCCESS ||
        status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED
      ) {
        toast.success(toastMessage)
      } else if (
        status === CHECKIN_RESULT_STATUS.FAILED ||
        status === CHECKIN_RESULT_STATUS.SKIPPED
      ) {
        toast.error(toastMessage)
      } else {
        toast.success(t("autoCheckin:messages.success.runCompleted"))
      }

      void loadAccountData()
    } catch (error) {
      if (toastId) toast.dismiss(toastId)
      toast.error(
        t("autoCheckin:messages.error.runFailed", {
          error: getErrorMessage(error),
        }),
      )
    }
  }

  return (
    <div className="grid grid-cols-2 justify-end gap-2 sm:grid-cols-4">
      {/* Primary Level - Standalone buttons */}
      <IconButton
        onClick={handleCopyUrlLocal}
        variant="ghost"
        size="sm"
        className="touch-manipulation"
        disabled={isAccountDisabled}
        aria-label={t("actions.copyUrl")}
        title={t("actions.copyUrl")}
      >
        <LinkIcon className="h-4 w-4" />
      </IconButton>

      <IconButton
        onClick={handleSmartCopyKey}
        variant="ghost"
        size="sm"
        className="touch-manipulation"
        disabled={isCheckingTokens || isAccountDisabled}
        aria-label={t("actions.copyKey")}
        title={t("actions.copyKey")}
      >
        <KeyIcon className="h-4 w-4" />
      </IconButton>

      <IconButton
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          openEditAccount(site)
        }}
        variant="ghost"
        size="sm"
        className="touch-manipulation"
        disabled={isAccountDisabled}
        aria-label={t("actions.edit")}
        title={t("actions.edit")}
      >
        <PencilIcon className="h-4 w-4" />
      </IconButton>

      {/* Secondary Level - Dropdown menu */}
      <Menu as="div" className="relative">
        <MenuButton
          as={IconButton}
          variant="ghost"
          size="sm"
          aria-label={t("common:actions.more")}
        >
          <EllipsisHorizontalIcon className="h-4 w-4" />
        </MenuButton>

        <MenuItems
          anchor="bottom end"
          className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary z-50 rounded-lg border border-gray-200 bg-white py-1 shadow-lg [--anchor-gap:4px] [--anchor-padding:8px] focus:outline-none"
        >
          {isAccountDisabled ? (
            <>
              <AccountActionMenuItem
                onClick={handleDisableToggle}
                icon={CheckCircleIcon}
                label={t("actions.enableAccount")}
                tone="success"
              />

              <hr className="dark:border-dark-bg-tertiary my-1 border-gray-200" />

              <AccountActionMenuItem
                onClick={handleDeleteLocal}
                icon={TrashIcon}
                label={t("actions.delete")}
                isDestructive={true}
              />
            </>
          ) : (
            <>
              {/* Secondary Menu Items */}
              <AccountActionMenuItem
                onClick={handleOpenKeyList}
                icon={ListBulletIcon}
                label={t("actions.keyList")}
              />

              <AccountActionMenuItem
                onClick={handleNavigateToKeyManagement}
                icon={KeyIcon}
                label={t("actions.keyManagement")}
              />

              <AccountActionMenuItem
                onClick={handleNavigateToModelManagement}
                icon={CpuChipIcon}
                label={t("actions.modelManagement")}
              />

              {canLocateManagedSiteChannel && (
                <AccountActionMenuItem
                  onClick={handleLocateManagedSiteChannel}
                  icon={MagnifyingGlassIcon}
                  label={t("actions.locateManagedSiteChannel")}
                />
              )}

              <hr className="dark:border-dark-bg-tertiary my-1 border-gray-200" />

              <AccountActionMenuItem
                onClick={handleNavigateToUsageManagement}
                icon={ChartPieIcon}
                label={t("actions.usageLog")}
              />

              <AccountActionMenuItem
                onClick={handleNavigateToRedeemPage}
                icon={BanknotesIcon}
                label={t("actions.redeemPage")}
              />

              <hr className="dark:border-dark-bg-tertiary my-1 border-gray-200" />

              {/* Pin/Unpin */}
              {isPinFeatureEnabled && (
                <AccountActionMenuItem
                  onClick={handleTogglePin}
                  icon={PinToggleIcon}
                  label={pinLabel}
                />
              )}

              <AccountActionMenuItem
                onClick={handleRefreshLocal}
                icon={ArrowPathIcon}
                label={t("actions.refresh")}
                disabled={refreshingAccountId === site.id}
              />

              {isQuickCheckinEligible && (
                <AccountActionMenuItem
                  onClick={handleQuickCheckin}
                  icon={CalendarCheck2}
                  label={t("actions.quickCheckin")}
                />
              )}

              <AccountActionMenuItem
                onClick={handleShareSnapshot}
                icon={ArrowUpOnSquareIcon}
                label={t("shareSnapshots:actions.shareAccountSnapshot")}
              />

              <hr className="dark:border-dark-bg-tertiary my-1 border-gray-200" />

              {/* Place Disable immediately above Delete for clarity and consistency. */}
              <AccountActionMenuItem
                onClick={handleDisableToggle}
                icon={NoSymbolIcon}
                label={t("actions.disableAccount")}
                tone="warning"
              />

              <AccountActionMenuItem
                onClick={handleDeleteLocal}
                icon={TrashIcon}
                label={t("actions.delete")}
                isDestructive={true}
              />
            </>
          )}
        </MenuItems>
      </Menu>
    </div>
  )
}
