import { useCallback, useRef, useState } from "react"

import { CHECK_IN_DISCOVERY_DECISION_OUTCOMES } from "~/constants/checkIn"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import type { AccountSiteType } from "~/constants/siteType"
import { startAccountDialogAnalyticsAction } from "~/features/AccountManagement/components/AccountDialog/analytics"
import { discoverAccountDialogCheckInMethods } from "~/features/AccountManagement/components/AccountDialog/checkin/checkInDiscovery"
import { createCheckInRedetectionFeedback } from "~/features/AccountManagement/components/AccountDialog/checkin/checkInPresentation"
import type {
  AccountCheckInRedetectionFeedback,
  AccountDialogDraft,
} from "~/features/AccountManagement/components/AccountDialog/models"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/inspection"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import { mergeUserOwnedCheckInDraft } from "~/services/checkin/autoCheckin/state"
import type { ProductAnalyticsActionInsights } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnosticsError"
import {
  checkSiteTypeMismatch,
  SITE_TYPE_MISMATCH_OUTCOMES,
} from "~/services/siteDetection/siteTypeMismatch"
import { siteTypeObservations } from "~/services/siteDetection/siteTypeObservations"
import type { CheckInMethodSelection } from "~/types/checkIn"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

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
  const [isRedetectingCheckInMethods, setIsRedetectingCheckInMethods] =
    useState(false)
  const [checkInRedetectionFeedback, setCheckInRedetectionFeedback] =
    useState<AccountCheckInRedetectionFeedback | null>(null)
  const invocationLeaseRef = useRef<symbol | null>(null)
  const latestDraftRef = useRef(draft)
  latestDraftRef.current = draft

  const resetCheckInRedetection = useCallback(() => {
    invocationLeaseRef.current = null
    setIsRedetectingCheckInMethods(false)
    setCheckInRedetectionFeedback(null)
  }, [])

  const handleRedetectCheckInMethods = useCallback(async () => {
    if (invocationLeaseRef.current) return

    const requestedUrl = url.trim()
    const requestedSiteType = draft.siteType
    const candidateMethodIds = getAutoCheckinCandidateMethodIds(
      requestedSiteType,
      requestedUrl,
    )
    const candidateCount = candidateMethodIds.length
    if (!requestedUrl) {
      setCheckInRedetectionFeedback({
        kind: "failed",
        reason: "url-required",
      })
      return
    }
    if (candidateCount === 0) return

    const lease = Symbol("check-in-method-redetect-invocation")
    invocationLeaseRef.current = lease
    setCheckInRedetectionFeedback(null)
    const baseSelection = { ...draft.checkIn.selection }
    const analyticsAction = startAccountDialogAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.RedetectCheckInMethods,
    )
    setIsRedetectingCheckInMethods(true)

    /**
     * An invocation is stale once its lease is released, or once the type or URL
     * the user has in front of them is no longer the one it started on.
     */
    const isInvocationCurrent = () =>
      invocationLeaseRef.current === lease &&
      selectedSiteTypeRef.current === requestedSiteType &&
      selectedSiteUrlRef.current.trim() === requestedUrl &&
      latestDraftRef.current.userId.trim() === draft.userId.trim() &&
      latestDraftRef.current.accessToken.trim() === draft.accessToken.trim() &&
      latestDraftRef.current.authType === draft.authType &&
      latestDraftRef.current.cookieAuthSessionCookie.trim() ===
        draft.cookieAuthSessionCookie.trim()

    try {
      const tempWindowRequestSource = getCurrentTempWindowRequestSource()
      const { discovery, protectionBypassExecution } =
        await discoverAccountDialogCheckInMethods({
          draft,
          url: requestedUrl,
          accountId,
          tempWindowRequestSource,
        })

      if (!isInvocationCurrent()) {
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
      // A method that resolved needs no type advice; every other outcome is a
      // candidate for a stored type the site itself no longer agrees with. The
      // reading shares this click's bypass context; the policy still decides.
      const siteTypeCheck =
        discovery.decision.outcome ===
        CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Resolved
          ? null
          : await checkSiteTypeMismatch({
              siteUrl: requestedUrl,
              storedSiteType: requestedSiteType,
              protectionBypassExecution,
            })
      // The reading is another round trip, so this invocation can go stale while
      // it runs. Dropping the result keeps a type the user has already moved away
      // from out of the notice and out of the record other surfaces read.
      if (!isInvocationCurrent()) return
      const siteTypeSuggestion =
        siteTypeCheck?.outcome === SITE_TYPE_MISMATCH_OUTCOMES.Mismatch
          ? siteTypeCheck.mismatch
          : undefined
      // Share what the dialog just learned, so features that never run auto
      // check-in still see the account-level observation, and retire one the site
      // has agreed with since.
      if (accountId && siteTypeSuggestion) {
        await siteTypeObservations.record({
          accountId,
          mismatch: siteTypeSuggestion,
        })
      } else if (
        accountId &&
        siteTypeCheck?.outcome === SITE_TYPE_MISMATCH_OUTCOMES.Agrees
      ) {
        await siteTypeObservations.clear(accountId, requestedSiteType)
      }
      setCheckInRedetectionFeedback({
        ...createCheckInRedetectionFeedback({
          config: discovery.config,
          decision: discovery.decision,
          state: inspectAccountCheckIn({
            config: discovery.config,
            siteType: requestedSiteType,
            siteUrl: requestedUrl,
          }),
          detections: discovery.detections,
          saveRequired:
            mode === DIALOG_MODES.EDIT &&
            discovery.decision.outcome !==
              CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unknown,
        }),
        ...(siteTypeSuggestion ? { siteTypeSuggestion } : {}),
      })
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
      setCheckInRedetectionFeedback({
        kind: "failed",
        reason: "operation",
        diagnostic: getErrorMessage(error),
      })
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
    updateDraft,
    url,
  ])

  return {
    isRedetectingCheckInMethods,
    checkInRedetectionFeedback,
    handleRedetectCheckInMethods,
    resetCheckInRedetection,
  }
}
