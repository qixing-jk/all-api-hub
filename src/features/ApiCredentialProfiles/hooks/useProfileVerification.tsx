import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { executeDialogProbe } from "~/components/dialogs/VerifyApiDialog/probeExecution"
import {
  buildProbeState,
  withUnfinishedProbesStopped,
} from "~/components/dialogs/VerifyApiDialog/probeState"
import type { ProbeItemState } from "~/components/dialogs/VerifyApiDialog/types"
import { useVerificationDialogState } from "~/components/dialogs/VerifyApiDialog/useVerificationDialogState"
import { Heading5 } from "~/components/ui"
import { useVerificationRunLifecycle } from "~/hooks/useVerificationRunLifecycle"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  startProductAnalyticsAction,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsErrorCategoryFromProbeResult } from "~/services/productAnalytics/verification"
import {
  API_TYPES,
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  runApiVerificationProbe,
  type ApiVerificationApiType,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import { getApiVerificationApiTypeLabel } from "~/services/verification/aiApiVerification/i18n"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import {
  createProfileModelVerificationHistoryTarget,
  createProfileVerificationHistoryTarget,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/core/logger"

import { useProfileModelDiscovery } from "./useProfileModelDiscovery"

/**
 * Unified logger scoped to API credential profile verification dialog.
 */
const logger = createLogger("VerifyApiCredentialProfileDialog")

const analyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}

export interface VerifyApiCredentialProfileDialogProps {
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
  if (result.id !== API_VERIFICATION_PROBE_IDS.Models) return null
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
 * Resolves the persisted history target for the profile and optional model.
 */
function createCurrentProfileVerificationHistoryTarget(
  profileId: string,
  modelId?: string,
) {
  const trimmedModelId = modelId?.trim()
  return trimmedModelId
    ? createProfileModelVerificationHistoryTarget(profileId, trimmedModelId)
    : createProfileVerificationHistoryTarget(profileId)
}

/**
 * Tracks the persisted-history context separately from the storage target so
 * API type switches still force a history refresh.
 */
function createVerificationHistoryContextKey(
  profileId: string,
  apiType: ApiVerificationApiType,
  modelId?: string,
) {
  return `${profileId}::${apiType}::${modelId?.trim() ?? ""}`
}
/** Own the feature state and user-command lifecycle consumed by the view. */
export function useProfileVerification({
  isOpen,
  profile,
  initialModelId,
}: VerifyApiCredentialProfileDialogProps) {
  const { t } = useTranslation(["aiApiVerification", "apiCredentialProfiles"])

  const {
    isRunning,
    isStopped,
    runSuite,
    runProbe: runProbeTask,
    runSequentialProbes,
    stopProbe: abortProbe,
    stopAll: stopRun,
  } = useVerificationRunLifecycle()
  const [apiType, setApiType] = useState<ApiVerificationApiType>(
    profile?.apiType ?? API_TYPES.OPENAI_COMPATIBLE,
  )
  const [modelId, setModelId] = useState("")
  const [verificationMode, setVerificationMode] = useState<ApiVerificationMode>(
    API_VERIFICATION_MODES.Streaming,
  )
  const [isPersisting, setIsPersisting] = useState(false)
  const [activeProbeId, setActiveProbeId] =
    useState<ApiVerificationProbeId | null>(null)

  const apiTypeRef = useRef(apiType)
  const pendingHistoryContextKeyRef = useRef<string | null>(null)
  const lastLoadedHistoryContextKeyRef = useRef<string | null>(null)
  const trimmedModelId = modelId.trim()
  const historyTarget = useMemo(() => {
    if (!profile) return null

    // API type does not change the storage key, but it does change which
    // persisted summary should be shown for the active dialog context.
    void apiType
    return createCurrentProfileVerificationHistoryTarget(
      profile.id,
      trimmedModelId,
    )
  }, [apiType, profile, trimmedModelId])
  const historyContextKey = useMemo(() => {
    if (!profile) return null
    return createVerificationHistoryContextKey(
      profile.id,
      apiType,
      trimmedModelId,
    )
  }, [apiType, profile, trimmedModelId])
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
  const canClose = !isRunning && !isAnyProbeRunning && !isPersisting

  useEffect(() => {
    apiTypeRef.current = apiType
  }, [apiType])

  const getHistoryTargetForModel = useCallback(
    (nextModelId?: string) => {
      if (!profile) return null
      return createCurrentProfileVerificationHistoryTarget(
        profile.id,
        nextModelId,
      )
    },
    [profile],
  )

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
        <div className="text-muted-foreground mt-density-1 truncate text-xs">
          {profile.baseUrl} · {profile.name}
        </div>
      </div>
    )
  }, [profile, t])

  const preserveCurrentProbeStateForModel = useCallback(
    (nextModelId: string, nextApiType: ApiVerificationApiType) => {
      if (!profile) return

      pendingHistoryContextKeyRef.current = null
      lastLoadedHistoryContextKeyRef.current =
        createVerificationHistoryContextKey(
          profile.id,
          nextApiType,
          nextModelId,
        )
    },
    [profile],
  )

  const {
    modelOptions,
    setModelOptions,
    isFetchingModels,
    setFetchModelsDiagnostic,
    fetchModelsError,
    fetchModels,
    cancelModelDiscovery,
    resetModelDiscovery,
  } = useProfileModelDiscovery({
    profile,
    setModelId,
    probesRef,
    apiTypeRef,
    preserveCurrentProbeStateForModel,
  })

  useEffect(() => {
    if (!isOpen || !profile) {
      cancelModelDiscovery()
      pendingHistoryContextKeyRef.current = null
      lastLoadedHistoryContextKeyRef.current = null
      return
    }

    const nextApiType = profile.apiType
    const nextModelId = initialModelId?.trim() ?? ""
    pendingHistoryContextKeyRef.current = createVerificationHistoryContextKey(
      profile.id,
      nextApiType,
      nextModelId,
    )
    lastLoadedHistoryContextKeyRef.current = null

    setApiType(nextApiType)
    setModelId(nextModelId)
    setVerificationMode(API_VERIFICATION_MODES.Streaming)
    resetModelDiscovery()
    setPersistedSummary(null)
    replaceProbes(buildProbeState(nextApiType))
    void fetchModels(nextApiType)
  }, [
    fetchModels,
    cancelModelDiscovery,
    resetModelDiscovery,
    initialModelId,
    isOpen,
    profile,
    replaceProbes,
    setPersistedSummary,
  ])

  useEffect(() => {
    if (
      !isOpen ||
      !profile ||
      !historyTarget ||
      !historyContextKey ||
      isRunning ||
      isAnyProbeRunning ||
      isPersisting
    ) {
      return
    }

    if (
      pendingHistoryContextKeyRef.current &&
      pendingHistoryContextKeyRef.current !== historyContextKey
    ) {
      return
    }

    if (lastLoadedHistoryContextKeyRef.current === historyContextKey) {
      return
    }

    pendingHistoryContextKeyRef.current = null
    lastLoadedHistoryContextKeyRef.current = historyContextKey

    let cancelled = false
    setPersistedSummary(null)
    replaceProbes(buildProbeState(apiType))

    void loadVerificationHistory({
      apiType,
      isCancelled: () => cancelled,
      onResolvedModelId: (resolvedModelId) => {
        setModelId((current) => current.trim() || resolvedModelId)
      },
      shouldApplySummaryToProbes: (summary) => summary.apiType === apiType,
    }).then((summary) => {
      if (cancelled || !summary || summary.apiType === apiType) {
        return
      }

      setPersistedSummary(null, false)
    })

    return () => {
      cancelled = true
    }
  }, [
    apiType,
    historyContextKey,
    historyTarget,
    isAnyProbeRunning,
    isOpen,
    isPersisting,
    isRunning,
    loadVerificationHistory,
    profile,
    replaceProbes,
    setPersistedSummary,
  ])

  const persistProbeResults = useCallback(
    async (nextProbes: ProbeItemState[], modelIdOverride?: string) => {
      const modelForProbe = (modelIdOverride ?? modelId).trim()
      setIsPersisting(true)

      try {
        await persistCurrentResults(
          apiType,
          nextProbes,
          modelForProbe || initialModelId?.trim(),
          getHistoryTargetForModel(modelForProbe),
        )
      } catch (error) {
        logger.error("Failed to persist verification history", { error })
      } finally {
        setIsPersisting(false)
      }
    },
    [
      apiType,
      getHistoryTargetForModel,
      initialModelId,
      modelId,
      persistCurrentResults,
    ],
  )

  const runProbe = async (
    probeId: ApiVerificationProbeId,
    modelIdOverride?: string,
    trackAnalytics = true,
    abortSignal?: AbortSignal,
  ): Promise<ApiVerificationProbeResult | null> => {
    if (!profile) return null
    const tracker = trackAnalytics
      ? startProductAnalyticsAction({
          ...analyticsContext,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbe,
        })
      : null
    const { result, error } = await executeDialogProbe({
      probeId,
      mode: verificationMode,
      signal: abortSignal,
      isStopped: () => isStopped(abortSignal),
      readProbes: () => probesRef.current,
      replaceProbes,
      execute: () =>
        runApiVerificationProbe({
          baseUrl: profile.baseUrl,
          apiKey: profile.apiKey,
          requestHeaders: profile.requestHeaders,
          apiType,
          mode: verificationMode,
          modelId: (modelIdOverride ?? modelId).trim() || undefined,
          probeId,
          abortSignal,
        }),
      acceptResult: async (nextProbes, probeResult) => {
        const modelsOutput = extractModelsProbeOutput(probeResult)
        if (modelsOutput) {
          if (Array.isArray(modelsOutput.modelIdsPreview)) {
            setModelOptions((current) =>
              current.length > 0 ? current : modelsOutput.modelIdsPreview!,
            )
          }
          const suggested =
            modelsOutput.suggestedModelId ?? modelsOutput.modelIdsPreview?.[0]
          if (suggested) {
            setModelId((current) => {
              if (current.trim()) return current
              preserveCurrentProbeStateForModel(suggested, apiType)
              return suggested
            })
          }
        }
        await persistProbeResults(nextProbes, modelIdOverride)
      },
      failure: {
        secrets: () => [
          profile.apiKey,
          ...Object.values(profile.requestHeaders ?? {}),
          profile.baseUrl,
        ],
        summary: t("aiApiVerification:verifyDialog.errors.unexpected"),
        report: (message) => logger.error("Probe failed", { probeId, message }),
      },
    })
    if (!result) {
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
    } else if (error !== undefined) {
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: resolveProductAnalyticsErrorCategoryFromError(error),
      })
    } else if (result.status === API_VERIFICATION_PROBE_STATUSES.Pass) {
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } else if (result.status === API_VERIFICATION_PROBE_STATUSES.Unsupported) {
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
    } else {
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory:
          resolveProductAnalyticsErrorCategoryFromProbeResult(result),
      })
    }
    return result
  }

  const clearHistory = async () => {
    const targetToClear = persistedSummary?.target ?? historyTarget
    if (!targetToClear) return

    try {
      await verificationResultHistoryStorage.clearTarget(targetToClear)
      setPersistedSummary(null)
      replaceProbes(buildProbeState(apiType))
    } catch (error) {
      logger.error("Failed to clear verification history", { error })
    }
  }

  const runSingleProbe = async (probeId: ApiVerificationProbeId) => {
    setActiveProbeId(probeId)
    try {
      await runProbeTask(probeId, (signal) =>
        runProbe(probeId, undefined, true, signal),
      )
    } finally {
      setActiveProbeId(null)
    }
  }

  const stopProbe = (probeId: ApiVerificationProbeId) => {
    abortProbe(probeId, { interruptRun: true })
  }

  const runAll = async () => {
    if (!profile) return
    return runSuite(async (signal) => {
      const tracker = startProductAnalyticsAction({
        ...analyticsContext,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbeSuite,
      })
      const results: ApiVerificationProbeResult[] = []
      setPersistedSummary(null)

      try {
        replaceProbes(buildProbeState(apiType))
        let modelIdForSuite = modelId.trim()

        await runSequentialProbes(
          apiType,
          async (probe) => {
            if (probe.id === API_VERIFICATION_PROBE_IDS.Models) {
              const result = await runProbe(
                API_VERIFICATION_PROBE_IDS.Models,
                undefined,
                false,
                signal,
              )
              if (result) results.push(result)
              if (!modelIdForSuite && result) {
                const modelsOutput = extractModelsProbeOutput(result)
                const suggested =
                  modelsOutput?.suggestedModelId ??
                  modelsOutput?.modelIdsPreview?.[0]
                if (suggested) {
                  modelIdForSuite = suggested
                  setModelId((current) => {
                    if (current.trim()) return current
                    preserveCurrentProbeStateForModel(suggested, apiType)
                    return suggested
                  })
                }
              }
              return
            }

            if (probe.requiresModelId && !modelIdForSuite) return
            const result = await runProbe(
              probe.id,
              modelIdForSuite,
              false,
              signal,
            )
            if (result) results.push(result)
          },
          signal,
        )

        // Both the interrupted and the completed report describe the same run, so
        // derive its shape once before either outcome is chosen.
        const successCount = results.filter(
          (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Pass,
        ).length
        const failureCount = results.filter(
          (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
        ).length
        const insights = {
          itemCount: results.length,
          successCount,
          failureCount,
        }

        if (isStopped(signal)) {
          // Report the interruption as its own outcome instead of letting the
          // partial results look like a completed suite.
          replaceProbes(withUnfinishedProbesStopped(probesRef.current))
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, { insights })
          return
        }

        if (results.length === 0) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
          return
        }

        const hasFailedProbe = failureCount > 0
        if (hasFailedProbe) {
          const errorCategory = results
            .filter(
              (result) =>
                result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
            )
            .map((result) =>
              resolveProductAnalyticsErrorCategoryFromProbeResult(result),
            )
            .find(
              (category) =>
                category !== PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            )
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory:
              errorCategory ?? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            insights,
          })
          return
        }

        if (successCount === 0) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, { insights })
          return
        }

        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, { insights })
      } catch (error) {
        logger.error("Probe suite failed", {
          message: toSanitizedErrorSummary(error, [
            profile.apiKey,
            ...Object.values(profile.requestHeaders ?? {}),
            profile.baseUrl,
          ]),
        })
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: resolveProductAnalyticsErrorCategoryFromError(error),
        })
      }
    })
  }

  return {
    isRunning,
    apiType,
    setApiType,
    modelId,
    setModelId,
    verificationMode,
    setVerificationMode,
    modelOptions,
    setModelOptions,
    isFetchingModels,
    setFetchModelsDiagnostic,
    fetchModelsError,
    isPersisting,
    activeProbeId,
    historyTarget,
    probes,
    replaceProbes,
    persistedSummary,
    setPersistedSummary,
    isAnyProbeRunning,
    canClose,
    hasAnyResult,
    hasApiTypeOverride,
    savedApiTypeLabel,
    currentApiTypeLabel,
    header,
    fetchModels,
    clearHistory,
    runSingleProbe,
    stopProbe,
    stopRun,
    runAll,
  }
}
