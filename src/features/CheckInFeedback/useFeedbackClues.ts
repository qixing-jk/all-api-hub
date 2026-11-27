import { useEffect, useState } from "react"

import type { AuthConfig } from "~/services/apiTransport/type"
import { listCheckInRoutePaths } from "~/services/checkin/autoCheckin/configuration/routeOverrides"
import { collectCheckInEvidenceInBrowser } from "~/services/checkin/discovery/evidence/scanClient"
import {
  FEEDBACK_SCAN_STATUSES,
  type FeedbackScanStatus,
} from "~/services/checkin/discovery/evidence/scanTypes"
import {
  getFeedbackOrigin,
  type CheckInFeedbackSnapshot,
} from "~/services/checkin/feedback/report"
import { formatCheckInFeedbackClues } from "~/services/checkin/feedback/scan"

const FEEDBACK_COLLECTION_STATUSES = {
  Idle: "idle",
  Running: "running",
} as const

export type FeedbackCollectionStatus =
  | FeedbackScanStatus
  | (typeof FEEDBACK_COLLECTION_STATUSES)[keyof typeof FEEDBACK_COLLECTION_STATUSES]

/** Collects editable clues while the feedback session is mounted. */
export function useFeedbackClues(
  snapshot: CheckInFeedbackSnapshot,
  auth?: AuthConfig,
) {
  const [clues, setClues] = useState("")
  const [scanStatus, setScanStatus] = useState<FeedbackCollectionStatus>(
    FEEDBACK_COLLECTION_STATUSES.Idle,
  )
  const [authUnavailable, setAuthUnavailable] = useState(false)
  const origin = getFeedbackOrigin(snapshot.baseUrl)
  useEffect(() => {
    if (!origin) {
      setScanStatus(FEEDBACK_SCAN_STATUSES.Empty)
      return
    }
    const run = new AbortController()
    setScanStatus(FEEDBACK_COLLECTION_STATUSES.Running)
    const collect = async () => {
      try {
        const result = await collectCheckInEvidenceInBrowser(
          {
            baseUrl: snapshot.baseUrl,
            siteType: snapshot.siteType,
            ...(auth ? { auth } : {}),
            // A deployment's own path is what this account actually calls, so
            // the report reads it first instead of only the canonical route.
            routePaths: listCheckInRoutePaths(snapshot.checkIn),
            nativePagePath: snapshot.checkIn.nativePagePath,
          },
          run.signal,
        )
        if (run.signal.aborted) return
        setClues(formatCheckInFeedbackClues(result))
        setScanStatus(result.status)
        setAuthUnavailable(result.authenticatedQueriesUnavailable)
      } catch {
        if (!run.signal.aborted) setScanStatus(FEEDBACK_SCAN_STATUSES.Empty)
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
    scanning:
      scanStatus === FEEDBACK_COLLECTION_STATUSES.Running ||
      scanStatus === FEEDBACK_COLLECTION_STATUSES.Idle,
  }
}
