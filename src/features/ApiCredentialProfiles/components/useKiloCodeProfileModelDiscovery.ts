import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import type {
  KiloCodeDefaultModelSelection,
  KiloCodeProviderProtocol,
  KiloCodeRuntimeKeyExportInput,
  KiloCodeV7ProviderSelection,
  PreparedKiloCodeV7Catalog,
} from "~/services/integrations/kiloCodeExport"
import { KILO_CODE_PROVIDER_PROTOCOLS } from "~/services/integrations/kiloCodeExport"
import {
  normalizeKiloCodeModelIds,
  prepareKiloCodeV7Catalog,
} from "~/services/integrations/kiloCodeV7Catalog"
import { reconcileKiloCodeV7DefaultSelection } from "~/services/integrations/kiloCodeV7Selection"
import { createLogger } from "~/utils/core/logger"
import {
  coerceBaseUrlToPathSuffix,
  stripTrailingOpenAIV1,
} from "~/utils/core/url"

const logger = createLogger("KiloCodeProfileModelDiscovery")

export const KILO_CODE_MODEL_STATUSES = {
  Idle: "idle",
  Loading: "loading",
  Loaded: "loaded",
  Error: "error",
} as const

type KiloCodeModelStatus =
  (typeof KILO_CODE_MODEL_STATUSES)[keyof typeof KILO_CODE_MODEL_STATUSES]

interface PreparedSingleProfileCatalog {
  catalog?: PreparedKiloCodeV7Catalog
  invalidProfile: boolean
}

interface UseKiloCodeProfileModelDiscoveryOptions {
  isOpen: boolean
  profileName: string
  runtimeKey: KiloCodeRuntimeKeyExportInput
  selectionId: string
}

/** Normalize upstream model IDs once at the discovery boundary. */
/** Validate persisted profile facts before invoking the throwing catalog API. */
function hasInvalidRuntimeProfile(runtimeKey: KiloCodeRuntimeKeyExportInput) {
  if (!runtimeKey.tokenKey.trim()) return true

  try {
    const url = new URL(coerceBaseUrlToPathSuffix(runtimeKey.baseUrl, "/v1"))
    return url.protocol !== "http:" && url.protocol !== "https:"
  } catch {
    return true
  }
}

/** Convert catalog validation failures into controlled single-profile state. */
function prepareSingleProfileCatalog(
  selection: KiloCodeV7ProviderSelection,
): PreparedSingleProfileCatalog {
  if (hasInvalidRuntimeProfile(selection)) {
    return { invalidProfile: true }
  }
  if (
    !selection.discoveredModelIds.length &&
    !selection.manualModelId?.trim()
  ) {
    return { invalidProfile: false }
  }

  try {
    return {
      catalog: prepareKiloCodeV7Catalog([selection]),
      invalidProfile: false,
    }
  } catch {
    return { invalidProfile: true }
  }
}

