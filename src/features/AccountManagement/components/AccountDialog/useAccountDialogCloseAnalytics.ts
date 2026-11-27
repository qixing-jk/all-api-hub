import { useCallback, useEffect, useRef } from "react"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import {
  AutoDetectErrorType,
  type AutoDetectError,
} from "~/services/accounts/utils/autoDetectUtils"
import {
  PRODUCT_ANALYTICS_ACCOUNT_DIALOG_PHASES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
} from "~/services/productAnalytics/contracts"
import { trackProductAnalyticsEvent } from "~/services/productAnalytics/runtime/dispatch"
import { isExtensionPopup, isExtensionSidePanel } from "~/utils/browser"

import { ACCOUNT_DIALOG_PHASES, type AccountDialogPhase } from "./models"

interface CloseObservation {
  isOpen: boolean
  mode: DialogMode
  state: {
    phase: AccountDialogPhase
    isFormValid: boolean
    detectionError: Pick<AutoDetectError, "type"> | null
    isDetecting: boolean
    isSaving: boolean
    isAutoConfiguring: boolean
  }
  submissionBlocked: boolean
  needsAimlApiVerification: boolean
  validationIssueCount: number
}

/** Observes explicit closes once per opening; unmounting alone is not a close. */
export function useAccountDialogCloseAnalytics({
  isOpen,
  mode,
  state: {
    phase,
    isFormValid,
    detectionError,
    isDetecting,
    isSaving,
    isAutoConfiguring,
  },
  submissionBlocked,
  needsAimlApiVerification,
  validationIssueCount,
}: CloseObservation) {
  const observationSent = useRef(false)
  useEffect(() => {
    if (!isOpen) observationSent.current = false
  }, [isOpen])

  return useCallback(() => {
    if (!isOpen || mode !== DIALOG_MODES.ADD || observationSent.current) return
    observationSent.current = true
    void trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.AccountDialogClosed,
      {
        entrypoint: isExtensionPopup()
          ? PRODUCT_ANALYTICS_ENTRYPOINTS.Popup
          : isExtensionSidePanel()
            ? PRODUCT_ANALYTICS_ENTRYPOINTS.Sidepanel
            : PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        dialog_phase:
          phase === ACCOUNT_DIALOG_PHASES.SITE_INPUT
            ? PRODUCT_ANALYTICS_ACCOUNT_DIALOG_PHASES.SiteInput
            : PRODUCT_ANALYTICS_ACCOUNT_DIALOG_PHASES.AccountForm,
        form_valid: isFormValid,
        submission_blocked: submissionBlocked,
        verification_required:
          detectionError?.type ===
            AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED ||
          needsAimlApiVerification,
        validation_issue_count: validationIssueCount,
        detection_pending: isDetecting,
        save_pending: isSaving || isAutoConfiguring,
      },
    )
  }, [
    isOpen,
    mode,
    phase,
    isFormValid,
    detectionError,
    isDetecting,
    isSaving,
    isAutoConfiguring,
    submissionBlocked,
    needsAimlApiVerification,
    validationIssueCount,
  ])
}
