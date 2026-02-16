import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Badge,
  Button,
  CollapsibleSection,
  Heading5,
  SearchableSelect,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { ProbeStatusBadge } from "~/components/VerifyApiDialog/ProbeStatusBadge"
import {
  formatLatency,
  safeJsonStringify,
} from "~/components/VerifyApiDialog/utils"
import {
  API_TYPES,
  getApiVerificationProbeDefinitions,
  runApiVerificationProbe,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/aiApiVerification/utils"
import { fetchAnthropicModelIds } from "~/services/apiService/anthropic"
import { fetchGoogleModelIds } from "~/services/apiService/google"
import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to API credential profile verification dialog.
 */
const logger = createLogger("VerifyApiCredentialProfileDialog")

type ProbeItemState = {
  definition: { id: ApiVerificationProbeId; requiresModelId: boolean }
  isRunning: boolean
  attempts: number
  result: ApiVerificationProbeResult | null
}

interface VerifyApiCredentialProfileDialogProps {
  isOpen: boolean
  onClose: () => void
  profile: ApiCredentialProfile | null
}

type ModelsProbeOutput = {
  suggestedModelId?: string
  modelIdsPreview?: string[]
}

/**
 * Maps apiType values to the i18n key segment used by `aiApiVerification` labels.
 */
function apiTypeLabelKey(apiType: ApiVerificationApiType) {
  return apiType === API_TYPES.OPENAI_COMPATIBLE ? "openaiCompatible" : apiType
}

/**
 * Extract (limited) model suggestions from the `models` probe output.
 *
 * Notes:
 * - The probe intentionally provides a preview list (not a full enumeration) to
 *   avoid large payloads in UI state.
 */
function extractModelsProbeOutput(
  result: ApiVerificationProbeResult,
): ModelsProbeOutput | null {
  if (result.id !== "models") return null
  if (!result.output || typeof result.output !== "object") return null

  const output = result.output as Record<string, unknown>

  const suggestedModelId =
    typeof output.suggestedModelId === "string" &&
    output.suggestedModelId.trim()
      ? output.suggestedModelId.trim()
      : undefined

  const modelIdsPreview = Array.isArray(output.modelIdsPreview)
    ? output.modelIdsPreview
        .filter((id): id is string => typeof id === "string" && id.trim())
        .map((id) => id.trim())
    : undefined

  return { suggestedModelId, modelIdsPreview }
}

/**
 * Best-effort model id suggestion derived from returned model ids.
 */
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
      prefix === "o" ? /^o\\d/i.test(id) : lower.startsWith(prefix),
    )
  })

  return preferred ?? normalized[0]
}

/**
 * Initializes the per-probe UI state for a given API type.
 */
function buildProbeState(apiType: ApiVerificationApiType): ProbeItemState[] {
  const defs = getApiVerificationProbeDefinitions(apiType)
  return defs.map(
    (definition): ProbeItemState => ({
      definition,
      isRunning: false,
      attempts: 0,
      result: null,
    }),
  )
}

/**
 * Modal dialog that runs AI API verification probes using a stored profile's
 * baseUrl + apiKey (no SiteAccount required).
 */
