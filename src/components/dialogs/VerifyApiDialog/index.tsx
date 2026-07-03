import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { ProbeStatusBadge } from "~/components/dialogs/VerifyApiDialog/ProbeStatusBadge"
import { VerificationHistorySummary } from "~/components/dialogs/VerifyApiDialog/VerificationHistorySummary"
import {
  Alert,
  Badge,
  Button,
  CollapsibleSection,
  Heading5,
  Input,
  SearchableSelect,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import {
  collectAccountRuntimeKeySecrets,
  findDefaultSelectableAccountRuntimeKey,
  isAccountTokenRuntimeKey,
  isSelectableAccountRuntimeKey,
  sortAccountRuntimeKeysActiveFirst,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import {
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { identifyProvider } from "~/services/models/utils/modelProviders"
import { isTokenCompatibleWithModel } from "~/services/models/utils/tokenModelCompatibility"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  startProductAnalyticsAction,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsErrorCategoryFromProbeResult } from "~/services/productAnalytics/verification"
import {
  API_TYPES,
  getApiVerificationProbeDefinitions,
  guessModelIdFromToken,
  runApiVerificationProbe,
} from "~/services/verification/aiApiVerification"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationApiTypeLabel,
  getApiVerificationProbeLabel,
  translateApiVerificationSummary,
} from "~/services/verification/aiApiVerification/i18n"
import {
  buildSafeProbeFailureDiagnostics,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import {
  createAccountModelVerificationHistoryTarget,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import { createLogger } from "~/utils/core/logger"

import { buildProbeState } from "./probeState"
import type { VerifyApiDialogProps } from "./types"
import { useVerificationDialogState } from "./useVerificationDialogState"
import { formatLatency, safeJsonStringify } from "./utils"

/**
 * Unified logger scoped to the API verification dialog.
 */
const logger = createLogger("VerifyApiDialog")

/**
 * Detects user-initiated cancellation across DOM and service-layer aborts.
 */
function isAbortError(error: unknown, abortSignal?: AbortSignal) {
  return (
    abortSignal?.aborted ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  )
}

/**
 * Keeps optional redaction values type-safe before sanitizing diagnostics.
 */
function filterRedactions(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value))
}

/**
 * Builds a synthetic result so interrupted probes render as stopped, not failed.
 */
function buildStoppedProbeResult(
  probeId: ApiVerificationProbeId,
): ApiVerificationProbeResult {
  return {
    id: probeId,
    status: "unsupported",
    latencyMs: 0,
    summary: "Stopped",
    summaryKey: "verifyDialog.summaries.stopped",
  }
}

/**
 * Applies model/group limits only to account-token runtime keys.
 */
function isRuntimeKeyCompatibleWithModel(
  runtimeKey: AccountRuntimeKey,
  options: {
    hasModelGroupContext: boolean
    requestedModelId: string
    modelEnableGroups: VerifyApiDialogProps["modelEnableGroups"]
  },
) {
  if (!isSelectableAccountRuntimeKey(runtimeKey)) return false
  if (!options.hasModelGroupContext) return true
  if (!isAccountTokenRuntimeKey(runtimeKey)) return true
  return isTokenCompatibleWithModel(runtimeKey.token, {
    id: options.requestedModelId,
    enableGroups: options.modelEnableGroups,
  })
}

/**
 * Modal dialog that runs API verification for a selected runtime key + model.
 */
export function VerifyApiDialog(props: VerifyApiDialogProps) {
  const {
    isOpen,
    onClose,
    account,
    initialModelId,
    modelEnableGroups,
    onManageModelKey,
  } = props
  const { t } = useTranslation("aiApiVerification")

  const [isRunning, setIsRunning] = useState(false)
  const [isLoadingRuntimeKeys, setIsLoadingRuntimeKeys] = useState(false)
  const [accountRuntimeKeys, setAccountRuntimeKeys] = useState<
    AccountRuntimeKey[]
  >([])
  const [selectedRuntimeKeyId, setSelectedRuntimeKeyId] = useState<string>("")
  const [apiType, setApiType] = useState<ApiVerificationApiType>(
    API_TYPES.OPENAI_COMPATIBLE,
  )
  const [modelId, setModelId] = useState<string>(initialModelId?.trim() ?? "")
  const shouldStopRef = useRef(false)
  const suiteAbortControllerRef = useRef<AbortController | null>(null)
  const probeAbortControllersRef = useRef(
    new Map<ApiVerificationProbeId, AbortController>(),
  )
  const historyTarget = useMemo(() => {
    const trimmedModelId = initialModelId?.trim()
    return trimmedModelId
      ? createAccountModelVerificationHistoryTarget(account.id, trimmedModelId)
      : null
  }, [account.id, initialModelId])
  const {
    probes,
    setProbes: replaceProbes,
    probesRef,
    persistedSummary,
    setPersistedSummary: applyPersistedSummary,
    persistedSummaryRef,
    persistCurrentResults,
    loadVerificationHistory,
  } = useVerificationDialogState(historyTarget)

  const selectedRuntimeKey = accountRuntimeKeys.find(
    (runtimeKey) => runtimeKey.id === selectedRuntimeKeyId,
  )

  const requestedModelId = initialModelId?.trim() || modelId.trim()
  const hasModelGroupContext =
    requestedModelId.length > 0 && Array.isArray(modelEnableGroups)
  const compatibleRuntimeKeys = useMemo(() => {
    return accountRuntimeKeys.filter((runtimeKey) =>
      isRuntimeKeyCompatibleWithModel(runtimeKey, {
        hasModelGroupContext,
        requestedModelId,
        modelEnableGroups,
      }),
    )
  }, [
    accountRuntimeKeys,
    hasModelGroupContext,
    modelEnableGroups,
    requestedModelId,
  ])
  const compatibleRuntimeKeyIds = useMemo(
    () => new Set(compatibleRuntimeKeys.map((runtimeKey) => runtimeKey.id)),
    [compatibleRuntimeKeys],
  )
  const hasLoadedRuntimeKeys =
    !isLoadingRuntimeKeys && accountRuntimeKeys.length > 0
  const hasNoCompatibleRuntimeKey =
    hasModelGroupContext &&
    hasLoadedRuntimeKeys &&
    compatibleRuntimeKeys.length === 0
  const selectedRuntimeKeyIsCompatible =
    !selectedRuntimeKey || compatibleRuntimeKeyIds.has(selectedRuntimeKey.id)
  const hasIncompatibleSelectedRuntimeKey =
    hasModelGroupContext &&
    selectedRuntimeKey !== undefined &&
    !selectedRuntimeKeyIsCompatible
  const runtimeKeyCompatibilityHint = hasNoCompatibleRuntimeKey
    ? t("verifyDialog.noCompatibleRuntimeKeyHint")
    : hasIncompatibleSelectedRuntimeKey
      ? t("verifyDialog.selectedRuntimeKeyIncompatibleHint")
      : null

  const tokenModelHint = useMemo(() => {
    if (!selectedRuntimeKey || !isAccountTokenRuntimeKey(selectedRuntimeKey)) {
      return undefined
    }
    return guessModelIdFromToken({
      models: selectedRuntimeKey.token.models,
      model_limits: selectedRuntimeKey.token.model_limits,
    })
  }, [selectedRuntimeKey])

  const isAnyProbeRunning = probes.some((p) => p.isRunning)
  const canClose = !isRunning && !isAnyProbeRunning

  const hasAnyResult = probes.some((p) => p.result !== null)
  const analyticsContext = {
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelApi,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListRowActions,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  } as const

  const header = useMemo(() => {
    return (
      <div className="min-w-0">
        <Heading5 className="truncate">{t("verifyDialog.title")}</Heading5>
        <div className="dark:text-dark-text-tertiary mt-1 truncate text-xs text-gray-500">
          {account.baseUrl} · {account.name}
        </div>
      </div>
    )
  }, [account.baseUrl, account.name, t])

  const loadRuntimeKeys = async () => {
    setIsLoadingRuntimeKeys(true)
    try {
      const runtimeKeys = await fetchDisplayAccountRuntimeKeys(account)

      const sorted = sortAccountRuntimeKeysActiveFirst(runtimeKeys)

      setAccountRuntimeKeys(sorted)

      const defaultRuntimeKey = hasModelGroupContext
        ? sorted.find((runtimeKey) =>
            isRuntimeKeyCompatibleWithModel(runtimeKey, {
              hasModelGroupContext,
              requestedModelId,
              modelEnableGroups,
            }),
          ) ?? null
        : findDefaultSelectableAccountRuntimeKey(sorted)
      setSelectedRuntimeKeyId(defaultRuntimeKey ? defaultRuntimeKey.id : "")
    } catch (error) {
      logger.error("Failed to load runtime keys", {
        message: toSanitizedErrorSummary(
          error,
          filterRedactions([account.token, account.cookieAuthSessionCookie]),
        ),
      })
      setAccountRuntimeKeys([])
      setSelectedRuntimeKeyId("")
    } finally {
      setIsLoadingRuntimeKeys(false)
    }
  }

  const runProbe = async (
    probeId: ApiVerificationProbeId,
    abortSignal?: AbortSignal,
  ) => {
    if (abortSignal?.aborted || shouldStopRef.current) return null
    if (!selectedRuntimeKey || !selectedRuntimeKeyIsCompatible) return null
    let resolvedRuntimeKey = selectedRuntimeKey

    const pendingProbes = probesRef.current.map((probe) =>
      probe.definition.id === probeId
        ? { ...probe, isRunning: true, attempts: probe.attempts + 1 }
        : probe,
    )
    replaceProbes(pendingProbes)

    try {
      resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
        account,
        selectedRuntimeKey,
        { abortSignal },
      )
      if (abortSignal?.aborted || shouldStopRef.current) {
        replaceProbes(
          probesRef.current.map((probe) =>
            probe.definition.id === probeId
              ? {
                  ...probe,
                  isRunning: false,
                  result: buildStoppedProbeResult(probeId),
                }
              : probe,
          ),
        )
        return null
      }
      const result = await runApiVerificationProbe({
        baseUrl: resolvedRuntimeKey.baseUrl,
        apiKey: resolvedRuntimeKey.secret,
        apiType,
        modelId: modelId.trim() || undefined,
        tokenMeta: isAccountTokenRuntimeKey(resolvedRuntimeKey)
          ? {
              id: resolvedRuntimeKey.token.id,
              name: resolvedRuntimeKey.token.name,
              model_limits: resolvedRuntimeKey.token.model_limits,
              models: resolvedRuntimeKey.token.models,
            }
          : undefined,
        probeId,
        abortSignal,
      })

      if (abortSignal?.aborted || shouldStopRef.current) {
        replaceProbes(
          probesRef.current.map((probe) =>
            probe.definition.id === probeId
              ? {
                  ...probe,
                  isRunning: false,
                  result: buildStoppedProbeResult(probeId),
                }
              : probe,
          ),
        )
        return null
      }

      const nextProbes = probesRef.current.map((probe) =>
        probe.definition.id === probeId
          ? { ...probe, isRunning: false, result }
          : probe,
      )
      replaceProbes(nextProbes)
      await persistCurrentResults(
        apiType,
        nextProbes,
        modelId.trim() || tokenModelHint || initialModelId?.trim(),
      )
      return result
    } catch (error) {
      if (isAbortError(error, abortSignal) || shouldStopRef.current) {
        replaceProbes(
          probesRef.current.map((probe) =>
            probe.definition.id === probeId
              ? {
                  ...probe,
                  isRunning: false,
                  result: buildStoppedProbeResult(probeId),
                }
              : probe,
          ),
        )
        return null
      }

      const sanitizedMessage = toSanitizedErrorSummary(
        error,
        filterRedactions([
          account.token,
          account.cookieAuthSessionCookie,
          ...collectAccountRuntimeKeySecrets([
            selectedRuntimeKey,
            resolvedRuntimeKey,
          ]),
        ]),
      )
      logger.error("Probe failed", {
        probeId,
        message: sanitizedMessage,
      })

      const fallback: ApiVerificationProbeResult = {
        id: probeId,
        status: "fail",
        latencyMs: 0,
        summary: t("verifyDialog.errors.unexpected"),
        ...buildSafeProbeFailureDiagnostics(error, sanitizedMessage),
      }
      const nextProbes = probesRef.current.map((probe) => {
        if (probe.definition.id !== probeId) return probe
        return {
          ...probe,
          isRunning: false,
          // Surface a generic message to avoid leaking provider error details.
          result: fallback,
        }
      })
      replaceProbes(nextProbes)
      await persistCurrentResults(
        apiType,
        nextProbes,
        modelId.trim() || tokenModelHint || initialModelId?.trim(),
      )
      return fallback
    }
  }

  const clearHistory = async () => {
    if (!historyTarget) return
    await verificationResultHistoryStorage.clearTarget(historyTarget)
    applyPersistedSummary(null)
    replaceProbes(buildProbeState(apiType))
  }

  // The suite can always run the models probe without a model id.
  const canRunAll = !!selectedRuntimeKey && selectedRuntimeKeyIsCompatible

  const runAll = async () => {
    if (!canRunAll) return

    shouldStopRef.current = false
    const abortController = new AbortController()
    suiteAbortControllerRef.current = abortController
    const tracker = startProductAnalyticsAction(analyticsContext)
    let successCount = 0
    let failureCount = 0
    let hasExecutedProbe = false
    let failedProbeResult: ApiVerificationProbeResult | undefined
    setIsRunning(true)
    replaceProbes(buildProbeState(apiType))
    try {
      // Run sequentially so each probe updates independently (and can be retried individually).
      const ordered = getApiVerificationProbeDefinitions(apiType)
      for (const probe of ordered) {
        if (shouldStopRef.current || abortController.signal.aborted) break
        if (probe.requiresModelId && !modelId.trim() && !tokenModelHint)
          continue

        const result = await runProbe(probe.id, abortController.signal)
        if (!result) continue
        if (result.status === "pass") {
          hasExecutedProbe = true
          successCount += 1
        } else if (result.status === "fail") {
          hasExecutedProbe = true
          failureCount += 1
          failedProbeResult ??= result
        }
      }
      if (shouldStopRef.current || abortController.signal.aborted) {
        replaceProbes(
          probesRef.current.map((probe) =>
            probe.result
              ? { ...probe, isRunning: false }
              : {
                  ...probe,
                  isRunning: false,
                  result: buildStoppedProbeResult(probe.definition.id),
                },
          ),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
          insights: {
            successCount,
            failureCount,
          },
        })
        return
      }

      const completionResult =
        failureCount > 0
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : hasExecutedProbe
            ? PRODUCT_ANALYTICS_RESULTS.Success
            : PRODUCT_ANALYTICS_RESULTS.Skipped
      tracker.complete(completionResult, {
        ...(completionResult === PRODUCT_ANALYTICS_RESULTS.Failure
          ? {
              errorCategory:
                resolveProductAnalyticsErrorCategoryFromProbeResult(
                  failedProbeResult,
                ),
            }
          : {}),
        insights: {
          ...(completionResult === PRODUCT_ANALYTICS_RESULTS.Failure
            ? { failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute }
            : {}),
          successCount,
          failureCount,
        },
      })
    } catch (error) {
      logger.error("Model verification run failed", {
        message: toSanitizedErrorSummary(error, []),
      })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: resolveProductAnalyticsErrorCategoryFromError(error),
        insights: {
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
          successCount,
          failureCount,
        },
      })
    } finally {
      if (suiteAbortControllerRef.current === abortController) {
        suiteAbortControllerRef.current = null
      }
      setIsRunning(false)
    }
  }

  const stopRun = () => {
    shouldStopRef.current = true
    suiteAbortControllerRef.current?.abort()
  }

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    const trimmedModelId = initialModelId?.trim() ?? ""
    shouldStopRef.current = false
    suiteAbortControllerRef.current?.abort()
    suiteAbortControllerRef.current = null
    probeAbortControllersRef.current.forEach((controller) => controller.abort())
    probeAbortControllersRef.current.clear()
    setAccountRuntimeKeys([])
    setSelectedRuntimeKeyId("")
    setModelId(trimmedModelId)
    applyPersistedSummary(null)

    const providerType = trimmedModelId
      ? identifyProvider(trimmedModelId)
      : null

    // Map detected provider to the closest verification API type.
    const initialApiType: ApiVerificationApiType =
      providerType === "Claude"
        ? API_TYPES.ANTHROPIC
        : providerType === "Gemini"
          ? API_TYPES.GOOGLE
          : API_TYPES.OPENAI_COMPATIBLE

    setApiType(initialApiType)
    replaceProbes(buildProbeState(initialApiType))

    void loadVerificationHistory({
      apiType: initialApiType,
      isCancelled: () => cancelled,
      onResolvedModelId: (resolvedModelId) => {
        setModelId((current) => current.trim() || resolvedModelId)
      },
    })

    void loadRuntimeKeys()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, historyTarget, initialModelId, isOpen])

  useEffect(() => {
    if (!isOpen) return
    replaceProbes(
      buildProbeState(
        apiType,
        apiType === persistedSummaryRef.current?.apiType
          ? persistedSummaryRef.current
          : null,
      ),
      false,
    )
  }, [apiType, isOpen, persistedSummaryRef, replaceProbes])

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {historyTarget ? (
          <Button variant="outline" onClick={clearHistory} disabled={!canClose}>
            {t("verifyDialog.history.clear")}
          </Button>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={!canClose}>
          {t("verifyDialog.actions.close")}
        </Button>
        <Button
          variant={isRunning ? "destructive" : "success"}
          onClick={isRunning ? stopRun : runAll}
          disabled={!isRunning && (isLoadingRuntimeKeys || !canRunAll)}
        >
          {isRunning
            ? t("verifyDialog.actions.stop")
            : t("verifyDialog.actions.run")}
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
      <div className="space-y-3">
        {historyTarget ? (
          <div className="dark:border-dark-bg-tertiary flex flex-wrap items-center gap-2 rounded-md border border-gray-100 p-3 text-sm">
            <VerificationHistorySummary summary={persistedSummary} />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {t("verifyDialog.meta.runtimeKey")}
            </div>
            <SearchableSelect
              options={[
                {
                  value: "",
                  label: t("verifyDialog.meta.runtimeKeyPlaceholder"),
                },
                ...accountRuntimeKeys.map((runtimeKey) => {
                  const isCompatible = compatibleRuntimeKeyIds.has(
                    runtimeKey.id,
                  )
                  return {
                    value: runtimeKey.id,
                    label: runtimeKey.label,
                    disabled: !isCompatible,
                    suffix: isCompatible ? undefined : (
                      <span className="text-xs text-gray-400">
                        {t("verifyDialog.meta.runtimeKeyIncompatible")}
                      </span>
                    ),
                  }
                }),
              ]}
              value={selectedRuntimeKeyId}
              onChange={setSelectedRuntimeKeyId}
              disabled={isLoadingRuntimeKeys}
              placeholder={t("verifyDialog.meta.runtimeKeyPlaceholder")}
            />
            {runtimeKeyCompatibilityHint ? (
              <div className="space-y-1.5">
                <div className="text-xs text-red-500" role="alert">
                  {runtimeKeyCompatibilityHint}
                </div>
                {onManageModelKey ? (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0 py-0 text-xs"
                    onClick={onManageModelKey}
                  >
                    {t("verifyDialog.actions.manageModelKey")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {t("verifyDialog.meta.apiType")}
            </div>
            <SearchableSelect
              options={[
                // Keep a fixed display order for the supported API types.
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
                  label: getApiVerificationApiTypeLabel(t, API_TYPES.ANTHROPIC),
                },
                {
                  value: API_TYPES.GOOGLE,
                  label: getApiVerificationApiTypeLabel(t, API_TYPES.GOOGLE),
                },
              ]}
              value={apiType}
              onChange={(value) => setApiType(value as ApiVerificationApiType)}
              disabled={isRunning}
              placeholder={t("verifyDialog.meta.apiTypePlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {t("verifyDialog.meta.model")}
            </div>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={t("verifyDialog.meta.modelPlaceholder")}
              disabled={isRunning}
            />
          </div>
        </div>

        {!hasAnyResult && (
          <div className="dark:text-dark-text-secondary text-sm text-gray-600">
            {isLoadingRuntimeKeys
              ? t("verifyDialog.loadingRuntimeKeysHint")
              : t("verifyDialog.idleHint")}
          </div>
        )}

        <Alert variant="warning">
          <p>{t("verifyDialog.warning")}</p>
        </Alert>

        <div className="space-y-2">
          {probes.map((probe) => {
            const result = probe.result
            const isDisabledForModel =
              probe.definition.requiresModelId &&
              !modelId.trim() &&
              !tokenModelHint
            const stopProbe = () => {
              probeAbortControllersRef.current.get(probe.definition.id)?.abort()
            }
            const runSingleProbe = () => {
              const abortController = new AbortController()
              probeAbortControllersRef.current.set(
                probe.definition.id,
                abortController,
              )
              shouldStopRef.current = false
              void runProbe(
                probe.definition.id,
                abortController.signal,
              ).finally(() => {
                if (
                  probeAbortControllersRef.current.get(probe.definition.id) ===
                  abortController
                ) {
                  probeAbortControllersRef.current.delete(probe.definition.id)
                }
              })
            }

            const resultSummary = isDisabledForModel
              ? t("verifyDialog.requiresModelId")
              : result?.summaryKey
                ? translateApiVerificationSummary(
                    t,
                    result.summaryKey,
                    result.summaryParams,
                  ) ?? result.summary
                : result?.status === "unsupported"
                  ? t("verifyDialog.unsupportedProbeForApiType", {
                      probe: getApiVerificationProbeLabel(
                        t,
                        probe.definition.id,
                      ),
                    })
                  : result
                    ? result.summary
                    : t("verifyDialog.notRunYet")
            return (
              <div
                key={probe.definition.id}
                data-testid={`verify-probe-${probe.definition.id}`}
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
                            {t("verifyDialog.status.pending")}
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
                    variant={probe.isRunning ? "destructive" : "secondary"}
                    onClick={probe.isRunning ? stopProbe : runSingleProbe}
                    aria-label={
                      probe.isRunning
                        ? t("verifyDialog.actions.stopProbe", {
                            probe: getApiVerificationProbeLabel(
                              t,
                              probe.definition.id,
                            ),
                          })
                        : undefined
                    }
                    disabled={
                      isRunning ||
                      isLoadingRuntimeKeys ||
                      (!probe.isRunning &&
                        (!selectedRuntimeKey ||
                          !selectedRuntimeKeyIsCompatible ||
                          isDisabledForModel))
                    }
                  >
                    {probe.isRunning
                      ? t("verifyDialog.actions.stop")
                      : probe.attempts > 0
                        ? t("verifyDialog.actions.retry")
                        : t("verifyDialog.actions.runOne")}
                  </Button>
                </div>

                {result &&
                  (result.input !== undefined ||
                    result.output !== undefined) && (
                    <div className="mt-3 space-y-2">
                      {result.input !== undefined && (
                        <CollapsibleSection
                          title={t("verifyDialog.details.input")}
                        >
                          <pre className="dark:text-dark-text-secondary overflow-auto text-xs break-words whitespace-pre-wrap text-gray-700">
                            {safeJsonStringify(result.input)}
                          </pre>
                        </CollapsibleSection>
                      )}
                      {result.output !== undefined && (
                        <CollapsibleSection
                          title={t("verifyDialog.details.output")}
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
    </Modal>
  )
}
