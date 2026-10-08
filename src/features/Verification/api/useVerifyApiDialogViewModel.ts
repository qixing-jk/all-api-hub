import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { executeDialogProbe } from "~/features/Verification/api/probeExecution"
import {
  buildProbeState,
  withUnfinishedProbesStopped,
} from "~/features/Verification/api/probeState"
import type { VerifyApiDialogProps } from "~/features/Verification/api/types"
import { useVerificationDialogState } from "~/features/Verification/api/useVerificationDialogState"
import {
  filterVerificationRedactions as filterRedactions,
  isVerificationAbortError,
} from "~/features/Verification/verificationDialogUtils"
import { useVerificationRunLifecycle } from "~/hooks/verification/useVerificationRunLifecycle"
import {
  collectAccountRuntimeKeySecrets,
  findDefaultSelectableAccountRuntimeKey,
  isAccountRuntimeKeyCompatibleWithModel,
  isSelectableAccountRuntimeKey,
  sortAccountRuntimeKeysActiveFirst,
  type AccountRuntimeKey,
} from "~/services/accounts/keys/accountRuntimeKeys"
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
import { resolveProductAnalyticsErrorCategoryFromProbeResult } from "~/services/productAnalytics/facts/verification"
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  API_TYPES,
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_STATUSES,
  runApiVerificationProbe,
} from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { createAccountModelVerificationHistoryTarget } from "~/services/verification/verificationResultHistory"
import { createLogger } from "~/utils/core/logger"

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
  const {
    isRunning,
    isStopped,
    isCurrent,
    captureContext,
    runSuite,
    runProbe: runProbeTask,
    runSequentialProbes,
    stopSuite: stopRun,
    stopProbe,
    reset,
  } = useVerificationRunLifecycle()
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
    clearVerificationHistory,
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
    const isCurrentContext = captureContext()
    setIsLoadingRuntimeKeys(true)
    try {
      const runtimeKeys = await fetchDisplayAccountRuntimeKeys(account)
      if (!isCurrentContext()) return

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
      if (!isCurrentContext()) return
      logger.error("Failed to load runtime keys", {
        message: toSanitizedErrorSummary(
          error,
          filterRedactions([account.token, account.cookieAuthSessionCookie]),
        ),
      })
      setAccountRuntimeKeys([])
      setSelectedRuntimeKeyId("")
    } finally {
      if (isCurrentContext()) setIsLoadingRuntimeKeys(false)
    }
  }

  const runProbe = async (
    probeId: ApiVerificationProbeId,
    abortSignal?: AbortSignal,
  ) => {
    if (isStopped(abortSignal)) return null
    if (!selectedRuntimeKey || !selectedRuntimeKeyIsCompatible) return null
    let resolvedRuntimeKey = selectedRuntimeKey
    let executedMode: ApiVerificationMode | undefined
    const { result } = await executeDialogProbe({
      probeId,
      mode: verificationMode,
      signal: abortSignal,
      isStopped: () => isStopped(abortSignal),
      isCurrent: () => isCurrent(abortSignal),
      isAbortFailure: (error) => isVerificationAbortError(error, abortSignal),
      stoppedMode: () => executedMode,
      readProbes: () => probesRef.current,
      replaceProbes,
      execute: async () => {
        resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
          account,
          selectedRuntimeKey,
          { abortSignal },
        )
        if (isStopped(abortSignal))
          throw new DOMException("Aborted", "AbortError")
        executedMode = verificationMode
        return runApiVerificationProbe({
          baseUrl: resolvedRuntimeKey.baseUrl,
          apiKey: resolvedRuntimeKey.secret,
          apiType,
          mode: executedMode,
          modelId: modelId.trim() || undefined,
          fallbackModelId: resolvedRuntimeKey.modelAccess.suggestedModelIds[0],
          probeId,
          abortSignal,
        })
      },
      acceptResult: (nextProbes) =>
        persistCurrentResults(
          apiType,
          nextProbes,
          modelId.trim() || tokenModelHint || initialModelId?.trim(),
        ),
      failure: {
        secrets: () =>
          filterRedactions([
            account.token,
            account.cookieAuthSessionCookie,
            ...collectAccountRuntimeKeySecrets([
              selectedRuntimeKey,
              resolvedRuntimeKey,
            ]),
          ]),
        summary: t("verifyDialog.errors.unexpected"),
        report: (message) => logger.error("Probe failed", { probeId, message }),
      },
    })
    return result
  }

  const clearHistory = async () => {
    if (!historyTarget) return
    await clearVerificationHistory(apiType)
  }

  // The suite can always run the models probe without a model id.
  const canRunAll = !!selectedRuntimeKey && selectedRuntimeKeyIsCompatible

  const runAll = async () => {
    if (!canRunAll) return

    return runSuite(async (signal) => {
      const tracker = startProductAnalyticsAction(analyticsContext)
      let successCount = 0
      let failureCount = 0
      let hasExecutedProbe = false
      let failedProbeResult: ApiVerificationProbeResult | undefined
      replaceProbes(buildProbeState(apiType))
      try {
        // Run sequentially so each probe updates independently (and can be retried individually).
        await runSequentialProbes(
          apiType,
          async (probe) => {
            if (probe.requiresModelId && !modelId.trim() && !tokenModelHint)
              return

            const result = await runProbe(probe.id, signal)
            if (!result) return
            if (result.status === API_VERIFICATION_PROBE_STATUSES.Pass) {
              hasExecutedProbe = true
              successCount += 1
            } else if (result.status === API_VERIFICATION_PROBE_STATUSES.Fail) {
              hasExecutedProbe = true
              failureCount += 1
              failedProbeResult ??= result
            }
          },
          signal,
        )
        if (isStopped(signal)) {
          if (isCurrent(signal))
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
      }
    })
  }

  useEffect(() => {
    reset()
    if (!isOpen) return

    let cancelled = false
    const trimmedModelId = initialModelId?.trim() ?? ""
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
      reset()
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

  const runSingleProbe = (probeId: ApiVerificationProbeId) => {
    void runProbeTask(probeId, (signal) => runProbe(probeId, signal))
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
