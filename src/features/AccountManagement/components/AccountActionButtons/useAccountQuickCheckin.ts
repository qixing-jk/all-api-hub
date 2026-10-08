import type { TFunction } from "i18next"
import { isPlainObject } from "lodash-es"
import { useRef } from "react"
import { useTranslation } from "react-i18next"

import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { translateAutoCheckinMessageKey } from "~/features/AutoCheckin/utils/autoCheckin"
import toast from "~/lib/notify"
import { isAutomaticCheckInConfiguredForAccount } from "~/services/checkin/autoCheckin/inspection"
import { sendAutoCheckinMessage } from "~/services/checkin/autoCheckin/messaging"
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
  type ProductAnalyticsResult,
  type ProductAnalyticsStatusKind,
} from "~/services/productAnalytics/contracts"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { DisplaySiteData } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const rowActionsSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions

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
/** Own one-account check-in eligibility, duplicate suppression and result feedback. */
export function useAccountQuickCheckin(site: DisplaySiteData) {
  const { t } = useTranslation(["account", "autoCheckin"])
  const { loadAccountData } = useAccountDataContext()
  const quickCheckinInFlightRef = useRef(false)
  const isAccountDisabled = site.disabled === true
  const isQuickCheckinEligible = isAutomaticCheckInConfiguredForAccount({
    config: site.checkIn,
    siteType: site.siteType,
    siteUrl: site.baseUrl,
    accountDisabled: site.disabled,
  })
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
  return { isQuickCheckinEligible, handleQuickCheckin }
}
