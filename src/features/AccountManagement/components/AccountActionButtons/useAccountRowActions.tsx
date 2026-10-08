import { Pin, PinOff } from "lucide-react"
import type React from "react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/useDialogStateContext"
import { useCheckInRedetection } from "~/features/CheckIn/useCheckInRedetection"
import { useCheckInFeedback } from "~/features/CheckInFeedback/useCheckInFeedback"
import { exportShareSnapshotWithToast } from "~/features/ShareSnapshots/utils/exportShareSnapshotWithToast"
import toast from "~/lib/notify"
import { isAccountTodayMetricComplete } from "~/services/accounts/accountTodayStats"
import {
  canResolveAccountRuntimeKeySecret,
  supportsRecoverableAccountRuntimeKeySecrets,
} from "~/services/accounts/keyProductCapabilities"
import {
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  getStaticAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { hasValidManagedSiteConfig } from "~/services/managedSites/runtimeConfig"
import {
  getManagedSiteType,
  supportsManagedSiteBaseUrlChannelLookup,
} from "~/services/managedSites/utils/managedSite"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  startProductAnalyticsAction,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_STATES,
} from "~/services/productAnalytics/contracts"
import { buildAccountShareSnapshotPayload } from "~/services/sharing/shareSnapshots"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { sanitizeOriginUrl } from "~/utils/core/url"
import { openKeysPage, openModelsPage } from "~/utils/navigation"
import { openRedeemPage, openUsagePage } from "~/utils/navigation/sitePages"

import {
  addRedactionSecrets,
  addRuntimeKeyRedactionSecrets,
} from "./accountActionSecrets"
import { useAccountInviteLinkCopy } from "./useAccountInviteLinkCopy"
import { useAccountQuickCheckin } from "./useAccountQuickCheckin"
import { useLocateManagedSiteChannel } from "./useLocateManagedSiteChannel"

export interface ActionButtonsProps {
  site: DisplaySiteData
  onCopyKey: (site: DisplaySiteData) => void
  onDeleteAccount: (site: DisplaySiteData) => void
}

/**
 * Logger scoped to per-account action buttons so token-fetch failures can be diagnosed without logging secrets.
 */
const logger = createLogger("AccountActionButtons")

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options

const rowActionsSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions

