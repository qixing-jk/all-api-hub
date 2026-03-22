import { useCallback, useEffect, useMemo, useState } from "react"

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

  const stableTargets = useMemo(() => {
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

    return next.map(({ target }) => target)
  }, [targets])

  const reload = useCallback(async () => {
    if (stableTargets.length === 0) {
      setSummariesByKey({})
      return
    }

    try {
      const nextSummaries =
        await verificationResultHistoryStorage.getLatestSummaries(stableTargets)
      setSummariesByKey(nextSummaries)
    } catch (error) {
      logger.error("Failed to load verification result history", error)
      setSummariesByKey({})
    }
  }, [stableTargets])

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
