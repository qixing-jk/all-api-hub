import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  getInviteLinkFailureAnalyticsCategory,
  getInviteLinkFailureMessage,
  getPrimaryInviteLinkFailureReason,
} from "~/features/AccountManagement/inviteLinkCopyFeedback"
import {
  INVITE_LINK_COPY_RESULTS,
  runInviteLinkCopyWorkflow,
} from "~/features/AccountManagement/inviteLinkCopyWorkflow"
import toast from "~/lib/notify"
import { canFetchDisplayAccountInviteLink } from "~/services/accounts/utils/apiServiceRequest"
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
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const rowActionsSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions

/** Own invite-link copying, cancellation and the manual clipboard recovery payload. */
export function useAccountInviteLinkCopy(site: DisplaySiteData) {
  const { t } = useTranslation("account")
  const [isCopyingInviteLink, setIsCopyingInviteLink] = useState(false)
  const [manualInviteLinkPayload, setManualInviteLinkPayload] = useState<
    string | null
  >(null)
  const inviteLinkAbortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)
  const canCopyInviteLink = canFetchDisplayAccountInviteLink(site)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      inviteLinkAbortControllerRef.current?.abort()
    }
  }, [])

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

  return {
    canCopyInviteLink,
    isCopyingInviteLink,
    manualInviteLinkPayload,
    setManualInviteLinkPayload,
    handleCopyInviteLink,
  }
}
