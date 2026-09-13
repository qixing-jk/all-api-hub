import { useEffect, useRef, useState } from "react"

import { createTab } from "~/utils/browser/browserApi"

/** Owns sharing feedback and manual-copy recovery for one mounted report session. */
export function useFeedbackSubmission(
  report: string,
  issue: { url: string; needsCopy: boolean },
) {
  const [feedback, setFeedback] = useState<
    "copied" | "copyFailed" | "openFailed" | "opened" | "paste" | null
  >(null)
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
    setFeedback(null)
  }, [report])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report)
      if (mounted.current) {
        setFeedback("copied")
        setManualCopy(false)
      }
      return true
    } catch {
      if (mounted.current) {
        setFeedback("copyFailed")
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
      if (issue.needsCopy && !manuallyCopied && !(await copy())) {
        return
      }
      await createTab(issue.url)
      if (mounted.current) setFeedback(issue.needsCopy ? "paste" : "opened")
    } catch {
      if (mounted.current) setFeedback("openFailed")
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
