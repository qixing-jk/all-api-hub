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
  const loadTokenRef = useRef(0)

  const applyProbes = useCallback(
    (next: ProbeItemState[], invalidatePendingLoad = true) => {
      if (invalidatePendingLoad) {
        loadTokenRef.current += 1
      }

      probesRef.current = next
      setProbeState(next)
    },
    [],
  )

  const setProbes = useCallback(
    (next: ProbeItemState[], invalidatePendingLoad = true) => {
      applyProbes(next, invalidatePendingLoad)
    },
    [applyProbes],
  )

  const applyPersistedSummary = useCallback(
    (
      next: ApiVerificationHistorySummary | null,
      invalidatePendingLoad = true,
    ) => {
      if (invalidatePendingLoad) {
        loadTokenRef.current += 1
      }

      persistedSummaryRef.current = next
      setPersistedSummaryState(next)
    },
    [],
  )

  const setPersistedSummary = useCallback(
    (
      next: ApiVerificationHistorySummary | null,
      invalidatePendingLoad = true,
    ) => {
      applyPersistedSummary(next, invalidatePendingLoad)
    },
    [applyPersistedSummary],
  )

  const persistCurrentResults = useCallback(
    async (
      nextApiType: ApiVerificationApiType,
      nextProbes: ProbeItemState[],
      preferredModelId?: string,
      nextHistoryTarget: ApiVerificationHistoryTarget | null = historyTarget,
    ) => {
      if (!nextHistoryTarget) return null

      const requestToken = ++loadTokenRef.current
      const nextSummary = createVerificationHistorySummary({
        target: nextHistoryTarget,
        apiType: nextApiType,
        results: extractProbeResults(nextProbes),
        preferredModelId,
      })
      if (!nextSummary) return null

      const persisted =
        await verificationResultHistoryStorage.upsertLatestSummary(nextSummary)
      if (loadTokenRef.current !== requestToken) {
        return persisted
      }

      applyPersistedSummary(persisted, false)
      return persisted
    },
    [applyPersistedSummary, historyTarget],
  )

  const loadVerificationHistory = useCallback(
    async ({
      apiType,
      isCancelled,
      onResolvedModelId,
      shouldApplySummaryToProbes,
    }: LoadVerificationHistoryParams) => {
      if (!historyTarget) return null

      const requestToken = ++loadTokenRef.current

      try {
        const summary =
          await verificationResultHistoryStorage.getLatestSummary(historyTarget)
        if (isCancelled?.() || loadTokenRef.current !== requestToken) {
          return summary
        }

        const shouldApplySummary =
          summary && (shouldApplySummaryToProbes?.(summary) ?? true)

        applyPersistedSummary(summary, false)
        applyProbes(
          buildProbeState(apiType, shouldApplySummary ? summary : null),
          false,
        )

        if (shouldApplySummary && summary?.resolvedModelId) {
          onResolvedModelId?.(summary.resolvedModelId)
        }

        return summary
      } catch {
        if (isCancelled?.() || loadTokenRef.current !== requestToken)
          return null

        applyPersistedSummary(null, false)
        applyProbes(buildProbeState(apiType), false)
        return null
      }
    },
    [applyPersistedSummary, applyProbes, historyTarget],
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