/** Own model discovery and target-local model state for one profile export. */
export function useKiloCodeProfileModelDiscovery({
  isOpen,
  profileName,
  runtimeKey,
  selectionId,
}: UseKiloCodeProfileModelDiscoveryOptions) {
  const [legacyModelId, setLegacyModelId] = useState("")
  const [v7DefaultModelId, setV7DefaultModelId] = useState("")
  const [v7ManualModelId, setV7ManualModelId] = useState("")
  const [v7Protocol, setV7Protocol] = useState<KiloCodeProviderProtocol>(
    KILO_CODE_PROVIDER_PROTOCOLS.OpenAICompatible,
  )
  const [modelIds, setModelIds] = useState<string[]>([])
  const [modelStatus, setModelStatus] = useState<KiloCodeModelStatus>(
    KILO_CODE_MODEL_STATUSES.Idle,
  )
  const requestIdRef = useRef(0)
  const v7ManualModelIdRef = useRef("")
  const v7ProtocolRef = useRef<KiloCodeProviderProtocol>(
    KILO_CODE_PROVIDER_PROTOCOLS.OpenAICompatible,
  )
  const invalidRuntimeProfile = hasInvalidRuntimeProfile(runtimeKey)

  const buildV7Selection = useCallback(
    (
      discoveredModelIds: string[],
      manualModelId: string | undefined,
      protocol: KiloCodeProviderProtocol,
    ) => ({
      ...runtimeKey,
      selectionId,
      providerName: profileName,
      protocol,
      discoveredModelIds,
      manualModelId: manualModelId?.trim() || undefined,
    }),
    [profileName, runtimeKey, selectionId],
  )

  const loadModels = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setModelStatus(KILO_CODE_MODEL_STATUSES.Loading)

    try {
      const upstreamModelIds = await fetchOpenAICompatibleModelIds({
        baseUrl: stripTrailingOpenAIV1(runtimeKey.baseUrl),
        apiKey: runtimeKey.tokenKey,
      })
      const normalized = normalizeKiloCodeModelIds(upstreamModelIds ?? [])
      if (requestId !== requestIdRef.current) return

      setModelIds(normalized)
      setLegacyModelId((current) =>
        current.trim() ? current : normalized[0] ?? "",
      )
      setV7DefaultModelId((current) => {
        const prepared = prepareSingleProfileCatalog(
          buildV7Selection(
            normalized,
            v7ManualModelIdRef.current,
            v7ProtocolRef.current,
          ),
        )
        if (!prepared.catalog) return ""
        return (
          reconcileKiloCodeV7DefaultSelection(prepared.catalog, {
            selectionId,
            modelId: current,
          })?.modelId ?? ""
        )
      })
      setModelStatus(KILO_CODE_MODEL_STATUSES.Loaded)
    } catch (error) {
      logger.warn("Failed to fetch upstream model list", error)
      if (requestId !== requestIdRef.current) return
      setModelStatus(KILO_CODE_MODEL_STATUSES.Error)
    }
  }, [buildV7Selection, runtimeKey.baseUrl, runtimeKey.tokenKey, selectionId])

  useEffect(() => {
    if (!isOpen) {
      requestIdRef.current += 1
      return
    }

    setLegacyModelId("")
    setV7DefaultModelId("")
    setV7ManualModelId("")
    v7ManualModelIdRef.current = ""
    setV7Protocol(KILO_CODE_PROVIDER_PROTOCOLS.OpenAICompatible)
    v7ProtocolRef.current = KILO_CODE_PROVIDER_PROTOCOLS.OpenAICompatible
    setModelIds([])
    setModelStatus(KILO_CODE_MODEL_STATUSES.Idle)
    if (invalidRuntimeProfile) {
      setModelStatus(KILO_CODE_MODEL_STATUSES.Loaded)
      return () => {
        requestIdRef.current += 1
      }
    }
    void loadModels()

    return () => {
      requestIdRef.current += 1
    }
  }, [invalidRuntimeProfile, isOpen, loadModels])

  const v7Selection = useMemo<KiloCodeV7ProviderSelection>(
    () => buildV7Selection(modelIds, v7ManualModelId, v7Protocol),
    [buildV7Selection, modelIds, v7ManualModelId, v7Protocol],
  )
  const preparedV7 = useMemo(
    () => prepareSingleProfileCatalog(v7Selection),
    [v7Selection],
  )
  const validV7Default = useMemo<KiloCodeDefaultModelSelection | undefined>(
    () =>
      preparedV7.catalog
        ? reconcileKiloCodeV7DefaultSelection(preparedV7.catalog, {
            selectionId,
            modelId: v7DefaultModelId,
          })
        : undefined,
    [preparedV7.catalog, selectionId, v7DefaultModelId],
  )

  const selectV7Model = useCallback(
    (value: string) => {
      const normalized = value.trim()
      setV7DefaultModelId(normalized)
      if (normalized && !modelIds.includes(normalized)) {
        v7ManualModelIdRef.current = normalized
        setV7ManualModelId(normalized)
      }
    },
    [modelIds],
  )
  const selectLegacyModel = useCallback((value: string) => {
    setLegacyModelId(value)
  }, [])
  const selectV7Protocol = useCallback((protocol: KiloCodeProviderProtocol) => {
    v7ProtocolRef.current = protocol
    setV7Protocol(protocol)
  }, [])
  const removeManualModel = useCallback(() => {
    v7ManualModelIdRef.current = ""
    setV7ManualModelId("")
    setV7DefaultModelId((current) => {
      const prepared = prepareSingleProfileCatalog(
        buildV7Selection(modelIds, undefined, v7ProtocolRef.current),
      )
      if (!prepared.catalog) return ""
      return (
        reconcileKiloCodeV7DefaultSelection(prepared.catalog, {
          selectionId,
          modelId: current,
        })?.modelId ?? ""
      )
    })
  }, [buildV7Selection, modelIds, selectionId])

  return {
    invalidProfile: preparedV7.invalidProfile,
    legacyModelId,
    loadModels,
    modelIds,
    modelStatus,
    preparedV7ModelIds: preparedV7.catalog?.providers[0]?.modelIds ?? modelIds,
    removeManualModel,
    selectLegacyModel,
    selectV7Protocol,
    selectV7Model,
    v7DefaultModelId,
    v7ManualModelId,
    v7Protocol,
    v7Selection,
    validV7Default,
  }
}
