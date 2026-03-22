import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { createLogger } from "~/utils/core/logger"

import {
  subscribeToVerificationResultHistoryChanges,
  verificationResultHistoryStorage,
} from "./storage"
import type {
  ApiVerificationHistorySummary,
  ApiVerificationHistoryTarget,
} from "./types"
import { serializeVerificationHistoryTarget } from "./utils"

const logger = createLogger("VerificationResultHistoryHook")

/**
 * Loads persisted verification summaries for a known set of UI targets and keeps
 * them fresh when extension storage changes.
 */
export function useVerificationResultHistorySummaries(
  targets: ApiVerificationHistoryTarget[],
) {
  const [summariesByKey, setSummariesByKey] = useState<
    Record<string, ApiVerificationHistorySummary>
  >({})
  const latestRequestIdRef = useRef(0)

  const { stableTargets, stableTargetSignature } = useMemo(() => {
    const seen = new Set<string>()
    const next: Array<{ target: ApiVerificationHistoryTarget; key: string }> =
      []

    for (const target of targets) {
      const key = serializeVerificationHistoryTarget(target)
      if (seen.has(key)) continue
      seen.add(key)
      next.push({ target, key })
    }

    next.sort((a, b) => a.key.localeCompare(b.key))

    return {
      stableTargets: next.map(({ target }) => target),
      stableTargetSignature: JSON.stringify(next.map(({ key }) => key)),
    }
  }, [targets])
  const stableTargetsRef = useRef(stableTargets)

  useEffect(() => {
    stableTargetsRef.current = stableTargets
  }, [stableTargets, stableTargetSignature])

  const reload = useCallback(async () => {
    const currentTargets = stableTargetsRef.current
    const requestId = ++latestRequestIdRef.current

    if (stableTargetSignature === "[]" || currentTargets.length === 0) {
      if (requestId !== latestRequestIdRef.current) return

      setSummariesByKey((prev) => (Object.keys(prev).length === 0 ? prev : {}))
      return
    }

    try {
      const nextSummaries =
        await verificationResultHistoryStorage.getLatestSummaries(
          currentTargets,
        )
      if (requestId !== latestRequestIdRef.current) return

      setSummariesByKey(nextSummaries)
    } catch (error) {
      if (requestId !== latestRequestIdRef.current) return

      logger.error("Failed to load verification result history", error)
      setSummariesByKey((prev) => (Object.keys(prev).length === 0 ? prev : {}))
    }
  }, [stableTargetSignature])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    return subscribeToVerificationResultHistoryChanges(() => {
      void reload()
    })
  }, [reload])

  return {
    summariesByKey,
    reload,
  }
}
