import type { TFunction } from "i18next"
import { isPlainObject } from "lodash-es"
import { Pin, PinOff } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import {
  getInviteLinkFailureAnalyticsCategory,
  getInviteLinkFailureMessage,
  getPrimaryInviteLinkFailureReason,
} from "~/features/AccountManagement/inviteLinkCopyFeedback"
import {
  INVITE_LINK_COPY_RESULTS,
  runInviteLinkCopyWorkflow,
} from "~/features/AccountManagement/inviteLinkCopyWorkflow"
import { translateAutoCheckinMessageKey } from "~/features/AutoCheckin/utils/autoCheckin"
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
  canFetchDisplayAccountInviteLink,
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  getStaticAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { isAutomaticCheckInConfiguredForAccount } from "~/services/checkin/autoCheckin/inspection"
import { sendAutoCheckinMessage } from "~/services/checkin/autoCheckin/messaging"
import { hasValidManagedSiteConfig } from "~/services/managedSites/runtimeConfig"
import {
  getManagedSiteType,
  supportsManagedSiteBaseUrlChannelLookup,
} from "~/services/managedSites/utils/managedSite"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  startProductAnalyticsAction,
  type ProductAnalyticsActionContext,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_STATES,
  type ProductAnalyticsResult,
  type ProductAnalyticsStatusKind,
} from "~/services/productAnalytics/contracts"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { buildAccountShareSnapshotPayload } from "~/services/sharing/shareSnapshots"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { DisplaySiteData } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { sanitizeOriginUrl } from "~/utils/core/url"
import {
  openKeysPage,
  openModelsPage,
  openRedeemPage,
  openUsagePage,
} from "~/utils/navigation"

import {
  addRedactionSecrets,
  addRuntimeKeyRedactionSecrets,
} from "./accountActionSecrets"
import { useLocateManagedSiteChannel } from "./useLocateManagedSiteChannel"

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

    return translateAutoCheckinMessageKey(
      params.t,
      params.result.messageKey,
      messageParams,
    )
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

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options

const rowActionsSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions

const quickCheckinAnalyticsContext: ProductAnalyticsActionContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunQuickCheckin,
  surfaceId: rowActionsSurface,
  entrypoint: optionsEntrypoint,
}

const getQuickCheckinAnalyticsResult = (
  status: string | undefined,
): ProductAnalyticsResult => {
  if (status === CHECKIN_RESULT_STATUS.FAILED) {
    return PRODUCT_ANALYTICS_RESULTS.Failure
  }

  if (status === CHECKIN_RESULT_STATUS.SKIPPED) {
    return PRODUCT_ANALYTICS_RESULTS.Skipped
  }

  return PRODUCT_ANALYTICS_RESULTS.Success
}

const getQuickCheckinAnalyticsStatusKind = (
  status: string | undefined,
): ProductAnalyticsStatusKind => {
  if (status === CHECKIN_RESULT_STATUS.FAILED) {
    return PRODUCT_ANALYTICS_STATUS_KINDS.Error
  }

  if (status === CHECKIN_RESULT_STATUS.SKIPPED) {
    return PRODUCT_ANALYTICS_STATUS_KINDS.Warning
  }

  return PRODUCT_ANALYTICS_STATUS_KINDS.Healthy
}

