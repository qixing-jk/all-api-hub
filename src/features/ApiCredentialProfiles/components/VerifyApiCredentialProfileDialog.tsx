import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { buildProbeState } from "~/components/dialogs/VerifyApiDialog/probeState"
import { ProbeStatusBadge } from "~/components/dialogs/VerifyApiDialog/ProbeStatusBadge"
import { useVerificationDialogState } from "~/components/dialogs/VerifyApiDialog/useVerificationDialogState"
import {
  formatLatency,
  safeJsonStringify,
} from "~/components/dialogs/VerifyApiDialog/utils"
import { VerificationStatusBadge } from "~/components/dialogs/VerifyApiDialog/VerificationStatusBadge"
import {
  Alert,
  Badge,
  Button,
  CollapsibleSection,
  Heading5,
  SearchableSelect,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import {
  fetchApiCredentialModelIds,
  normalizeApiCredentialModelIds,
} from "~/services/apiCredentialProfiles/modelCatalog"
import {
  API_TYPES,
  getApiVerificationProbeDefinitions,
  runApiVerificationProbe,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationApiTypeLabel,
  getApiVerificationProbeLabel,
  translateApiVerificationSummary,
} from "~/services/verification/aiApiVerification/i18n"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import {
  createProfileModelVerificationHistoryTarget,
  createProfileVerificationHistoryTarget,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { formatLocaleDateTime } from "~/utils/core/formatters"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to API credential profile verification dialog.
 */
const logger = createLogger("VerifyApiCredentialProfileDialog")

interface VerifyApiCredentialProfileDialogProps {
  isOpen: boolean
  onClose: () => void
  profile: ApiCredentialProfile | null
  initialModelId?: string
}

type ModelsProbeOutput = {
  suggestedModelId?: string
  modelIdsPreview?: string[]
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
        .filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
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
      prefix === "o" ? /^o\d/i.test(id) : lower.startsWith(prefix),
    )
  })

  return preferred ?? normalized[0]
}

/**
 * Modal dialog that runs AI API verification probes using a stored profile's
 * baseUrl + apiKey (no SiteAccount required).
 */
