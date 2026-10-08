import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  collectAccountRuntimeKeySecrets,
  findDefaultSelectableAccountRuntimeKey,
  isAccountRuntimeKeyCompatibleWithModel,
  isSelectableAccountRuntimeKey,
  sortAccountRuntimeKeysActiveFirst,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import {
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { identifyProvider } from "~/services/models/utils/modelProviders"
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
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  API_TYPES,
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  getApiVerificationProbeDefinitions,
  runApiVerificationProbe,
} from "~/services/verification/aiApiVerification"
import {
  buildSafeProbeFailureDiagnostics,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import {
  createAccountModelVerificationHistoryTarget,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import { createLogger } from "~/utils/core/logger"

import {
  filterVerificationRedactions as filterRedactions,
  isVerificationAbortError as isAbortError,
} from "../verificationDialogUtils"
import {
  buildProbeState,
  withStoppedProbe,
  withUnfinishedProbesStopped,
} from "./probeState"
import type { VerifyApiDialogProps } from "./types"
import { useVerificationDialogState } from "./useVerificationDialogState"

/**
 * Unified logger scoped to the API verification dialog.
 */
const logger = createLogger("VerifyApiDialog")

/**
 * Applies model/group context to the owner-projected runtime-key policy.
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
  return isAccountRuntimeKeyCompatibleWithModel(runtimeKey, {
    id: options.requestedModelId,
    enableGroups: options.modelEnableGroups,
  })
}

/**
 * Owns runtime-key preparation and verification runs while reusing history state.
 */
export function useVerifyApiDialogViewModel({
  isOpen,
  account,
  initialModelId,
  modelEnableGroups,
}: Pick<
  VerifyApiDialogProps,
  "isOpen" | "account" | "initialModelId" | "modelEnableGroups"
>) {
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
  const [verificationMode, setVerificationMode] = useState<ApiVerificationMode>(
    API_VERIFICATION_MODES.Streaming,
  )
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

  const tokenModelHint = selectedRuntimeKey?.modelAccess.suggestedModelIds[0]

  const isAnyProbeRunning = probes.some((p) => p.isRunning)
  const canClose = !isRunning && !isAnyProbeRunning

  const hasAnyResult = probes.some((p) => p.result !== null)
  const analyticsContext = {
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelApi,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListRowActions,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  } as const

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
    let executedMode: ApiVerificationMode | undefined

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
        replaceProbes(withStoppedProbe(probesRef.current, probeId))
        return null
      }
      executedMode = verificationMode
      const result = await runApiVerificationProbe({
        baseUrl: resolvedRuntimeKey.baseUrl,
        apiKey: resolvedRuntimeKey.secret,
        apiType,
        mode: executedMode,
        modelId: modelId.trim() || undefined,
        fallbackModelId: resolvedRuntimeKey.modelAccess.suggestedModelIds[0],
        probeId,
        abortSignal,
      })

      if (abortSignal?.aborted || shouldStopRef.current) {
        replaceProbes(
          withStoppedProbe(probesRef.current, probeId, executedMode),
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
          withStoppedProbe(probesRef.current, probeId, executedMode),
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
        mode:
          probeId === API_VERIFICATION_PROBE_IDS.Models
            ? undefined
            : verificationMode,
        status: API_VERIFICATION_PROBE_STATUSES.Fail,
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
        if (result.status === API_VERIFICATION_PROBE_STATUSES.Pass) {
          hasExecutedProbe = true
          successCount += 1
        } else if (result.status === API_VERIFICATION_PROBE_STATUSES.Fail) {
          hasExecutedProbe = true
          failureCount += 1
          failedProbeResult ??= result
        }
      }
      if (shouldStopRef.current || abortController.signal.aborted) {
        replaceProbes(withUnfinishedProbesStopped(probesRef.current))
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
    setVerificationMode(API_VERIFICATION_MODES.Streaming)
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

  const stopProbe = (probeId: ApiVerificationProbeId) => {
    probeAbortControllersRef.current.get(probeId)?.abort()
  }

  const runSingleProbe = (probeId: ApiVerificationProbeId) => {
    const abortController = new AbortController()
    probeAbortControllersRef.current.set(probeId, abortController)
    shouldStopRef.current = false
    void runProbe(probeId, abortController.signal).finally(() => {
      if (probeAbortControllersRef.current.get(probeId) === abortController) {
        probeAbortControllersRef.current.delete(probeId)
      }
    })
  }

  return {
    isRunning,
    isLoadingRuntimeKeys,
    accountRuntimeKeys,
    selectedRuntimeKeyId,
    setSelectedRuntimeKeyId,
    apiType,
    setApiType,
    modelId,
    setModelId,
    verificationMode,
    setVerificationMode,
    historyTarget,
    probes,
    persistedSummary,
    selectedRuntimeKey,
    compatibleRuntimeKeyIds,
    selectedRuntimeKeyIsCompatible,
    runtimeKeyCompatibilityHint,
    tokenModelHint,
    canClose,
    hasAnyResult,
    clearHistory,
    canRunAll,
    runAll,
    stopRun,
    stopProbe,
    runSingleProbe,
  }
}
