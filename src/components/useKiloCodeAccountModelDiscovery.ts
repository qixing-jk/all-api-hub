import { useCallback, useEffect, useMemo, useState } from "react"

import {
  buildProviderModelDiscoveryCacheKey,
  PROVIDER_MODEL_DISCOVERY_STATUSES,
  useProviderModelDiscovery,
  type ProviderModelDiscoveryInventory,
} from "~/hooks/useProviderModelDiscovery"
import { resolveExportTokenForSecret } from "~/services/accounts/utils/exportTokenSecret"
import {
  KILO_CODE_PROVIDER_PROTOCOLS,
  type KiloCodeProviderProtocol,
} from "~/services/integrations/kiloCodeExport"
import type {
  KiloCodeDefaultModelSelection,
  KiloCodeV7ProviderSelection,
  PreparedKiloCodeV7Catalog,
} from "~/services/integrations/kiloCodeExport"
import { prepareKiloCodeV7Catalog } from "~/services/integrations/kiloCodeV7Catalog"
import { reconcileKiloCodeV7DefaultSelection } from "~/services/integrations/kiloCodeV7Selection"
import { coerceBaseUrlToPathSuffix } from "~/utils/core/url"

import type {
  KiloCodeAccountExportSelection,
  KiloCodeAccountLegacySelection,
} from "./kiloCodeAccountExport"

export const KILO_CODE_ACCOUNT_MODEL_STATUSES =
  PROVIDER_MODEL_DISCOVERY_STATUSES

export type KiloCodeAccountModelStatus =
  (typeof KILO_CODE_ACCOUNT_MODEL_STATUSES)[keyof typeof KILO_CODE_ACCOUNT_MODEL_STATUSES]

export type KiloCodeAccountModelInventory = ProviderModelDiscoveryInventory

