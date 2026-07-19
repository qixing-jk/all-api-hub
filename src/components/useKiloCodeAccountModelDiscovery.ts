import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { resolveExportTokenForSecret } from "~/services/accounts/utils/exportTokenSecret"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import type {
  KiloCodeDefaultModelSelection,
  KiloCodeV7ProviderSelection,
  PreparedKiloCodeV7Catalog,
} from "~/services/integrations/kiloCodeExport"
import { prepareKiloCodeV7Catalog } from "~/services/integrations/kiloCodeV7Catalog"
import { reconcileKiloCodeV7DefaultSelection } from "~/services/integrations/kiloCodeV7Selection"
import {
  coerceBaseUrlToPathSuffix,
  stripTrailingOpenAIV1,
} from "~/utils/core/url"

import type {
  KiloCodeAccountExportSelection,
  KiloCodeAccountLegacySelection,
} from "./kiloCodeAccountExport"

export const KILO_CODE_ACCOUNT_MODEL_STATUSES = {
  Idle: "idle",
  Loading: "loading",
  Loaded: "loaded",
  Error: "error",
} as const

export type KiloCodeAccountModelStatus =
  (typeof KILO_CODE_ACCOUNT_MODEL_STATUSES)[keyof typeof KILO_CODE_ACCOUNT_MODEL_STATUSES]

export interface KiloCodeAccountModelInventory {
  status: KiloCodeAccountModelStatus
  modelIds: string[]
  sourceFingerprint?: string
}

interface PreparedAccountCatalog {
  catalog?: PreparedKiloCodeV7Catalog
  invalidSelection: boolean
}

