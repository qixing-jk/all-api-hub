import { useEffect, useState } from "react"

import type { AuthConfig } from "~/services/apiTransport/type"
import {
  getFeedbackOrigin,
  type CheckInFeedbackSnapshot,
} from "~/services/checkin/feedback/report"
import { formatCheckInFeedbackClues } from "~/services/checkin/feedback/scan"
import { collectFeedbackCluesInBrowser } from "~/services/checkin/feedback/scanClient"

/** Collects editable clues while the feedback session is mounted. */
export function useFeedbackClues(
  snapshot: CheckInFeedbackSnapshot,
  auth?: AuthConfig,
) {
  const [clues, setClues] = useState("")
  const [scanStatus, setScanStatus] = useState<
    "idle" | "running" | "completed" | "partial" | "empty"
  >("idle")
  const [authUnavailable, setAuthUnavailable] = useState(false)
  const origin = getFeedbackOrigin(snapshot.baseUrl)
  useEffect(() => {
    if (!origin) {
      setScanStatus("empty")
      return
    }
    const run = new AbortController()
    setScanStatus("running")
    const collect = async () => {
      try {
        const result = await collectFeedbackCluesInBrowser(
          { ...snapshot, auth },
          run.signal,
        )
        if (run.signal.aborted) return
        setClues(formatCheckInFeedbackClues(result))
        setScanStatus(result.status)
        setAuthUnavailable(result.authenticatedQueriesUnavailable)
      } catch {
        if (!run.signal.aborted) setScanStatus("empty")
      }
    }
    void collect()
    return () => run.abort()
  }, [snapshot, auth, origin])
  return {
    clues,
    setClues,
    scanStatus,
    authUnavailable,
    scanning: scanStatus === "running" || scanStatus === "idle",
  }
}