interface PreparedAccountCatalog {
  catalog?: PreparedKiloCodeV7Catalog
  invalidSelection: boolean
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
  return buildProviderModelDiscoveryCacheKey([
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

/** Own per-token model inventory plus isolated legacy and V7 model state. */
export function useKiloCodeAccountModelDiscovery({
  isOpen,
  selections,
}: {
  isOpen: boolean
  selections: KiloCodeAccountExportSelection[]
}) {
  const [legacyModelIdByToken, setLegacyModelIdByToken] = useState<
    Record<string, string>
  >({})
  const [v7ManualModelIdByToken, setV7ManualModelIdByToken] = useState<
    Record<string, string>
  >({})
  const [v7ProtocolBySelectionId, setV7ProtocolBySelectionId] = useState<
    Record<string, KiloCodeProviderProtocol>
  >({})
  const [v7DefaultModel, setV7DefaultModel] = useState<
    KiloCodeDefaultModelSelection | undefined
  >()
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
  const modelDiscoverySources = useMemo(
    () =>
      selections
        .filter((selection) => !hasInvalidRuntimeKey(selection))
        .map((selection) => ({
          selectionId: selection.selectionId,
          cacheKey: sourceFingerprintById.get(selection.selectionId)!,
          baseUrl: selection.runtimeKey.baseUrl,
          resolveApiKey: async () =>
            (await resolveExportTokenForSecret(selection.site, selection.token))
              .key,
        })),
    [selections, sourceFingerprintById],
  )
  const { getInventory, loadModels } = useProviderModelDiscovery({
    isOpen,
    sources: modelDiscoverySources,
  })

  useEffect(() => {
    const nextIds = new Set(
      selections.map((selection) => selection.selectionId),
    )

    const prune = <T>(values: Record<string, T>) => {
      const entries = Object.entries(values).filter(([selectionId]) =>
        nextIds.has(selectionId),
      )
      return entries.length === Object.keys(values).length
        ? values
        : Object.fromEntries(entries)
    }
    setLegacyModelIdByToken(prune)
    setV7ManualModelIdByToken(prune)
    setV7ProtocolBySelectionId((current) => {
      const next: Record<string, KiloCodeProviderProtocol> = {}
      for (const selectionId of nextIds) {
        next[selectionId] =
          current[selectionId] ?? KILO_CODE_PROVIDER_PROTOCOLS.OpenAICompatible
      }
      return Object.keys(current).length === nextIds.size &&
        Object.keys(next).every(
          (selectionId) => next[selectionId] === current[selectionId],
        )
        ? current
        : next
    })
  }, [selections])

  useEffect(() => {
    if (isOpen) return

    setLegacyModelIdByToken({})
    setV7ManualModelIdByToken({})
    setV7ProtocolBySelectionId({})
    setV7DefaultModel(undefined)
  }, [isOpen])

  const discoveredModelIdsByToken = useMemo(
    () =>
      Object.fromEntries(
        selections.map((selection) => [
          selection.selectionId,
          getInventory(selection.selectionId).modelIds,
        ]),
      ),
    [getInventory, selections],
  )

  useEffect(() => {
    setLegacyModelIdByToken((current) => {
      let next = current
      for (const selection of selections) {
        const firstModelId =
          discoveredModelIdsByToken[selection.selectionId]?.[0]
        if (current[selection.selectionId]?.trim() || !firstModelId) continue
        if (next === current) next = { ...current }
        next[selection.selectionId] = firstModelId
      }
      return next
    })
  }, [discoveredModelIdsByToken, selections])

  const v7Selections = useMemo<KiloCodeV7ProviderSelection[]>(
    () =>
      selections.map((selection) => ({
        ...selection.runtimeKey,
        selectionId: selection.selectionId,
        providerName: selection.providerName,
        protocol:
          v7ProtocolBySelectionId[selection.selectionId] ??
          KILO_CODE_PROVIDER_PROTOCOLS.OpenAICompatible,
        discoveredModelIds:
          discoveredModelIdsByToken[selection.selectionId] ?? [],
        manualModelId:
          v7ManualModelIdByToken[selection.selectionId]?.trim() || undefined,
      })),
    [
      discoveredModelIdsByToken,
      selections,
      v7ManualModelIdByToken,
      v7ProtocolBySelectionId,
    ],
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

  const selectV7DefaultModel = useCallback(
    (modelId: string) => {
      const normalized = modelId.trim()
      setV7DefaultModel((current) =>
        current ? { ...current, modelId: normalized } : undefined,
      )
      if (!normalized) return
      setV7ManualModelIdByToken((current) => {
        const selection = v7Selections.find(
          (candidate) => candidate.selectionId === v7DefaultModel?.selectionId,
        )
        if (!selection || selection.discoveredModelIds.includes(normalized)) {
          return current
        }
        return {
          ...current,
          [selection.selectionId]: normalized,
        }
      })
    },
    [v7DefaultModel, v7Selections],
  )

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
      const normalized = modelId.trim()
      const selection = v7Selections.find(
        (candidate) => candidate.selectionId === selectionId,
      )
      setV7ManualModelIdByToken((current) => {
        if (!normalized || selection?.discoveredModelIds.includes(normalized)) {
          const { [selectionId]: _removed, ...remaining } = current
          return remaining
        }
        return { ...current, [selectionId]: normalized }
      })
    },
    [v7Selections],
  )

  const selectV7Protocol = useCallback(
    (selectionId: string, protocol: KiloCodeProviderProtocol) => {
      setV7ProtocolBySelectionId((current) => ({
        ...current,
        [selectionId]: protocol,
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
    getModelInventory: getInventory,
    invalidSelection: preparedV7.invalidSelection,
    legacySelections,
    loadModels,
    preparedCatalog: preparedV7.catalog,
    removeV7ManualModel,
    selectLegacyModel,
    selectV7DefaultModel,
    selectV7DefaultProvider,
    selectV7ManualModel,
    selectV7Protocol,
    v7DefaultModel: validV7Default,
    v7Selections,
  }
}