/** Normalize upstream IDs once at the async inventory boundary. */
function normalizeDiscoveredModelIds(modelIds: unknown[] | null | undefined) {
  return Array.from(
    new Set(
      (modelIds ?? [])
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  ).sort((left, right) => (left === right ? 0 : left < right ? -1 : 1))
}

/** Validate persisted runtime facts before invoking the throwing catalog API. */
function hasInvalidRuntimeKey(selection: KiloCodeAccountExportSelection) {
  if (
    typeof selection.runtimeKey.tokenKey !== "string" ||
    !selection.runtimeKey.tokenKey.trim() ||
    typeof selection.runtimeKey.baseUrl !== "string"
  ) {
    return true
  }

  try {
    const url = new URL(
      coerceBaseUrlToPathSuffix(selection.runtimeKey.baseUrl, "/v1"),
    )
    return url.protocol !== "http:" && url.protocol !== "https:"
  } catch {
    return true
  }
}

/** Hash the primitive inputs that can change model discovery results. */
function getModelDiscoverySourceFingerprint(
  selection: KiloCodeAccountExportSelection,
) {
  const serialized = JSON.stringify([
    selection.runtimeKey.baseUrl,
    selection.site.id,
    selection.site.siteType,
    selection.site.baseUrl,
    selection.site.authType,
    selection.site.userId,
    selection.site.token,
    selection.site.cookieAuthSessionCookie ?? null,
    selection.token.id,
    selection.token.key,
  ])
  let hash = 0x811c9dc5
  for (const character of serialized) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

/** Convert incomplete or invalid selections into controlled dialog state. */
function prepareAccountCatalog(
  selections: KiloCodeAccountExportSelection[],
  v7Selections: KiloCodeV7ProviderSelection[],
): PreparedAccountCatalog {
  if (selections.some(hasInvalidRuntimeKey)) {
    return { invalidSelection: true }
  }
  if (
    !v7Selections.length ||
    v7Selections.some(
      (selection) =>
        !selection.discoveredModelIds.length &&
        !selection.manualModelId?.trim(),
    )
  ) {
    return { invalidSelection: false }
  }

  try {
    const catalog = prepareKiloCodeV7Catalog(v7Selections)
    return {
      catalog,
      invalidSelection: catalog.providers.length !== selections.length,
    }
  } catch {
    return { invalidSelection: true }
  }
}

const EMPTY_MODEL_INVENTORY: KiloCodeAccountModelInventory = {
  status: KILO_CODE_ACCOUNT_MODEL_STATUSES.Idle,
  modelIds: [],
}

/** Own per-token model inventory plus isolated legacy and V7 model state. */
export function useKiloCodeAccountModelDiscovery({
  isOpen,
  selections,
}: {
  isOpen: boolean
  selections: KiloCodeAccountExportSelection[]
}) {
  const [modelInventories, setModelInventories] = useState<
    Record<string, KiloCodeAccountModelInventory>
  >({})
  const [legacyModelIdByToken, setLegacyModelIdByToken] = useState<
    Record<string, string>
  >({})
  const [v7ManualModelIdByToken, setV7ManualModelIdByToken] = useState<
    Record<string, string>
  >({})
  const [v7DefaultModel, setV7DefaultModel] = useState<
    KiloCodeDefaultModelSelection | undefined
  >()
  const requestIdsRef = useRef(new Map<string, number>())
  const activeSelectionIdsRef = useRef(new Set<string>())
  const activeSourceFingerprintsRef = useRef(new Map<string, string>())
  const isOpenRef = useRef(isOpen)
  const isMountedRef = useRef(false)

  const selectionById = useMemo(
    () =>
      new Map(
        selections.map((selection) => [selection.selectionId, selection]),
      ),
    [selections],
  )
  const sourceFingerprintById = useMemo(
    () =>
      new Map(
        selections.map((selection) => [
          selection.selectionId,
          getModelDiscoverySourceFingerprint(selection),
        ]),
      ),
    [selections],
  )

  useEffect(() => {
    const requestIds = requestIdsRef.current
    const activeSelectionIds = activeSelectionIdsRef.current
    const activeSourceFingerprints = activeSourceFingerprintsRef.current
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      isOpenRef.current = false
      for (const selectionId of requestIds.keys()) {
        requestIds.set(selectionId, (requestIds.get(selectionId) ?? 0) + 1)
      }
      activeSelectionIds.clear()
      activeSourceFingerprints.clear()
    }
  }, [])

  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  useEffect(() => {
    const nextIds = new Set(
      selections.map((selection) => selection.selectionId),
    )
    for (const selectionId of new Set([
      ...activeSelectionIdsRef.current,
      ...nextIds,
    ])) {
      const previousFingerprint =
        activeSourceFingerprintsRef.current.get(selectionId)
      const nextFingerprint = sourceFingerprintById.get(selectionId)
      if (
        previousFingerprint !== undefined &&
        previousFingerprint !== nextFingerprint
      ) {
        requestIdsRef.current.set(
          selectionId,
          (requestIdsRef.current.get(selectionId) ?? 0) + 1,
        )
      }
    }
    activeSelectionIdsRef.current.clear()
    for (const selectionId of nextIds) {
      activeSelectionIdsRef.current.add(selectionId)
    }
    activeSourceFingerprintsRef.current.clear()
    for (const [selectionId, sourceFingerprint] of sourceFingerprintById) {
      activeSourceFingerprintsRef.current.set(selectionId, sourceFingerprint)
    }

    const prune = <T>(values: Record<string, T>) => {
      const entries = Object.entries(values).filter(([selectionId]) =>
        nextIds.has(selectionId),
      )
      return entries.length === Object.keys(values).length
        ? values
        : Object.fromEntries(entries)
    }
    setModelInventories((current) => {
      let changed = Object.keys(current).length !== nextIds.size
      const next: Record<string, KiloCodeAccountModelInventory> = {}
      for (const selectionId of nextIds) {
        const sourceFingerprint = sourceFingerprintById.get(selectionId)
        const inventory = current[selectionId]
        if (inventory && inventory.sourceFingerprint === sourceFingerprint) {
          next[selectionId] = inventory
          continue
        }
        changed = true
        next[selectionId] = {
          status: KILO_CODE_ACCOUNT_MODEL_STATUSES.Idle,
          modelIds: [],
          sourceFingerprint,
        }
      }
      return changed ? next : current
    })
    setLegacyModelIdByToken(prune)
    setV7ManualModelIdByToken(prune)
  }, [selections, sourceFingerprintById])

  useEffect(() => {
    if (isOpen) return

    for (const selectionId of activeSelectionIdsRef.current) {
      requestIdsRef.current.set(
        selectionId,
        (requestIdsRef.current.get(selectionId) ?? 0) + 1,
      )
    }
    setModelInventories({})
    setLegacyModelIdByToken({})
    setV7ManualModelIdByToken({})
    setV7DefaultModel(undefined)
  }, [isOpen])

  const loadModels = useCallback(
    async (selectionId: string) => {
      const selection = selectionById.get(selectionId)
      if (
        !selection ||
        hasInvalidRuntimeKey(selection) ||
        !isOpenRef.current ||
        !isMountedRef.current
      )
        return

      const sourceFingerprint = getModelDiscoverySourceFingerprint(selection)
      const requestId = (requestIdsRef.current.get(selectionId) ?? 0) + 1
      requestIdsRef.current.set(selectionId, requestId)
      setModelInventories((current) => ({
        ...current,
        [selectionId]: {
          status: KILO_CODE_ACCOUNT_MODEL_STATUSES.Loading,
          modelIds: current[selectionId]?.modelIds ?? [],
          sourceFingerprint,
        },
      }))

      try {
        const resolvedToken = await resolveExportTokenForSecret(
          selection.site,
          selection.token,
        )
        const upstreamModelIds = await fetchOpenAICompatibleModelIds({
          baseUrl: stripTrailingOpenAIV1(selection.runtimeKey.baseUrl),
          apiKey: resolvedToken.key,
        })
        const modelIds = normalizeDiscoveredModelIds(upstreamModelIds)
        if (
          !isMountedRef.current ||
          !isOpenRef.current ||
          !activeSelectionIdsRef.current.has(selectionId) ||
          activeSourceFingerprintsRef.current.get(selectionId) !==
            sourceFingerprint ||
          requestIdsRef.current.get(selectionId) !== requestId
        ) {
          return
        }

        setModelInventories((current) => ({
          ...current,
          [selectionId]: {
            status: KILO_CODE_ACCOUNT_MODEL_STATUSES.Loaded,
            modelIds,
            sourceFingerprint,
          },
        }))
        setLegacyModelIdByToken((current) =>
          current[selectionId]?.trim() || !modelIds[0]
            ? current
            : { ...current, [selectionId]: modelIds[0] },
        )
      } catch {
        if (
          !isMountedRef.current ||
          !isOpenRef.current ||
          !activeSelectionIdsRef.current.has(selectionId) ||
          activeSourceFingerprintsRef.current.get(selectionId) !==
            sourceFingerprint ||
          requestIdsRef.current.get(selectionId) !== requestId
        ) {
          return
        }
        setModelInventories((current) => ({
          ...current,
          [selectionId]: {
            status: KILO_CODE_ACCOUNT_MODEL_STATUSES.Error,
            modelIds: current[selectionId]?.modelIds ?? [],
            sourceFingerprint,
          },
        }))
      }
    },
    [selectionById],
  )

  useEffect(() => {
    if (!isOpen) return
    for (const selection of selections) {
      if (hasInvalidRuntimeKey(selection)) continue
      const inventory = modelInventories[selection.selectionId]
      const sourceFingerprint = sourceFingerprintById.get(selection.selectionId)
      if (
        !inventory ||
        inventory.sourceFingerprint !== sourceFingerprint ||
        inventory.status === KILO_CODE_ACCOUNT_MODEL_STATUSES.Idle
      ) {
        void loadModels(selection.selectionId)
      }
    }
  }, [isOpen, loadModels, modelInventories, selections, sourceFingerprintById])

  const discoveredModelIdsByToken = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(modelInventories).map(([selectionId, inventory]) => [
          selectionId,
          inventory.modelIds,
        ]),
      ),
    [modelInventories],
  )
  const v7Selections = useMemo<KiloCodeV7ProviderSelection[]>(
    () =>
      selections.map((selection) => ({
        ...selection.runtimeKey,
        selectionId: selection.selectionId,
        providerName: selection.providerName,
        discoveredModelIds:
          discoveredModelIdsByToken[selection.selectionId] ?? [],
        manualModelId:
          v7ManualModelIdByToken[selection.selectionId]?.trim() || undefined,
      })),
    [discoveredModelIdsByToken, selections, v7ManualModelIdByToken],
  )
  const legacySelections = useMemo<KiloCodeAccountLegacySelection[]>(
    () =>
      selections.map((selection) => ({
        ...selection.runtimeKey,
        selectionId: selection.selectionId,
        legacyModelId:
          legacyModelIdByToken[selection.selectionId]?.trim() || undefined,
      })),
    [legacyModelIdByToken, selections],
  )
  const preparedV7 = useMemo(
    () => prepareAccountCatalog(selections, v7Selections),
    [selections, v7Selections],
  )
  const validV7Default = useMemo(
    () =>
      preparedV7.catalog
        ? reconcileKiloCodeV7DefaultSelection(
            preparedV7.catalog,
            v7DefaultModel,
          )
        : undefined,
    [preparedV7.catalog, v7DefaultModel],
  )

  useEffect(() => {
    setV7DefaultModel((current) =>
      preparedV7.catalog
        ? reconcileKiloCodeV7DefaultSelection(preparedV7.catalog, current)
        : undefined,
    )
  }, [preparedV7.catalog])

  const selectV7DefaultProvider = useCallback(
    (selectionId: string) => {
      const provider = preparedV7.catalog?.providers.find(
        (candidate) => candidate.selectionId === selectionId,
      )
      setV7DefaultModel(
        provider?.modelIds[0]
          ? { selectionId, modelId: provider.modelIds[0] }
          : undefined,
      )
    },
    [preparedV7.catalog],
  )

  const selectV7DefaultModel = useCallback((modelId: string) => {
    setV7DefaultModel((current) =>
      current ? { ...current, modelId } : undefined,
    )
  }, [])

  const selectLegacyModel = useCallback(
    (selectionId: string, modelId: string) => {
      setLegacyModelIdByToken((current) => ({
        ...current,
        [selectionId]: modelId,
      }))
    },
    [],
  )

  const selectV7ManualModel = useCallback(
    (selectionId: string, modelId: string) => {
      setV7ManualModelIdByToken((current) => ({
        ...current,
        [selectionId]: modelId.trim(),
      }))
    },
    [],
  )

  const removeV7ManualModel = useCallback((selectionId: string) => {
    setV7ManualModelIdByToken((current) => {
      const { [selectionId]: _removed, ...remaining } = current
      return remaining
    })
  }, [])

  return {
    getModelInventory: (selectionId: string) =>
      modelInventories[selectionId] ?? EMPTY_MODEL_INVENTORY,
    invalidSelection: preparedV7.invalidSelection,
    legacySelections,
    loadModels,
    preparedCatalog: preparedV7.catalog,
    removeV7ManualModel,
    selectLegacyModel,
    selectV7DefaultModel,
    selectV7DefaultProvider,
    selectV7ManualModel,
    v7DefaultModel: validV7Default,
    v7Selections,
  }
}