/** Own the feature state and user-command lifecycle consumed by the view. */
export function useAccountRowActions({
  site,
  onCopyKey,
  onDeleteAccount,
}: ActionButtonsProps) {
  const { t } = useTranslation([
    "account",
    "shareSnapshots",
    "messages",
    "common",
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
  const { openFeedback, feedbackDialog } = useCheckInFeedback()
  const {
    redetect,
    isPending: isRedetectingCheckIn,
    selectionDialog,
    onMenuCloseAutoFocus,
  } = useCheckInRedetection(site.id, loadAccountData)
  const { openEditAccount } = useDialogStateContext()
  const [isCheckingTokens, setIsCheckingTokens] = useState(false)
  const [isRefreshMenuPending, setIsRefreshMenuPending] = useState(false)
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false)
  const moreActionsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const disableToggleInFlightRef = useRef(false)
  const suppressMoreActionsFocusRestoreRef = useRef(false)

  const { isQuickCheckinEligible, handleQuickCheckin } =
    useAccountQuickCheckin(site)
  const {
    canCopyInviteLink,
    isCopyingInviteLink,
    manualInviteLinkPayload,
    setManualInviteLinkPayload,
    handleCopyInviteLink,
  } = useAccountInviteLinkCopy(site)
  const isAccountDisabled = site.disabled === true
  const supportsSmartCopyKey = supportsRecoverableAccountRuntimeKeySecrets(
    site.siteType,
  )
  const canSmartCopyKey =
    canResolveAccountRuntimeKeySecret(site) ||
    (isAccountDisabled && supportsSmartCopyKey)
  const primaryKeyActionLabel = canSmartCopyKey
    ? t("actions.copyKey")
    : t("actions.keyList")
  const canLocateManagedSiteChannel = hasValidManagedSiteConfig(preferences)
  const isManagedSiteChannelLookupSupported = preferences
    ? supportsManagedSiteBaseUrlChannelLookup(getManagedSiteType(preferences))
    : true

  const isPinned = isAccountPinned(site.id)
  const pinLabel = isPinned ? t("actions.unpin") : t("actions.pin")
  const PinToggleIcon = isPinned ? PinOff : Pin

  const handleTogglePin = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ToggleAccountPin,
      surfaceId: rowActionsSurface,
      entrypoint: optionsEntrypoint,
    })

    try {
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
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      }
    } catch (error) {
      logger.error("Failed to toggle account pin", {
        error,
        siteId: site.id,
        siteType: site.siteType,
      })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    }
  }

  // Resolve a single recoverable key immediately; otherwise open inventory.
  const handlePrimaryKeyAction = async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (isCheckingTokens) return

    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiKey,
      surfaceId: rowActionsSurface,
      entrypoint: optionsEntrypoint,
    })

    if (!canSmartCopyKey) {
      onCopyKey(site)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: { fallbackUsed: true },
      })
      return
    }

    setIsCheckingTokens(true)
    const secretsToRedact = new Set<string>()
    addRedactionSecrets(secretsToRedact, [
      site.baseUrl,
      site.token,
      site.cookieAuthSessionCookie,
    ])

    try {
      const runtimeKeys = await fetchDisplayAccountRuntimeKeys(site)
      addRuntimeKeyRedactionSecrets(secretsToRedact, runtimeKeys)

      const [runtimeKey] = runtimeKeys
      if (runtimeKeys.length !== 1 || !runtimeKey) {
        onCopyKey(site)
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
          insights: {
            itemCount: runtimeKeys.length,
          },
        })
      } else {
        const resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
          site,
          runtimeKey,
        )
        addRuntimeKeyRedactionSecrets(secretsToRedact, [resolvedRuntimeKey])
        await navigator.clipboard.writeText(resolvedRuntimeKey.secret)
        toast.success(t("actions.keyCopied"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            itemCount: runtimeKeys.length,
          },
        })
      }
    } catch (error) {
      logger.error("Failed to fetch key list", {
        diagnostic: toSanitizedErrorSummary(error, Array.from(secretsToRedact)),
        siteId: site.id,
        siteType: site.siteType,
      })
      const errorMessage = getErrorMessage(error)
      toast.error(t("actions.fetchKeyListFailed", { errorMessage }))
      // Fallback to opening dialog
      onCopyKey(site)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: resolveProductAnalyticsErrorCategoryFromError(error),
      })
    } finally {
      setIsCheckingTokens(false)
    }
  }

  const handleCopyUrlLocal = async () => {
    await navigator.clipboard.writeText(site.baseUrl)
    toast.success(t("actions.urlCopied"))
  }

  // Navigation functions for secondary menu items
  const navigateAfterClosingMoreActions = (navigate: () => void) => {
    setIsMoreActionsOpen(false)
    // Let Radix release its scroll lock before the options route unmounts it.
    window.requestAnimationFrame(navigate)
  }

  const handleNavigateToKeyManagement = () => {
    navigateAfterClosingMoreActions(() => openKeysPage(site.id))
  }

  const handleNavigateToModelManagement = () => {
    navigateAfterClosingMoreActions(() => openModelsPage(site.id))
  }

  const canOpenUsagePage = Boolean(
    getStaticAccountSiteRouteUrl(site, SITE_ROUTE_KINDS.Usage),
  )
  const canOpenRedeemPage = Boolean(
    getStaticAccountSiteRouteUrl(
      site,
      SITE_ROUTE_KINDS.Redeem,
      site.checkIn?.customCheckIn?.redeemUrl,
    ),
  )

  const handleNavigateToUsageManagement = () => {
    openUsagePage(site)
  }

  const handleNavigateToRedeemPage = () => {
    openRedeemPage(site)
  }

  const handleLocateManagedSiteChannel = useLocateManagedSiteChannel({
    site,
    canLocateManagedSiteChannel,
    isManagedSiteChannelLookupSupported,
  })

  const handleOpenKeyList = () => {
    onCopyKey(site)
  }

  const handleRefreshLocal = async () => {
    if (isRefreshMenuPending) return

    setIsRefreshMenuPending(true)
    try {
      await handleRefreshAccount(site)
    } finally {
      setIsRefreshMenuPending(false)
    }
  }

  const handleDeleteLocal = () => {
    onDeleteAccount(site)
  }

  const handleDisableToggle = async () => {
    if (disableToggleInFlightRef.current) return
    disableToggleInFlightRef.current = true
    const targetState = isAccountDisabled
      ? PRODUCT_ANALYTICS_TARGET_STATES.Enabled
      : PRODUCT_ANALYTICS_TARGET_STATES.Disabled
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ToggleAccountDisabled,
      surfaceId: rowActionsSurface,
      entrypoint: optionsEntrypoint,
    })

    try {
      const success = await handleSetAccountDisabled(site, !isAccountDisabled)
      if (success) {
        // The row moves between account groups after this action. Restoring focus
        // to the old trigger would scroll the page to the row's new position.
        suppressMoreActionsFocusRestoreRef.current = true
        setIsMoreActionsOpen(false)
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            targetState,
          },
        })
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            targetState,
          },
        })
      }
    } catch (error) {
      logger.error("Failed to toggle account disabled state", {
        error,
        siteId: site.id,
        siteType: site.siteType,
      })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          targetState,
        },
      })
    } finally {
      disableToggleInFlightRef.current = false
    }
  }

  const handleShareSnapshot = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ShareSnapshots,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShareAccountSnapshot,
      surfaceId: rowActionsSurface,
      entrypoint: optionsEntrypoint,
    })

    if (isAccountDisabled) {
      toast.error(t("messages:toast.error.shareSnapshotAccountDisabled"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
      return
    }

    const includeToday =
      showTodayCashflow !== false &&
      isAccountTodayMetricComplete(site.todayStatsAvailability.consumption) &&
      isAccountTodayMetricComplete(site.todayStatsAvailability.income)

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

    try {
      await exportShareSnapshotWithToast({ payload })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      logger.error("Failed to export account share snapshot", {
        diagnostic: toSanitizedErrorSummary(
          error,
          [site.token, site.cookieAuthSessionCookie].filter(
            Boolean,
          ) as string[],
        ),
        siteId: site.id,
        siteType: site.siteType,
      })
      toast.error(
        t("messages:toast.error.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    }
  }

  return {
    refreshingAccountId,
    isPinFeatureEnabled,
    openFeedback,
    feedbackDialog,
    redetect,
    isRedetectingCheckIn,
    selectionDialog,
    onMenuCloseAutoFocus,
    openEditAccount,
    isCheckingTokens,
    isRefreshMenuPending,
    isMoreActionsOpen,
    setIsMoreActionsOpen,
    isCopyingInviteLink,
    manualInviteLinkPayload,
    setManualInviteLinkPayload,
    moreActionsTriggerRef,
    suppressMoreActionsFocusRestoreRef,
    isAccountDisabled,
    primaryKeyActionLabel,
    canCopyInviteLink,
    isQuickCheckinEligible,
    canLocateManagedSiteChannel,
    isManagedSiteChannelLookupSupported,
    pinLabel,
    PinToggleIcon,
    handleTogglePin,
    handlePrimaryKeyAction,
    handleCopyUrlLocal,
    handleNavigateToKeyManagement,
    handleNavigateToModelManagement,
    canOpenUsagePage,
    canOpenRedeemPage,
    handleNavigateToUsageManagement,
    handleNavigateToRedeemPage,
    handleLocateManagedSiteChannel,
    handleOpenKeyList,
    handleRefreshLocal,
    handleDeleteLocal,
    handleDisableToggle,
    handleShareSnapshot,
    handleCopyInviteLink,
    handleQuickCheckin,
    optionsEntrypoint,
    rowActionsSurface,
  }
}
