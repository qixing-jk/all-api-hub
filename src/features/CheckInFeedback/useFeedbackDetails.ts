import type { TFunction } from "i18next"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { getAutoCheckinResultMessage } from "~/features/AutoCheckin/utils/autoCheckin"
import type { AuthConfig } from "~/services/apiTransport/type"
import type { FeedbackExecutionEvidence } from "~/services/checkin/feedback/execution"
import {
  FEEDBACK_EXECUTION_RECORDS,
  FEEDBACK_EXECUTION_SOURCES,
} from "~/services/checkin/feedback/executionTypes"
import {
  buildCheckInFeedbackDetails,
  getFeedbackExecutionRecord,
  type CheckInFeedbackSnapshot,
} from "~/services/checkin/feedback/report"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"
import { getBrowserVersionInfo } from "~/utils/browser/userAgent"
import { sanitizeSensitiveErrorText } from "~/utils/core/sanitizeSensitiveErrorText"
import pkg from "~~/package.json"

const REPORT_MESSAGE_MAX_LENGTH = 2000

/** Uses short, localized descriptions for supported reasons in public titles. */
function getIssueTitleReason(
  t: TFunction<["accountDialog", "autoCheckin"]>,
  reason: AutoCheckinSkipReason | undefined,
): string | undefined {
  switch (reason) {
    case AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED:
      return t(
        "accountDialog:checkInFeedback.titleReasons.authenticationRequired",
      )
    case AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED:
      return t(
        "accountDialog:checkInFeedback.titleReasons.manualVerificationRequired",
      )
    case AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED:
      return t("accountDialog:checkInFeedback.titleReasons.methodNotMatched")
    case AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR:
      return t("accountDialog:checkInFeedback.titleReasons.networkError")
    case AUTO_CHECKIN_SKIP_REASON.NO_AVAILABLE_METHOD:
      return t("accountDialog:checkInFeedback.titleReasons.noAvailableMethod")
    case AUTO_CHECKIN_SKIP_REASON.TIMEOUT:
      return t("accountDialog:checkInFeedback.titleReasons.timeout")
    default:
      return undefined
  }
}

/** Owns diagnostic details and evidence reloads without replacing authored notes or clues. */
export function useFeedbackDetails(
  initialSnapshot: CheckInFeedbackSnapshot,
  auth?: AuthConfig,
  reloadExecution?: () => Promise<FeedbackExecutionEvidence>,
) {
  const { t } = useTranslation(["accountDialog", "autoCheckin"])
  const [browserInfo, setBrowserInfo] = useState<string>()
  useEffect(() => {
    let active = true
    void getBrowserVersionInfo()
      .then((info) => {
        if (active) setBrowserInfo(info)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [reloading, setReloading] = useState(false)
  const reloadInFlight = useRef(false)
  const recordState = getFeedbackExecutionRecord(snapshot)
  const execution =
    recordState === FEEDBACK_EXECUTION_RECORDS.Available
      ? snapshot.execution
      : undefined
  const titleReason =
    execution &&
    execution.status !== CHECKIN_RESULT_STATUS.SUCCESS &&
    execution.status !== CHECKIN_RESULT_STATUS.ALREADY_CHECKED
      ? getIssueTitleReason(t, execution.reasonCode)
      : undefined
  const issueTitleSummary = titleReason
    ? t("checkInFeedback.titleLastCheckIn", { reason: titleReason })
    : undefined
  const executionMessage = (() => {
    if (!execution) return ""
    const { reasonCode, messageKey } = execution
    if (
      reasonCode &&
      reasonCode !== AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED &&
      reasonCode !== AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR &&
      !messageKey
    ) {
      return ""
    }
    return sanitizeReportMessage(getAutoCheckinResultMessage(t, execution))
  })()
  /** Redacts known credentials and URL details before public report generation. */
  function sanitizeReportMessage(text: string) {
    for (const secret of [
      auth?.accessToken,
      auth?.cookie,
      auth?.refreshToken,
    ].sort((a, b) => (b?.length ?? 0) - (a?.length ?? 0))) {
      if (secret) text = text.replaceAll(secret, "[REDACTED]")
    }
    // Public reports do not carry URLs embedded in error messages.
    return sanitizeSensitiveErrorText(text)
      .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
      .slice(0, REPORT_MESSAGE_MAX_LENGTH)
  }
  const [detailsOverride, setDetails] = useState<string | null>(null)
  const refreshMessage = sanitizeReportMessage(
    snapshot.refresh?.health.reason ?? "",
  )
  const generatedDetails = useMemo(
    () =>
      buildCheckInFeedbackDetails(
        { ...snapshot, authType: auth?.authType },
        {
          version: pkg.version,
          executionMessage,
          refreshMessage,
          platform: import.meta.env.FIREFOX ? "firefox" : "chromium",
          browserInfo,
        },
      ),
    [snapshot, auth, executionMessage, refreshMessage, browserInfo],
  )
  const details = detailsOverride ?? generatedDetails
  /** Reloads evidence without restarting the scan or replacing user-authored sections. */
  async function handleReloadExecution() {
    if (!reloadExecution || reloadInFlight.current) return
    reloadInFlight.current = true
    setReloading(true)
    try {
      let evidence: FeedbackExecutionEvidence
      try {
        evidence = await reloadExecution()
      } catch {
        evidence = {
          executionRecord: FEEDBACK_EXECUTION_RECORDS.ReadFailed,
          executionSource: FEEDBACK_EXECUTION_SOURCES.SavedHistory,
        }
      }
      setSnapshot((current) => ({
        ...current,
        execution: undefined,
        ...evidence,
      }))
      setDetails(null)
    } finally {
      reloadInFlight.current = false
      setReloading(false)
    }
  }
  return {
    snapshot,
    browserInfo,
    details,
    setDetails,
    execution,
    executionMessage,
    issueTitleSummary,
    recordState,
    reloading,
    handleReloadExecution,
  }
}
