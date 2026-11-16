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
import { AUTO_CHECKIN_SKIP_REASON } from "~/types/autoCheckin"
import { getBrowserVersionInfo } from "~/utils/browser/userAgent"
import { sanitizeSensitiveErrorText } from "~/utils/core/sanitizeSensitiveErrorText"
import pkg from "~~/package.json"

const REPORT_MESSAGE_MAX_LENGTH = 2000

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
  const executionMessage = (() => {
    if (
      recordState !== FEEDBACK_EXECUTION_RECORDS.Available ||
      !snapshot.execution
    )
      return ""
    if (
      snapshot.execution.reasonCode &&
      snapshot.execution.reasonCode !==
        AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED &&
      snapshot.execution.reasonCode !==
        AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR &&
      !snapshot.execution.messageKey
    ) {
      return ""
    }
    const text = getAutoCheckinResultMessage(t, snapshot.execution)
    return sanitizeReportMessage(text)
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
    executionMessage,
    recordState,
    reloading,
    handleReloadExecution,
  }
}