export function VerifyApiCredentialProfileDialog({
  isOpen,
  onClose,
  profile,
  initialModelId,
}: VerifyApiCredentialProfileDialogProps) {
  const { t } = useTranslation(["aiApiVerification", "apiCredentialProfiles"])

  const [isRunning, setIsRunning] = useState(false)
  const [apiType, setApiType] = useState<ApiVerificationApiType>(
    profile?.apiType ?? API_TYPES.OPENAI_COMPATIBLE,
  )
  const [modelId, setModelId] = useState("")
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null)

  const fetchModelsRequestIdRef = useRef(0)
  const historyTarget = useMemo(() => {
    if (!profile) return null

    const trimmedModelId = initialModelId?.trim()
    return trimmedModelId
      ? createProfileModelVerificationHistoryTarget(profile.id, trimmedModelId)
      : createProfileVerificationHistoryTarget(profile.id)
  }, [initialModelId, profile])
  const {
    probes,
    setProbes: replaceProbes,
    probesRef,
    persistedSummary,
    setPersistedSummary,
    persistCurrentResults,
    loadVerificationHistory,
  } = useVerificationDialogState(historyTarget)

  const isAnyProbeRunning = probes.some((p) => p.isRunning)
  const canClose = !isRunning && !isAnyProbeRunning

  const hasAnyResult = probes.some((p) => p.result !== null)
  const hasApiTypeOverride = Boolean(profile && apiType !== profile.apiType)
  const savedApiTypeLabel = profile
    ? getApiVerificationApiTypeLabel(t, profile.apiType)
    : ""
  const currentApiTypeLabel = getApiVerificationApiTypeLabel(t, apiType)

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

  const fetchModels = useCallback(
    async (nextApiType: ApiVerificationApiType) => {
      if (!profile) return

      const requestId = (fetchModelsRequestIdRef.current += 1)
      setFetchModelsError(null)
      setIsFetchingModels(true)

      try {
        const normalized = normalizeApiCredentialModelIds(
          await fetchApiCredentialModelIds({
            apiType: nextApiType,
            baseUrl: profile.baseUrl,
            apiKey: profile.apiKey,
          }),
        )

        if (fetchModelsRequestIdRef.current !== requestId) return

        setModelOptions(normalized)
        const suggestedModelId = pickSuggestedModelId(nextApiType, normalized)
        if (suggestedModelId) {
          setModelId((current) => (current.trim() ? current : suggestedModelId))
        }
      } catch (error) {
        const message =
          toSanitizedErrorSummary(error, [profile.apiKey, profile.baseUrl]) ||
          t("apiCredentialProfiles:verify.modelsFetchFailed")

        logger.error("Failed to fetch models", { message })

        if (fetchModelsRequestIdRef.current !== requestId) return

        setFetchModelsError(message)
      } finally {
        if (fetchModelsRequestIdRef.current === requestId) {
          setIsFetchingModels(false)
        }
      }
    },
    [profile, t],
  )

  useEffect(() => {
    if (!isOpen || !profile) return

    let cancelled = false
    const nextApiType = profile.apiType
    const nextModelId = initialModelId?.trim() ?? ""

    setApiType(nextApiType)
    setModelId(nextModelId)
    setModelOptions([])
    setFetchModelsError(null)
    setPersistedSummary(null)
    replaceProbes(buildProbeState(nextApiType))

    void loadVerificationHistory({
      apiType: nextApiType,
      isCancelled: () => cancelled,
      onResolvedModelId: (resolvedModelId) => {
        setModelId((current) => current.trim() || resolvedModelId)
      },
      shouldApplySummaryToProbes: (summary) => summary.apiType === nextApiType,
    })

    void fetchModels(nextApiType)

    return () => {
      cancelled = true
    }
  }, [
    fetchModels,
    historyTarget,
    initialModelId,
    isOpen,
    loadVerificationHistory,
    profile,
    replaceProbes,
    setPersistedSummary,
  ])

  const runProbe = async (
    probeId: ApiVerificationProbeId,
    modelIdOverride?: string,
  ): Promise<ApiVerificationProbeResult | null> => {
    if (!profile) return null

    const pendingProbes = probesRef.current.map((probe) =>
      probe.definition.id === probeId
        ? { ...probe, isRunning: true, attempts: probe.attempts + 1 }
        : probe,
    )
    replaceProbes(pendingProbes)

    try {
      const modelForProbe = (modelIdOverride ?? modelId).trim()
      const result = await runApiVerificationProbe({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        apiType,
        modelId: modelForProbe || undefined,
        probeId,
      })

      const nextProbes = probesRef.current.map((probe) =>
        probe.definition.id === probeId
          ? { ...probe, isRunning: false, result }
          : probe,
      )
      replaceProbes(nextProbes)

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

      await persistCurrentResults(
        apiType,
        nextProbes,
        modelForProbe || initialModelId?.trim(),
      )

      return result
    } catch (error) {
      logger.error("Probe failed", {
        probeId,
        message: toSanitizedErrorSummary(error, [
          profile.apiKey,
          profile.baseUrl,
        ]),
      })

      const fallback: ApiVerificationProbeResult = {
        id: probeId,
        status: "fail",
        latencyMs: 0,
        summary: t("aiApiVerification:verifyDialog.errors.unexpected"),
      }

      const nextProbes = probesRef.current.map((probe) => {
        if (probe.definition.id !== probeId) return probe
        return {
          ...probe,
          isRunning: false,
          result: fallback,
        }
      })
      replaceProbes(nextProbes)
      await persistCurrentResults(
        apiType,
        nextProbes,
        (modelIdOverride ?? modelId).trim() || initialModelId?.trim(),
      )

      return fallback
    }
  }

  const clearHistory = async () => {
    if (!historyTarget) return
    await verificationResultHistoryStorage.clearTarget(historyTarget)
    setPersistedSummary(null)
    replaceProbes(buildProbeState(apiType))
  }

  const runAll = async () => {
    if (!profile) return
    setIsRunning(true)
    replaceProbes(buildProbeState(apiType))

    try {
      const ordered = getApiVerificationProbeDefinitions(apiType)
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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {historyTarget ? (
          <Button variant="outline" onClick={clearHistory} disabled={!canClose}>
            {t("aiApiVerification:verifyDialog.history.clear")}
          </Button>
        ) : null}
      </div>
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
          {historyTarget ? (
            <div className="dark:border-dark-bg-tertiary flex flex-wrap items-center gap-2 rounded-md border border-gray-100 p-3 text-sm">
              <span className="dark:text-dark-text-tertiary text-gray-500">
                {t("aiApiVerification:verifyDialog.history.lastVerified")}
              </span>
              <VerificationStatusBadge
                status={persistedSummary?.status ?? "unverified"}
              />
              <span className="dark:text-dark-text-secondary text-gray-600">
                {persistedSummary
                  ? formatLocaleDateTime(persistedSummary.verifiedAt)
                  : t("aiApiVerification:verifyDialog.history.unverified")}
              </span>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <div className="flex min-h-7 items-center gap-2">
                <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                  {t("aiApiVerification:verifyDialog.meta.apiType")}
                </div>
                {hasApiTypeOverride ? (
                  <Badge variant="warning" size="sm">
                    {t("apiCredentialProfiles:verify.override.badge")}
                  </Badge>
                ) : null}
              </div>
              <SearchableSelect
                options={[
                  {
                    value: API_TYPES.OPENAI_COMPATIBLE,
                    label: getApiVerificationApiTypeLabel(
                      t,
                      API_TYPES.OPENAI_COMPATIBLE,
                    ),
                  },
                  {
                    value: API_TYPES.OPENAI,
                    label: getApiVerificationApiTypeLabel(t, API_TYPES.OPENAI),
                  },
                  {
                    value: API_TYPES.ANTHROPIC,
                    label: getApiVerificationApiTypeLabel(
                      t,
                      API_TYPES.ANTHROPIC,
                    ),
                  },
                  {
                    value: API_TYPES.GOOGLE,
                    label: getApiVerificationApiTypeLabel(t, API_TYPES.GOOGLE),
                  },
                ]}
                value={apiType}
                onChange={(value) => {
                  const nextApiType = value as ApiVerificationApiType
                  setApiType(nextApiType)
                  setModelOptions([])
                  setFetchModelsError(null)
                  replaceProbes(
                    buildProbeState(
                      nextApiType,
                      persistedSummary?.apiType === nextApiType
                        ? persistedSummary
                        : null,
                    ),
                  )
                  void fetchModels(nextApiType)
                }}
                disabled={!canClose}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex min-h-7 items-center">
                <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                  {t("aiApiVerification:verifyDialog.meta.model")}
                </div>
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

          {hasApiTypeOverride ? (
            <Alert
              variant="warning"
              title={t("apiCredentialProfiles:verify.override.title")}
              description={t(
                "apiCredentialProfiles:verify.override.description",
                {
                  savedApiType: savedApiTypeLabel,
                  currentApiType: currentApiTypeLabel,
                },
              )}
            />
          ) : null}

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
                  ? (translateApiVerificationSummary(
                      t,
                      result.summaryKey,
                      result.summaryParams,
                    ) ?? result.summary)
                  : result?.status === "unsupported"
                    ? t(
                        "aiApiVerification:verifyDialog.unsupportedProbeForApiType",
                        {
                          probe: getApiVerificationProbeLabel(
                            t,
                            probe.definition.id,
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
                          {getApiVerificationProbeLabel(t, probe.definition.id)}
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
