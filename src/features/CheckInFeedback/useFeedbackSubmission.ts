import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendRuntimeActionMessage } from "~/utils/browser/runtimeMessages"
import { createTab } from "~/utils/browser/tabs"

import {
  SUBMISSION_FEEDBACK,
  type SubmissionFeedback,
} from "./submissionFeedback"

/** Owns sharing feedback and manual-copy recovery for one mounted report session. */
export function useFeedbackSubmission(
  report: string,
  issue: { url: string; needsCopy: boolean },
) {
  const [feedback, setFeedback] = useState<SubmissionFeedback | null>(null)
  const { t } = useTranslation("accountDialog")
  const currentReport = useRef(report)
  const [opening, setOpening] = useState(false)
  const [manualCopy, setManualCopy] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [rawOpen, setRawOpen] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    currentReport.current = report
    setFeedback(null)
    setManualCopy(false)
  }, [report])
  const isCurrentReport = () =>
    mounted.current && currentReport.current === report
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report)
      if (isCurrentReport()) {
        setFeedback(SUBMISSION_FEEDBACK.COPIED)
        setManualCopy(false)
      }
      return isCurrentReport()
    } catch {
      if (isCurrentReport()) {
        setFeedback(SUBMISSION_FEEDBACK.COPY_FAILED)
        setPreviewOpen(true)
        setRawOpen(true)
        setManualCopy(issue.needsCopy)
      }
      return false
    }
  }
  const open = async (manuallyCopied = false) => {
    setOpening(true)
    try {
      if (issue.needsCopy && !manuallyCopied && !(await copy())) return
      if (issue.needsCopy) {
        const response = await sendRuntimeActionMessage<{ success: boolean }>(
          {
            action: RuntimeActionIds.OpenCheckInFeedbackIssue,
            url: issue.url,
            hint: {
              title: t("checkInFeedback.githubHintTitle"),
              description: t("checkInFeedback.githubHint"),
              dismiss: t("common:actions.close"),
            },
          },
          { maxAttempts: 1 },
        )
        if (!response?.success) throw new Error("Could not open feedback tab")
      } else {
        await createTab(issue.url)
      }
      if (isCurrentReport())
        setFeedback(
          issue.needsCopy
            ? SUBMISSION_FEEDBACK.PASTE
            : SUBMISSION_FEEDBACK.OPENED,
        )
    } catch {
      if (isCurrentReport()) setFeedback(SUBMISSION_FEEDBACK.OPEN_FAILED)
    } finally {
      if (mounted.current) setOpening(false)
    }
  }
  return {
    feedback,
    opening,
    manualCopy,
    previewOpen,
    setPreviewOpen,
    rawOpen,
    setRawOpen,
    copy,
    open,
  }
}