export function VerifyApiCredentialProfileDialog({
  isOpen,
  onClose,
  profile,
}: VerifyApiCredentialProfileDialogProps) {
  const { t } = useTranslation(["aiApiVerification", "apiCredentialProfiles"])

  const [isRunning, setIsRunning] = useState(false)
  const [modelId, setModelId] = useState("")
  const [probes, setProbes] = useState<ProbeItemState[]>([])
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null)

  const fetchModelsRequestIdRef = useRef(0)

  const isAnyProbeRunning = probes.some((p) => p.isRunning)
  const canClose = !isRunning && !isAnyProbeRunning

  const hasAnyResult = probes.some((p) => p.result !== null)

  const header = useMemo(() => {
    if (!profile) return null
    return (
      <div className="min-w-0">
        <Heading5 className="truncate">
          {t("aiApiVerification:verifyDialog.title")}
        </Heading5>
        <div className="dark:text-dark-text-tertiary mt-1 truncate text-xs text-gray-500">
          {profile.baseUrl} · {profile.name}
        </div>
      </div>
    )
  }, [profile, t])

  const fetchModels = useCallback(async () => {
    if (!profile) return

    const requestId = (fetchModelsRequestIdRef.current += 1)
    setFetchModelsError(null)
    setIsFetchingModels(true)

    try {
      const modelIds = await (async () => {
        if (
          profile.apiType === API_TYPES.OPENAI_COMPATIBLE ||
          profile.apiType === API_TYPES.OPENAI
        ) {
          return fetchOpenAICompatibleModelIds({
            baseUrl: profile.baseUrl,
            apiKey: profile.apiKey,
          })
        }

        if (profile.apiType === API_TYPES.ANTHROPIC) {
          return fetchAnthropicModelIds({
            baseUrl: profile.baseUrl,
            apiKey: profile.apiKey,
          })
        }

        if (profile.apiType === API_TYPES.GOOGLE) {
          return fetchGoogleModelIds({
            baseUrl: profile.baseUrl,
            apiKey: profile.apiKey,
          })
        }

        throw new Error("Unsupported apiType")
      })()

      const normalized = Array.from(
        new Set(
          modelIds
            .filter((id) => typeof id === "string" && id.trim())
            .map((id) => id.trim()),
        ),
      )

      if (fetchModelsRequestIdRef.current !== requestId) return

      setModelOptions(normalized)
      const suggestedModelId = pickSuggestedModelId(profile.apiType, normalized)
      if (suggestedModelId) {
        setModelId((current) => (current.trim() ? current : suggestedModelId))
      }
    } catch (error) {
      const message = toSanitizedErrorSummary(error, [profile.apiKey])
      logger.error("Failed to fetch models", { message })

      if (fetchModelsRequestIdRef.current !== requestId) return

      setFetchModelsError(
        message || t("apiCredentialProfiles:verify.modelsFetchFailed"),
      )
    } finally {
      if (fetchModelsRequestIdRef.current === requestId) {
        setIsFetchingModels(false)
      }
    }
  }, [profile, t])

  useEffect(() => {
    if (!isOpen || !profile) return
    setModelId("")
    setModelOptions([])
    setFetchModelsError(null)
    setProbes(buildProbeState(profile.apiType))
    void fetchModels()
  }, [fetchModels, isOpen, profile])

  const runProbe = async (
    probeId: ApiVerificationProbeId,
    modelIdOverride?: string,
  ): Promise<ApiVerificationProbeResult | null> => {
    if (!profile) return null

    setProbes((prev) =>
      prev.map((p) =>
        p.definition.id === probeId
          ? { ...p, isRunning: true, attempts: p.attempts + 1 }
          : p,
      ),
    )

    try {
      const modelForProbe = (modelIdOverride ?? modelId).trim()
      const result = await runApiVerificationProbe({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        apiType: profile.apiType,
        modelId: modelForProbe || undefined,
        probeId,
      })

      setProbes((prev) =>
        prev.map((p) =>
          p.definition.id === probeId ? { ...p, isRunning: false, result } : p,
        ),
      )

      const modelsOutput = extractModelsProbeOutput(result)
      if (modelsOutput) {
        if (Array.isArray(modelsOutput.modelIdsPreview)) {
          setModelOptions((current) =>
            current.length > 0 ? current : modelsOutput.modelIdsPreview!,
          )
        }

        const suggested =
          modelsOutput.suggestedModelId ?? modelsOutput.modelIdsPreview?.[0]
        if (suggested) {
          // Avoid overriding user input while the probe is in-flight.
          setModelId((current) => (current.trim() ? current : suggested))
        }
      }

      return result
    } catch (error) {
      logger.error("Probe failed", {
        probeId,
        message: toSanitizedErrorSummary(error, [profile.apiKey]),
      })

      const fallback: ApiVerificationProbeResult = {
        id: probeId,
        status: "fail",
        latencyMs: 0,
        summary: t("aiApiVerification:verifyDialog.errors.unexpected"),
      }

      setProbes((prev) =>
        prev.map((p) => {
          if (p.definition.id !== probeId) return p
          return {
            ...p,
            isRunning: false,
            result: fallback,
          }
        }),
      )

      return fallback
    }
  }

  const runAll = async () => {
    if (!profile) return
    setIsRunning(true)
    setProbes((prev) =>
      prev.map((p) => ({ ...p, isRunning: false, attempts: 0, result: null })),
    )

    try {
      const ordered = getApiVerificationProbeDefinitions(profile.apiType)
      let modelIdForSuite = modelId.trim()

      for (const probe of ordered) {
        if (probe.id === "models") {
          const result = await runProbe("models")
          if (!modelIdForSuite && result) {
            const modelsOutput = extractModelsProbeOutput(result)
            const suggested =
              modelsOutput?.suggestedModelId ??
              modelsOutput?.modelIdsPreview?.[0]
            if (suggested) {
              modelIdForSuite = suggested
              setModelId((current) => (current.trim() ? current : suggested))
            }
          }
          continue
        }

        if (probe.requiresModelId && !modelIdForSuite) continue
        await runProbe(probe.id, modelIdForSuite)
      }
    } finally {
      setIsRunning(false)
    }
  }

  const footer = (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose} disabled={!canClose}>
        {t("aiApiVerification:verifyDialog.actions.close")}
      </Button>
      <Button
        variant="success"
        onClick={runAll}
        disabled={isRunning || isAnyProbeRunning || !profile}
      >
        {isRunning
          ? t("aiApiVerification:verifyDialog.actions.running")
          : t("aiApiVerification:verifyDialog.actions.run")}
      </Button>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={canClose ? onClose : () => {}}
      header={header}
      footer={footer}
      size="lg"
      closeOnEsc={canClose}
      closeOnBackdropClick={canClose}
    >
      {!profile ? null : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("aiApiVerification:verifyDialog.meta.apiType")}
              </div>
              <SearchableSelect
                options={[
                  {
                    value: profile.apiType,
                    label: t(
                      `aiApiVerification:verifyDialog.apiTypes.${apiTypeLabelKey(profile.apiType)}`,
                    ),
                  },
                ]}
                value={profile.apiType}
                onChange={() => {}}
                disabled={true}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("aiApiVerification:verifyDialog.meta.model")}
              </div>

              <SearchableSelect
                aria-label={t("aiApiVerification:verifyDialog.meta.model")}
                data-testid="profile-verify-model-id"
                options={modelOptions.map((id) => ({ value: id, label: id }))}
                value={modelId}
                onChange={setModelId}
                placeholder={
                  isFetchingModels
                    ? t("apiCredentialProfiles:verify.fetchingModels")
                    : t("apiCredentialProfiles:verify.modelPickerPlaceholder")
                }
                allowCustomValue
                disabled={!canClose}
              />

              {fetchModelsError ? (
                <div className="dark:text-dark-text-tertiary text-xs text-red-600">
                  {fetchModelsError}
                </div>
              ) : null}
            </div>
          </div>

          {!hasAnyResult && (
            <div className="dark:text-dark-text-secondary text-sm text-gray-600">
              {t("apiCredentialProfiles:verify.idleHint")}
            </div>
          )}

          <Alert variant="warning">
            <p>{t("aiApiVerification:verifyDialog.warning")}</p>
          </Alert>

          <div className="space-y-2">
            {probes.map((probe) => {
              const result = probe.result
              const isDisabledForModel =
                probe.definition.requiresModelId && !modelId.trim()

              const resultSummary = isDisabledForModel
                ? t("aiApiVerification:verifyDialog.requiresModelId")
                : result?.summaryKey
                  ? t(
                      `aiApiVerification:${result.summaryKey}`,
                      result.summaryParams,
                    )
                  : result?.status === "unsupported"
                    ? t(
                        "aiApiVerification:verifyDialog.unsupportedProbeForApiType",
                        {
                          probe: t(
                            `aiApiVerification:verifyDialog.probes.${probe.definition.id}`,
                          ),
                        },
                      )
                    : result
                      ? result.summary
                      : t("aiApiVerification:verifyDialog.notRunYet")

              return (
                <div
                  key={probe.definition.id}
                  data-testid={`profile-verify-probe-${probe.definition.id}`}
                  className="dark:border-dark-bg-tertiary rounded-md border border-gray-100 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="dark:text-dark-text-primary min-w-0 truncate text-sm font-medium text-gray-900">
                          {t(
                            `aiApiVerification:verifyDialog.probes.${probe.definition.id}`,
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {result ? (
                            <ProbeStatusBadge result={result} />
                          ) : (
                            <Badge variant="outline" size="sm">
                              {t(
                                "aiApiVerification:verifyDialog.status.pending",
                              )}
                            </Badge>
                          )}
                          <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                            {result ? formatLatency(result.latencyMs) : "-"}
                          </div>
                        </div>
                      </div>

                      <div className="dark:text-dark-text-secondary mt-1 text-xs text-gray-600">
                        {resultSummary}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => runProbe(probe.definition.id)}
                      disabled={
                        isRunning ||
                        probe.isRunning ||
                        isDisabledForModel ||
                        !profile
                      }
                    >
                      {probe.isRunning
                        ? t("aiApiVerification:verifyDialog.actions.running")
                        : probe.attempts > 0
                          ? t("aiApiVerification:verifyDialog.actions.retry")
                          : t("aiApiVerification:verifyDialog.actions.runOne")}
                    </Button>
                  </div>

                  {result &&
                    (result.input !== undefined ||
                      result.output !== undefined) && (
                      <div className="mt-3 space-y-2">
                        {result.input !== undefined && (
                          <CollapsibleSection
                            title={t(
                              "aiApiVerification:verifyDialog.details.input",
                            )}
                          >
                            <pre className="dark:text-dark-text-secondary overflow-auto text-xs break-words whitespace-pre-wrap text-gray-700">
                              {safeJsonStringify(result.input)}
                            </pre>
                          </CollapsibleSection>
                        )}
                        {result.output !== undefined && (
                          <CollapsibleSection
                            title={t(
                              "aiApiVerification:verifyDialog.details.output",
                            )}
                          >
                            <pre className="dark:text-dark-text-secondary overflow-auto text-xs break-words whitespace-pre-wrap text-gray-700">
                              {safeJsonStringify(result.output)}
                            </pre>
                          </CollapsibleSection>
                        )}
                      </div>
                    )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}
