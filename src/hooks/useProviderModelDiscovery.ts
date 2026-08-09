import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import {
  hashProviderCatalogValue,
  normalizeProviderCatalogModelIds,
} from "~/services/integrations/providerCatalogExport"
import { stripTrailingOpenAIV1 } from "~/utils/core/url"

export const PROVIDER_MODEL_DISCOVERY_STATUSES = {
  Idle: "idle",
  Loading: "loading",
  Loaded: "loaded",
  Error: "error",
} as const

export type ProviderModelDiscoveryStatus =
  (typeof PROVIDER_MODEL_DISCOVERY_STATUSES)[keyof typeof PROVIDER_MODEL_DISCOVERY_STATUSES]

export interface ProviderModelDiscoveryInventory {
  status: ProviderModelDiscoveryStatus
  modelIds: string[]
  cacheKey?: string
}

interface ProviderModelDiscoverySource {
  selectionId: string
  /** Changes whenever credentials or endpoint facts can change discovery output. */
  cacheKey: string
  baseUrl: string
  resolveApiKey: () => Promise<string>
}

type FetchProviderModelIds = (input: {
  baseUrl: string
  apiKey: string
}) => Promise<string[] | null | undefined>

const EMPTY_INVENTORY: ProviderModelDiscoveryInventory = {
  status: PROVIDER_MODEL_DISCOVERY_STATUSES.Idle,
  modelIds: [],
}

/** Hash endpoint and credential-source facts without retaining them in state. */
export function buildProviderModelDiscoveryCacheKey(
  values: readonly unknown[],
) {
  return hashProviderCatalogValue(JSON.stringify(values))
}

/**
 * Own keyed OpenAI-compatible model discovery, including retries and stale-result
 * isolation. Callers keep target-specific model selection and catalog policy.
 */
export function useProviderModelDiscovery({
  isOpen,
  sources,
  fetchModelIds = fetchOpenAICompatibleModelIds,
}: {
  isOpen: boolean
  sources: ProviderModelDiscoverySource[]
  fetchModelIds?: FetchProviderModelIds
}) {
  const [inventories, setInventories] = useState<
    Record<string, ProviderModelDiscoveryInventory>
  >({})
  const requestIdsRef = useRef(new Map<string, number>())
  const activeCacheKeysRef = useRef(new Map<string, string>())
  const isOpenRef = useRef(isOpen)
  const isMountedRef = useRef(false)

  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.selectionId, source])),
    [sources],
  )

  useEffect(() => {
    const requestIds = requestIdsRef.current
    const activeCacheKeys = activeCacheKeysRef.current
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      isOpenRef.current = false
      for (const selectionId of requestIds.keys()) {
        requestIds.set(selectionId, (requestIds.get(selectionId) ?? 0) + 1)
      }
      activeCacheKeys.clear()
    }
  }, [])

  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  useEffect(() => {
    const nextCacheKeys = new Map(
      sources.map((source) => [source.selectionId, source.cacheKey]),
    )
    const allSelectionIds = new Set([
      ...activeCacheKeysRef.current.keys(),
      ...nextCacheKeys.keys(),
    ])

    for (const selectionId of allSelectionIds) {
      const previousCacheKey = activeCacheKeysRef.current.get(selectionId)
      const nextCacheKey = nextCacheKeys.get(selectionId)
      if (previousCacheKey !== undefined && previousCacheKey !== nextCacheKey) {
        requestIdsRef.current.set(
          selectionId,
          (requestIdsRef.current.get(selectionId) ?? 0) + 1,
        )
      }
    }

    activeCacheKeysRef.current.clear()
    for (const [selectionId, cacheKey] of nextCacheKeys) {
      activeCacheKeysRef.current.set(selectionId, cacheKey)
    }

    setInventories((current) => {
      let changed = Object.keys(current).length !== nextCacheKeys.size
      const next: Record<string, ProviderModelDiscoveryInventory> = {}
      for (const [selectionId, cacheKey] of nextCacheKeys) {
        const inventory = current[selectionId]
        if (inventory?.cacheKey === cacheKey) {
          next[selectionId] = inventory
          continue
        }
        changed = true
        next[selectionId] = {
          status: PROVIDER_MODEL_DISCOVERY_STATUSES.Idle,
          modelIds: [],
          cacheKey,
        }
      }
      return changed ? next : current
    })
  }, [sources])

  useEffect(() => {
    if (isOpen) return

    for (const selectionId of activeCacheKeysRef.current.keys()) {
      requestIdsRef.current.set(
        selectionId,
        (requestIdsRef.current.get(selectionId) ?? 0) + 1,
      )
    }
    setInventories({})
  }, [isOpen])

  const loadModels = useCallback(
    async (selectionId: string) => {
      const source = sourceById.get(selectionId)
      if (!source || !isOpenRef.current || !isMountedRef.current) return

      const requestId = (requestIdsRef.current.get(selectionId) ?? 0) + 1
      requestIdsRef.current.set(selectionId, requestId)
      setInventories((current) => ({
        ...current,
        [selectionId]: {
          status: PROVIDER_MODEL_DISCOVERY_STATUSES.Loading,
          modelIds: current[selectionId]?.modelIds ?? [],
          cacheKey: source.cacheKey,
        },
      }))

      try {
        const apiKey = await source.resolveApiKey()
        const upstreamModelIds = await fetchModelIds({
          baseUrl: stripTrailingOpenAIV1(source.baseUrl),
          apiKey,
        })
        const modelIds = normalizeProviderCatalogModelIds(
          upstreamModelIds ?? [],
        )
        if (
          !isMountedRef.current ||
          !isOpenRef.current ||
          activeCacheKeysRef.current.get(selectionId) !== source.cacheKey ||
          requestIdsRef.current.get(selectionId) !== requestId
        ) {
          return
        }
        setInventories((current) => ({
          ...current,
          [selectionId]: {
            status: PROVIDER_MODEL_DISCOVERY_STATUSES.Loaded,
            modelIds,
            cacheKey: source.cacheKey,
          },
        }))
      } catch {
        if (
          !isMountedRef.current ||
          !isOpenRef.current ||
          activeCacheKeysRef.current.get(selectionId) !== source.cacheKey ||
          requestIdsRef.current.get(selectionId) !== requestId
        ) {
          return
        }
        setInventories((current) => ({
          ...current,
          [selectionId]: {
            status: PROVIDER_MODEL_DISCOVERY_STATUSES.Error,
            modelIds: current[selectionId]?.modelIds ?? [],
            cacheKey: source.cacheKey,
          },
        }))
      }
    },
    [fetchModelIds, sourceById],
  )

  useEffect(() => {
    if (!isOpen) return
    for (const source of sources) {
      const inventory = inventories[source.selectionId]
      if (
        !inventory ||
        inventory.cacheKey !== source.cacheKey ||
        inventory.status === PROVIDER_MODEL_DISCOVERY_STATUSES.Idle
      ) {
        void loadModels(source.selectionId)
      }
    }
  }, [inventories, isOpen, loadModels, sources])

  const getInventory = useCallback(
    (selectionId: string) => inventories[selectionId] ?? EMPTY_INVENTORY,
    [inventories],
  )

  return {
    getInventory,
    loadModels,
  }
}
