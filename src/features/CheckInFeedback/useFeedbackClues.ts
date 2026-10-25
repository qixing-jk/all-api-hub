import { useEffect, useState } from "react"

import type { AuthConfig } from "~/services/apiTransport/type"
import { listCheckInRoutePaths } from "~/services/checkin/autoCheckin/configuration/routeOverrides"
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
          {
            baseUrl: snapshot.baseUrl,
            siteType: snapshot.siteType,
            ...(auth ? { auth } : {}),
            // A deployment's own path is what this account actually calls, so
            // the report reads it first instead of only the canonical route.
            routePaths: listCheckInRoutePaths(snapshot.checkIn),
          },
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
