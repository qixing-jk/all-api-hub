import { useCallback, useRef, useState } from "react"

import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import {
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
  type ApiVerificationHistorySummary,
  type ApiVerificationHistoryTarget,
} from "~/services/verification/verificationResultHistory"

import { buildProbeState, extractProbeResults } from "./probeState"
import type { ProbeItemState } from "./types"

type LoadVerificationHistoryParams = {
  apiType: ApiVerificationApiType
  isCancelled?: () => boolean
  onResolvedModelId?: (modelId: string) => void
  shouldApplySummaryToProbes?: (
    summary: ApiVerificationHistorySummary,
  ) => boolean
}

/**
 * Shared probe + persisted-summary state for verification dialogs.
 */
export function useVerificationDialogState(
  historyTarget: ApiVerificationHistoryTarget | null,
) {
  const [probes, setProbeState] = useState<ProbeItemState[]>([])
  const [persistedSummary, setPersistedSummaryState] =
    useState<ApiVerificationHistorySummary | null>(null)

  const probesRef = useRef<ProbeItemState[]>([])
  const persistedSummaryRef = useRef<ApiVerificationHistorySummary | null>(null)

  const setProbes = useCallback((next: ProbeItemState[]) => {
    probesRef.current = next
    setProbeState(next)
  }, [])

  const setPersistedSummary = useCallback(
    (next: ApiVerificationHistorySummary | null) => {
      persistedSummaryRef.current = next
      setPersistedSummaryState(next)
    },
    [],
  )

  const persistCurrentResults = useCallback(
    async (
      nextApiType: ApiVerificationApiType,
      nextProbes: ProbeItemState[],
      preferredModelId?: string,
    ) => {
      if (!historyTarget) return null

      const nextSummary = createVerificationHistorySummary({
        target: historyTarget,
        apiType: nextApiType,
        results: extractProbeResults(nextProbes),
        preferredModelId,
      })
      if (!nextSummary) return null

      const persisted =
        await verificationResultHistoryStorage.upsertLatestSummary(nextSummary)
      setPersistedSummary(persisted)
      return persisted
    },
    [historyTarget, setPersistedSummary],
  )

  const loadVerificationHistory = useCallback(
    async ({
      apiType,
      isCancelled,
      onResolvedModelId,
      shouldApplySummaryToProbes,
    }: LoadVerificationHistoryParams) => {
      if (!historyTarget) return null

      try {
        const summary =
          await verificationResultHistoryStorage.getLatestSummary(historyTarget)
        if (isCancelled?.()) return summary

        setPersistedSummary(summary)
        setProbes(
          buildProbeState(
            apiType,
            summary && (shouldApplySummaryToProbes?.(summary) ?? true)
              ? summary
              : null,
          ),
        )

        if (summary?.resolvedModelId) {
          onResolvedModelId?.(summary.resolvedModelId)
        }

        return summary
      } catch {
        if (isCancelled?.()) return null

        setPersistedSummary(null)
        setProbes(buildProbeState(apiType))
        return null
      }
    },
    [historyTarget, setPersistedSummary, setProbes],
  )

  return {
    probes,
    setProbes,
    probesRef,
    persistedSummary,
    setPersistedSummary,
    persistedSummaryRef,
    persistCurrentResults,
    loadVerificationHistory,
  }
}
