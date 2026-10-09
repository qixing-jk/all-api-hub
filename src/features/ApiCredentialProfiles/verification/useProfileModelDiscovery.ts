import type { Dispatch, RefObject, SetStateAction } from "react"
import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import type { ProbeItemState } from "~/features/Verification/api/types"
import {
  fetchApiCredentialModelIds,
  normalizeApiCredentialModelIds,
} from "~/services/apiCredentialProfiles/modelCatalog"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("VerifyApiCredentialProfileDialog")
/** Choose a best-effort model suggestion for the selected protocol. */
function pickSuggestedModelId(
  apiType: ApiVerificationApiType,
  modelIds: string[],
): string | undefined {
  const normalized = modelIds
    .filter((id) => typeof id === "string" && id.trim())
    .map((id) => id.trim())

  if (normalized.length === 0) return undefined

  const preferredPrefixes = (() => {
    if (apiType === API_TYPES.GOOGLE) return ["gemini"]
    if (apiType === API_TYPES.ANTHROPIC) return ["claude"]
    return ["gpt", "o"]
  })()

  const preferred = normalized.find((id) => {
    const lower = id.toLowerCase()
    return preferredPrefixes.some((prefix) =>
      prefix === "o" ? /^o\d/i.test(id) : lower.startsWith(prefix),
    )
  })

  return preferred ?? normalized[0]
}

/** Discover models within the active profile and API-type request, discarding cancelled results. */
export function useProfileModelDiscovery({
  profile,
  setModelId,
  probesRef,
  apiTypeRef,
  preserveCurrentProbeStateForModel,
}: {
  profile: ApiCredentialProfile | null
  setModelId: Dispatch<SetStateAction<string>>
  probesRef: RefObject<ProbeItemState[]>
  apiTypeRef: RefObject<ApiVerificationApiType>
  preserveCurrentProbeStateForModel: (
    nextModelId: string,
    nextApiType: ApiVerificationApiType,
  ) => void
}) {
  const { t } = useTranslation(["aiApiVerification", "apiCredentialProfiles"])
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [fetchModelsDiagnostic, setFetchModelsDiagnostic] = useState<
    string | null
  >(null)
  const fetchModelsError =
    fetchModelsDiagnostic === null
      ? null
      : fetchModelsDiagnostic ||
        t("apiCredentialProfiles:verify.modelsFetchFailed")
  const fetchModelsRequestIdRef = useRef(0)
  const fetchModelsAbortControllerRef = useRef<AbortController | null>(null)
  const fetchModels = useCallback(
    async (nextApiType: ApiVerificationApiType) => {
      if (!profile) return

      const requestId = (fetchModelsRequestIdRef.current += 1)
      fetchModelsAbortControllerRef.current?.abort()
      const abortController = new AbortController()
      fetchModelsAbortControllerRef.current = abortController
      setFetchModelsDiagnostic(null)
      setIsFetchingModels(true)

      try {
        const normalized = normalizeApiCredentialModelIds(
          await fetchApiCredentialModelIds({
            apiType: nextApiType,
            baseUrl: profile.baseUrl,
            apiKey: profile.apiKey,
            requestHeaders: profile.requestHeaders,
            abortSignal: abortController.signal,
          }),
        )

        if (fetchModelsRequestIdRef.current !== requestId) return

        setModelOptions(normalized)
        const suggestedModelId = pickSuggestedModelId(nextApiType, normalized)
        if (suggestedModelId) {
          setModelId((current) => {
            if (current.trim()) return current

            const hasActiveProbeState = probesRef.current.some(
              (probe) => probe.isRunning || probe.result,
            )
            if (hasActiveProbeState && nextApiType === apiTypeRef.current) {
              preserveCurrentProbeStateForModel(suggestedModelId, nextApiType)
            }

            return suggestedModelId
          })
        }
      } catch (error) {
        if (
          abortController.signal.aborted ||
          fetchModelsRequestIdRef.current !== requestId
        ) {
          return
        }

        const message = toSanitizedErrorSummary(error, [
          profile.apiKey,
          ...Object.values(profile.requestHeaders ?? {}),
          profile.baseUrl,
        ])

        logger.error("Failed to fetch models", { message })

        if (fetchModelsRequestIdRef.current !== requestId) return

        setFetchModelsDiagnostic(message)
      } finally {
        if (fetchModelsAbortControllerRef.current === abortController) {
          fetchModelsAbortControllerRef.current = null
        }
        if (fetchModelsRequestIdRef.current === requestId) {
          setIsFetchingModels(false)
        }
      }
    },
    [
      preserveCurrentProbeStateForModel,
      profile,
      probesRef,
      apiTypeRef,
      setModelId,
    ],
  )

  const cancelModelDiscovery = useCallback(() => {
    fetchModelsAbortControllerRef.current?.abort()
    fetchModelsAbortControllerRef.current = null
  }, [])
  const resetModelDiscovery = useCallback(() => {
    setModelOptions([])
    setFetchModelsDiagnostic(null)
  }, [])
  return {
    modelOptions,
    setModelOptions,
    isFetchingModels,
    setFetchModelsDiagnostic,
    fetchModelsError,
    fetchModels,
    cancelModelDiscovery,
    resetModelDiscovery,
  }
}
