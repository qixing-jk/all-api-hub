import { useCallback, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  CHECK_IN_DISCOVERY_DECISION_OUTCOMES,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
} from "~/constants/checkIn"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import type { AccountSiteType } from "~/constants/siteType"
import { startAccountDialogAnalyticsAction } from "~/features/AccountManagement/components/AccountDialog/analytics"
import { discoverAccountDialogCheckInMethods } from "~/features/AccountManagement/components/AccountDialog/checkInDiscovery"
import type { AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { getSelectedCheckInStatus } from "~/services/checkin/autoCheckin/inspection"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import { mergeUserOwnedCheckInDraft } from "~/services/checkin/autoCheckin/state"
import type { ProductAnalyticsActionInsights } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnosticsError"
import type { CheckInMethodSelection } from "~/types/checkIn"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showWarningToast } from "~/utils/core/toastHelpers"

interface MutableValueRef<T> {
  current: T
}

interface UseAccountCheckInRedetectionParams {
  accountId?: string
  draft: AccountDialogDraft
  url: string
  mode: DialogMode
  selectedSiteTypeRef: MutableValueRef<AccountSiteType>
  selectedSiteUrlRef: MutableValueRef<string>
  discoveryBaseSelectionRef: MutableValueRef<CheckInMethodSelection | null>
  updateDraft: (
    updater: (draft: AccountDialogDraft) => AccountDialogDraft,
  ) => void
}

const logger = createLogger("AccountDialog")

const createRedetectionInsights = (input: {
  candidateCount: number
  decision?: ProductAnalyticsActionInsights["checkInDiscoveryDecision"]
  selectionSource: NonNullable<
    ProductAnalyticsActionInsights["checkInSelectionSource"]
  >
}): ProductAnalyticsActionInsights => ({
  checkInDiscoveryTrigger: "redetect" as const,
  ...(input.decision ? { checkInDiscoveryDecision: input.decision } : {}),
  checkInCandidateCount: input.candidateCount,
  checkInSelectionSource: input.selectionSource,
})

/** Owns the Account Dialog's read-only check-in method redetection workflow. */
export function useAccountCheckInRedetection({
  accountId,
  draft,
  url,
  mode,
  selectedSiteTypeRef,
  selectedSiteUrlRef,
  discoveryBaseSelectionRef,
  updateDraft,
}: UseAccountCheckInRedetectionParams) {
  const { t } = useTranslation("accountDialog")
  const [isRedetectingCheckInMethods, setIsRedetectingCheckInMethods] =
    useState(false)
  const invocationLeaseRef = useRef<symbol | null>(null)

  const resetCheckInRedetection = useCallback(() => {
    invocationLeaseRef.current = null
    setIsRedetectingCheckInMethods(false)
  }, [])

  const handleRedetectCheckInMethods = useCallback(async () => {
    if (invocationLeaseRef.current) return

    const requestedUrl = url.trim()
    const requestedSiteType = draft.siteType
    const candidateMethodIds =
      getAutoCheckinCandidateMethodIds(requestedSiteType)
    const candidateCount = candidateMethodIds.length
    if (!requestedUrl || candidateCount === 0) return

    const lease = Symbol("check-in-method-redetect-invocation")
    invocationLeaseRef.current = lease
    const baseSelection = { ...draft.checkIn.selection }
    const analyticsAction = startAccountDialogAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.RedetectCheckInMethods,
    )
    setIsRedetectingCheckInMethods(true)

    try {
      const tempWindowRequestSource = getCurrentTempWindowRequestSource()
      const discovery = await discoverAccountDialogCheckInMethods({
        draft,
        url: requestedUrl,
        accountId,
        tempWindowRequestSource,
      })

      if (
        invocationLeaseRef.current !== lease ||
        selectedSiteTypeRef.current !== requestedSiteType ||
        selectedSiteUrlRef.current.trim() !== requestedUrl
      ) {
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
          insights: createRedetectionInsights({
            candidateCount,
            decision: discovery.decision.outcome,
            selectionSource: "none",
          }),
        })
        return
      }

      if (
        mode === DIALOG_MODES.EDIT &&
        discovery.config.methodKnowledge.lastFullDiscoveryAt !== undefined &&
        !discoveryBaseSelectionRef.current
      ) {
        discoveryBaseSelectionRef.current = baseSelection
      }
      updateDraft((currentDraft) => {
        const selectionChanged =
          currentDraft.checkIn.selection.mode !== baseSelection.mode ||
          currentDraft.checkIn.selection.methodId !== baseSelection.methodId
        return {
          ...currentDraft,
          checkIn: mergeUserOwnedCheckInDraft({
            latest: discovery.config,
            draft: currentDraft.checkIn,
            selectionChanged,
          }),
        }
      })
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: createRedetectionInsights({
          candidateCount,
          decision: discovery.decision.outcome,
          selectionSource: discovery.config.selection.methodId
            ? discovery.config.selection.mode
            : "none",
        }),
      })
      const selectedStatus = getSelectedCheckInStatus({
        config: discovery.config,
        siteType: requestedSiteType,
      })
      if (
        discovery.decision.outcome ===
          CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Resolved &&
        selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
        selectedStatus.availability === CHECK_IN_METHOD_AVAILABILITIES.Disabled
      ) {
        showWarningToast(t("messages.checkInRedetectDisabled"))
      } else {
        switch (discovery.decision.outcome) {
          case CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Resolved:
            toast.success(t("messages.checkInRedetectResolved"))
            break
          case CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Ambiguous:
            showWarningToast(t("messages.checkInRedetectAmbiguous"))
            break
          case CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unsupported:
            toast(t("messages.checkInRedetectUnsupported"))
            break
          case CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unknown:
            showWarningToast(t("messages.checkInRedetectUnknown"))
        }
      }
    } catch (error) {
      logger.error("Check-in method redetection failed", {
        error: getErrorMessage(error),
        siteType: requestedSiteType,
      })
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        diagnostics: {
          failure: buildActionFailureDiagnostics({
            error,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
          }),
        },
        insights: createRedetectionInsights({
          candidateCount,
          selectionSource: draft.checkIn.selection.methodId
            ? draft.checkIn.selection.mode
            : "none",
        }),
      })
      toast.error(
        t("messages.operationFailed", { error: getErrorMessage(error) }),
      )
    } finally {
      if (invocationLeaseRef.current === lease) {
        invocationLeaseRef.current = null
        setIsRedetectingCheckInMethods(false)
      }
    }
  }, [
    accountId,
    discoveryBaseSelectionRef,
    draft,
    mode,
    selectedSiteTypeRef,
    selectedSiteUrlRef,
    t,
    updateDraft,
    url,
  ])

  return {
    isRedetectingCheckInMethods,
    handleRedetectCheckInMethods,
    resetCheckInRedetection,
  }
}
