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

const loadTargetSummaries = (targets: ApiVerificationHistoryTarget[]) =>
  verificationResultHistoryStorage.getLatestSummaries(targets)

const loadProfileSummaries = (profileIds: string[]) =>
  verificationResultHistoryStorage.getLatestProfileSummaries(profileIds)

/** Shares storage subscription, stale-request protection, and error handling. */
function useStoredVerificationSummaries<T>(
  stableItems: T[],
  stableItemSignature: string,
  loadSummaries: (
    items: T[],
  ) => Promise<Record<string, ApiVerificationHistorySummary>>,
) {
  const [summariesByKey, setSummariesByKey] = useState<
    Record<string, ApiVerificationHistorySummary>
  >({})
  const latestRequestIdRef = useRef(0)
  const stableItemsRef = useRef(stableItems)

  useEffect(() => {
    stableItemsRef.current = stableItems
  }, [stableItems, stableItemSignature])

  const reload = useCallback(async () => {
    const currentItems = stableItemsRef.current
    const requestId = ++latestRequestIdRef.current

    if (stableItemSignature === "[]" || currentItems.length === 0) {
      if (requestId !== latestRequestIdRef.current) return

      setSummariesByKey((prev) => (Object.keys(prev).length === 0 ? prev : {}))
      return
    }

    try {
      const nextSummaries = await loadSummaries(currentItems)
      if (requestId !== latestRequestIdRef.current) return

      setSummariesByKey(nextSummaries)
    } catch (error) {
      if (requestId !== latestRequestIdRef.current) return

      logger.error("Failed to load verification result history", error)
      setSummariesByKey((prev) => (Object.keys(prev).length === 0 ? prev : {}))
    }
  }, [loadSummaries, stableItemSignature])

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

/**
 * Loads persisted verification summaries for a known set of UI targets and keeps
 * them fresh when extension storage changes.
 */
export function useVerificationResultHistorySummaries(
  targets: ApiVerificationHistoryTarget[],
) {
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

  return useStoredVerificationSummaries(
    stableTargets,
    stableTargetSignature,
    loadTargetSummaries,
  )
}

/** Loads the newest profile- or model-scoped API verification per profile. */
export function useLatestProfileVerificationSummaries(profileIds: string[]) {
  const { stableProfileIds, stableProfileIdSignature } = useMemo(() => {
    const normalizedProfileIds = Array.from(
      new Set(profileIds.map((profileId) => profileId.trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b))

    return {
      stableProfileIds: normalizedProfileIds,
      stableProfileIdSignature: JSON.stringify(normalizedProfileIds),
    }
  }, [profileIds])

  return useStoredVerificationSummaries(
    stableProfileIds,
    stableProfileIdSignature,
    loadProfileSummaries,
  )
}