const getQuickCheckinFailureAnalyticsCategory = (result: {
  messageKey?: unknown
}) => {
  if (result.messageKey === "autoCheckin:providerFallback.checkinFailed") {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
  }

  if (
    result.messageKey === "autoCheckin:providerFallback.endpointNotSupported"
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
  }

  return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
}
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
  const [isCopyingInviteLink, setIsCopyingInviteLink] = useState(false)
  const [manualInviteLinkPayload, setManualInviteLinkPayload] = useState<
    string | null
  >(null)
  const inviteLinkAbortControllerRef = useRef<AbortController | null>(null)
  const moreActionsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const quickCheckinInFlightRef = useRef(false)
  const disableToggleInFlightRef = useRef(false)
  const suppressMoreActionsFocusRestoreRef = useRef(false)
  const isMountedRef = useRef(true)

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
  const canCopyInviteLink = canFetchDisplayAccountInviteLink(site)
  const isQuickCheckinEligible = isAutomaticCheckInConfiguredForAccount({
    config: site.checkIn,
    siteType: site.siteType,
    siteUrl: site.baseUrl,
    accountDisabled: site.disabled,
  })
  const canLocateManagedSiteChannel = hasValidManagedSiteConfig(preferences)
  const isManagedSiteChannelLookupSupported = preferences
    ? supportsManagedSiteBaseUrlChannelLookup(getManagedSiteType(preferences))
    : true

  const isPinned = isAccountPinned(site.id)
  const pinLabel = isPinned ? t("actions.unpin") : t("actions.pin")
  const PinToggleIcon = isPinned ? PinOff : Pin

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      inviteLinkAbortControllerRef.current?.abort()
    }
  }, [])

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

  const handleCopyInviteLink = async () => {
    if (isCopyingInviteLink || inviteLinkAbortControllerRef.current) return

    const controller = new AbortController()
    inviteLinkAbortControllerRef.current = controller
    setIsCopyingInviteLink(true)
    const toastId = toast.loading(t("actions.copyingInviteLink"))
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountInviteLink,
      surfaceId: rowActionsSurface,
      entrypoint: optionsEntrypoint,
    })

    try {
      const result = await runInviteLinkCopyWorkflow({
        accounts: [site],
        format: "raw",
        signal: controller.signal,
      })

      if (result.result === INVITE_LINK_COPY_RESULTS.Success) {
        toast.success(t("actions.inviteLinkCopied"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            itemCount: result.itemCount,
            successCount: result.successCount,
            failureCount: result.failureCount,
          },
        })
        return
      }

      if (result.result === INVITE_LINK_COPY_RESULTS.ClipboardFailure) {
        setManualInviteLinkPayload(result.payload ?? null)
        toast.error(t("actions.copyInviteLinkClipboardFailed"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
          insights: {
            itemCount: result.itemCount,
            successCount: result.successCount,
            failureCount: result.failureCount,
          },
        })
        return
      }

      if (result.result === INVITE_LINK_COPY_RESULTS.Cancelled) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        return
      }

      if (result.result === INVITE_LINK_COPY_RESULTS.Unsupported) {
        toast.error(t("actions.copyInviteLinkUnsupported"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
        })
        return
      }

      const failureReason = getPrimaryInviteLinkFailureReason(
        result.failureReasonCounts,
      )
      toast.error(
        t("actions.copyInviteLinkFailedWithReason", {
          reason: getInviteLinkFailureMessage(t, failureReason),
        }),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: getInviteLinkFailureAnalyticsCategory(failureReason),
      })
    } catch (error) {
      toast.error(t("actions.copyInviteLinkFailed"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: resolveProductAnalyticsErrorCategoryFromError(error),
      })
    } finally {
      toast.dismiss(toastId)
      if (inviteLinkAbortControllerRef.current === controller) {
        inviteLinkAbortControllerRef.current = null
        if (isMountedRef.current) setIsCopyingInviteLink(false)
      }
    }
  }

  /**
   * Trigger a manual auto check-in run scoped to this account only.
   * Uses the shared background scheduler so provider/persistence behavior stays consistent.
   */
  const handleQuickCheckin = async () => {
    if (quickCheckinInFlightRef.current) return
    quickCheckinInFlightRef.current = true
    const tracker = startProductAnalyticsAction(quickCheckinAnalyticsContext)

    if (isAccountDisabled) {
      toast.error(t("autoCheckin:messages.error.accountDisabled"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
      quickCheckinInFlightRef.current = false
      return
    }

    let toastId: string | undefined
    try {
      toastId = toast.loading(t("autoCheckin:messages.loading.running"))

      const tempWindowRequestSource = getCurrentTempWindowRequestSource()
      const response = await withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        tempWindowRequestSource,
        (protectionBypassExecution) =>
          sendAutoCheckinMessage(AutoCheckinMessageTypes.RunNow, {
            accountIds: [site.id],
            protectionBypassExecution,
          }),
      )

      if (toastId) toast.dismiss(toastId)

      if (!response?.success) {
        toast.error(
          t("autoCheckin:messages.error.runFailed", {
            error: response?.error ?? "",
          }),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory:
            resolveProductAnalyticsErrorCategoryFromError(response),
        })
        return
      }

      const statusResponse = await sendAutoCheckinMessage(
        AutoCheckinMessageTypes.GetStatus,
      )

      const result =
        statusResponse?.success && statusResponse?.data?.perAccount
          ? statusResponse.data.perAccount[site.id]
          : null

      if (!result) {
        toast.error(
          t("autoCheckin:messages.error.runFailed", {
            error: statusResponse?.success ? "" : statusResponse?.error ?? "",
          }),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          },
        })
        void loadAccountData()
        return
      }

      const status = result.status

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

      const analyticsResult = getQuickCheckinAnalyticsResult(status)
      const quickCheckinInsights = {
        statusKind: getQuickCheckinAnalyticsStatusKind(status),
      }
      if (analyticsResult === PRODUCT_ANALYTICS_RESULTS.Failure) {
        tracker.complete(analyticsResult, {
          errorCategory: result
            ? getQuickCheckinFailureAnalyticsCategory(result)
            : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: quickCheckinInsights,
        })
      } else {
        tracker.complete(analyticsResult, {
          insights: quickCheckinInsights,
        })
      }
      void loadAccountData()
    } catch (error) {
      if (toastId) toast.dismiss(toastId)
      toast.error(
        t("autoCheckin:messages.error.runFailed", {
          error: getErrorMessage(error),
        }),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: resolveProductAnalyticsErrorCategoryFromError(error),
      })
    } finally {
      quickCheckinInFlightRef.current = false
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
