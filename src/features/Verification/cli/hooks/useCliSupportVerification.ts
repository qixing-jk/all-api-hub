import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  createCliVerificationSession,
  type CliVerificationBatch,
} from "~/features/Verification/cli/hooks/cliVerificationSession"
import type {
  ToolItemState,
  VerifyCliSupportDialogProps,
} from "~/features/Verification/cli/types"
import {
  filterVerificationRedactions as filterRedactions,
  isVerificationAbortError as isAbortError,
} from "~/features/Verification/verificationDialogUtils"
import {
  collectAccountRuntimeKeySecrets,
  findDefaultSelectableAccountRuntimeKey,
  isSelectableAccountRuntimeKey,
  sortAccountRuntimeKeysActiveFirst,
  type AccountRuntimeKey,
} from "~/services/accounts/keys/accountRuntimeKeys"
import {
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  fetchApiCredentialModelIds,
  normalizeApiCredentialModelIds,
} from "~/services/apiCredentialProfiles/modelCatalog"
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
import {
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationMode,
} from "~/services/verification/aiApiVerification"
import {
  inferHttpStatus,
  inferStructuredHttpStatus,
  summaryKeyFromHttpStatus,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import type { CliSupportResult } from "~/services/verification/cliSupportVerification"
import {
  CLI_TOOL_IDS,
  runCliSupportTool,
} from "~/services/verification/cliSupportVerification"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to the CLI support verification dialog.
 */
const logger = createLogger("VerifyCliSupportDialog")

/**
 * Build the initial UI state for all tool rows.
 */
function buildInitialToolState(): ToolItemState[] {
  return CLI_TOOL_IDS.map((toolId) => ({
    toolId,
    isRunning: false,
    attempts: 0,
    result: null,
  }))
}

/**
 * Builds a synthetic result so interrupted tool checks render as stopped, not failed.
 */
function buildStoppedToolResult(
  toolId: (typeof CLI_TOOL_IDS)[number],
  mode?: ApiVerificationMode,
) {
  return {
    id: toolId,
    probeId: "tool-calling" as const,
    mode,
    status: API_VERIFICATION_PROBE_STATUSES.Unsupported,
    latencyMs: 0,
    summary: "Stopped",
    summaryKey: "verifyDialog.summaries.stopped",
  }
}

/** Owns CLI source preparation, tool runs, cancellation, and execution feedback. */
export function useCliSupportVerification(props: VerifyCliSupportDialogProps) {
  const { isOpen, initialModelId } = props
  const { t } = useTranslation("cliSupportVerification")
  const account = "account" in props ? props.account : null
  const profile = "profile" in props ? props.profile : null
  const isProfileSource = profile !== null
  const sourceBaseUrl = profile?.baseUrl ?? account?.baseUrl ?? ""
  const sourceName = profile?.name ?? account?.name ?? ""

  const [modelId, setModelId] = useState<string>(initialModelId?.trim() ?? "")
  const [verificationMode, setVerificationMode] = useState<ApiVerificationMode>(
    API_VERIFICATION_MODES.Streaming,
  )
  const [isRunning, setIsRunning] = useState(false)
  const [isLoadingRuntimeKeys, setIsLoadingRuntimeKeys] = useState(false)
  const [accountRuntimeKeys, setAccountRuntimeKeys] = useState<
    AccountRuntimeKey[]
  >([])
  const [selectedRuntimeKeyId, setSelectedRuntimeKeyId] = useState<string>("")
  const [profileModelOptions, setProfileModelOptions] = useState<string[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [fetchModelsDiagnostic, setFetchModelsDiagnostic] = useState<
    string | null
  >(null)
  const fetchModelsError =
    fetchModelsDiagnostic === null
      ? null
      : fetchModelsDiagnostic || t("verifyDialog.modelsFetchFailed")
  const [tools, setTools] = useState<ToolItemState[]>([])
  const [executionSession] = useState(createCliVerificationSession)
  const runtimeKeysRequestIdRef = useRef(0)
  const fetchModelsAbortControllerRef = useRef<AbortController | null>(null)
  const fetchModelsRequestIdRef = useRef(0)

  const selectedRuntimeKey = accountRuntimeKeys.find(
    (runtimeKey) => runtimeKey.id === selectedRuntimeKeyId,
  )
  const activeApiKey = profile?.apiKey ?? selectedRuntimeKey?.secret ?? null
  const selectedRuntimeKeyIsRunnable =
    !!selectedRuntimeKey && isSelectableAccountRuntimeKey(selectedRuntimeKey)
  const hasRunnableSource = isProfileSource
    ? !!activeApiKey
    : selectedRuntimeKeyIsRunnable
  const modelOptions = useMemo(() => {
    if (isProfileSource) return profileModelOptions
    return normalizeApiCredentialModelIds([
      ...(selectedRuntimeKey?.modelAccess.suggestedModelIds ?? []),
    ])
  }, [isProfileSource, profileModelOptions, selectedRuntimeKey])

  const tokenModelHint = useMemo(() => {
    if (isProfileSource) return ""
    return selectedRuntimeKey?.modelAccess.suggestedModelIds[0] ?? ""
  }, [isProfileSource, selectedRuntimeKey])

  const resolvedModelId = (modelId.trim() || tokenModelHint.trim() || "").trim()

  const isAnyToolRunning = tools.some((t) => t.isRunning)
  const canClose = !isRunning && !isAnyToolRunning

  const hasAnyResult = tools.some((t) => t.result !== null)
  const analyticsContext = {
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelCliSupport,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListRowActions,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  } as const

  const loadRuntimeKeys = useCallback(async () => {
    const requestId = (runtimeKeysRequestIdRef.current += 1)
    if (!account) {
      setAccountRuntimeKeys([])
      setSelectedRuntimeKeyId("")
      setIsLoadingRuntimeKeys(false)
      return
    }

    setAccountRuntimeKeys([])
    setSelectedRuntimeKeyId("")
    setIsLoadingRuntimeKeys(true)
    try {
      const runtimeKeys = await fetchDisplayAccountRuntimeKeys(account)
      if (runtimeKeysRequestIdRef.current !== requestId) return

      const sorted = sortAccountRuntimeKeysActiveFirst(runtimeKeys)

      setAccountRuntimeKeys(sorted)
      const defaultRuntimeKey = findDefaultSelectableAccountRuntimeKey(sorted)
      setSelectedRuntimeKeyId(defaultRuntimeKey ? defaultRuntimeKey.id : "")
    } catch (error) {
      logger.error("Failed to load runtime keys", {
        message: toSanitizedErrorSummary(
          error,
          filterRedactions([account.token, account.cookieAuthSessionCookie]),
        ),
      })
      if (runtimeKeysRequestIdRef.current !== requestId) return
      setAccountRuntimeKeys([])
      setSelectedRuntimeKeyId("")
    } finally {
      if (runtimeKeysRequestIdRef.current === requestId) {
        setIsLoadingRuntimeKeys(false)
      }
    }
  }, [account])

  const loadProfileModels = useCallback(async () => {
    if (!profile) {
      setProfileModelOptions([])
      setFetchModelsDiagnostic(null)
      setIsLoadingModels(false)
      return
    }

    const requestId = (fetchModelsRequestIdRef.current += 1)
    fetchModelsAbortControllerRef.current?.abort()
    const abortController = new AbortController()
    fetchModelsAbortControllerRef.current = abortController
    setFetchModelsDiagnostic(null)
    setIsLoadingModels(true)

    try {
      const normalized = normalizeApiCredentialModelIds(
        await fetchApiCredentialModelIds({
          apiType: profile.apiType,
          baseUrl: profile.baseUrl,
          apiKey: profile.apiKey,
          requestHeaders: profile.requestHeaders,
          abortSignal: abortController.signal,
        }),
      )

      if (fetchModelsRequestIdRef.current !== requestId) return
      setProfileModelOptions(normalized)
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

      logger.error("Failed to fetch profile models", { message })

      if (fetchModelsRequestIdRef.current !== requestId) return
      setProfileModelOptions([])
      setFetchModelsDiagnostic(message)
    } finally {
      if (fetchModelsAbortControllerRef.current === abortController) {
        fetchModelsAbortControllerRef.current = null
      }
      if (fetchModelsRequestIdRef.current === requestId) {
        setIsLoadingModels(false)
      }
    }
  }, [profile])

  const runTool = async (
    toolId: (typeof CLI_TOOL_IDS)[number],
    batch?: CliVerificationBatch,
  ): Promise<CliSupportResult | null> => {
    if (batch?.isStopped()) return null
    if (isProfileSource && !activeApiKey) return null
    const sourceAccount = account
    const accountRuntimeKey = selectedRuntimeKey

    if (
      !isProfileSource &&
      (!sourceAccount ||
        !accountRuntimeKey ||
        !isSelectableAccountRuntimeKey(accountRuntimeKey))
    ) {
      return null
    }

    if (!resolvedModelId.trim()) return null
    const run = executionSession.beginTool(toolId, batch)
    const abortSignal = run.signal

    let resolvedApiKey = activeApiKey
    let resolvedBaseUrl = sourceBaseUrl
    let executedMode: ApiVerificationMode | undefined
    const secretsToRedact = new Set<string>(
      filterRedactions([
        activeApiKey ?? undefined,
        ...Object.values(profile?.requestHeaders ?? {}),
        sourceAccount?.token ?? undefined,
        sourceAccount?.cookieAuthSessionCookie ?? undefined,
        ...(accountRuntimeKey
          ? collectAccountRuntimeKeySecrets([accountRuntimeKey])
          : []),
      ]),
    )
    const startedAt = Date.now()
    setTools((prev) =>
      prev.map((t) =>
        t.toolId === toolId
          ? { ...t, isRunning: true, attempts: t.attempts + 1 }
          : t,
      ),
    )

    try {
      if (!isProfileSource) {
        if (!sourceAccount || !accountRuntimeKey) return null

        const resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
          sourceAccount,
          accountRuntimeKey,
          { abortSignal },
        )
        if (!run.isCurrent()) return null
        if (run.isCancelled()) {
          setTools((prev) =>
            prev.map((t) =>
              t.toolId === toolId
                ? {
                    ...t,
                    isRunning: false,
                    result: buildStoppedToolResult(toolId),
                  }
                : t,
            ),
          )
          return null
        }
        resolvedApiKey = resolvedRuntimeKey.secret
        resolvedBaseUrl = resolvedRuntimeKey.baseUrl
        for (const secret of collectAccountRuntimeKeySecrets([
          accountRuntimeKey,
          resolvedRuntimeKey,
        ])) {
          secretsToRedact.add(secret)
        }
      }

      if (!resolvedApiKey) {
        const finishedAt = Date.now()
        setTools((prev) =>
          prev.map((t) =>
            t.toolId === toolId
              ? {
                  ...t,
                  isRunning: false,
                  result: {
                    id: toolId,
                    probeId: "tool-calling",
                    mode: verificationMode,
                    status: API_VERIFICATION_PROBE_STATUSES.Fail,
                    latencyMs: Math.max(0, finishedAt - startedAt),
                    summary: "No API key is available for this runtime key.",
                    summaryKey: "verifyDialog.summaries.noRuntimeKeySecret",
                    input: {
                      toolId,
                      baseUrl: resolvedBaseUrl,
                      modelId: resolvedModelId,
                      ...(selectedRuntimeKeyId
                        ? { runtimeKeyId: selectedRuntimeKeyId }
                        : {}),
                    },
                  },
                }
              : t,
          ),
        )
        return null
      }

      executedMode = verificationMode
      const result = await runCliSupportTool({
        toolId,
        mode: executedMode,
        baseUrl: resolvedBaseUrl,
        apiKey: resolvedApiKey,
        requestHeaders: profile?.requestHeaders,
        modelId: resolvedModelId,
        abortSignal,
      })

      if (!run.isCurrent()) return null
      if (run.isCancelled()) {
        setTools((prev) =>
          prev.map((t) =>
            t.toolId === toolId
              ? {
                  ...t,
                  isRunning: false,
                  result: buildStoppedToolResult(toolId, executedMode),
                }
              : t,
          ),
        )
        return null
      }

      setTools((prev) =>
        prev.map((t) =>
          t.toolId === toolId ? { ...t, isRunning: false, result } : t,
        ),
      )
      return result
    } catch (error) {
      if (!run.isCurrent()) return null
      if (isAbortError(error, abortSignal) || run.isCancelled()) {
        setTools((prev) =>
          prev.map((t) =>
            t.toolId === toolId
              ? {
                  ...t,
                  isRunning: false,
                  result: buildStoppedToolResult(toolId, executedMode),
                }
              : t,
          ),
        )
        return null
      }

      const finishedAt = Date.now()
      const sanitizedMessage = toSanitizedErrorSummary(
        error,
        Array.from(secretsToRedact),
      )
      const inferredStatus = inferHttpStatus(error, sanitizedMessage)
      const analyticsStatus = inferStructuredHttpStatus(error)
      const summaryKey =
        summaryKeyFromHttpStatus(inferredStatus) ??
        (typeof inferredStatus === "number"
          ? "verifyDialog.summaries.httpError"
          : "verifyDialog.summaries.unexpectedError")
      const summaryParams =
        summaryKey === "verifyDialog.summaries.httpError"
          ? { status: inferredStatus }
          : summaryKey === "verifyDialog.summaries.unexpectedError"
            ? { message: sanitizedMessage }
            : undefined

      logger.error("Tool run failed", {
        toolId,
        inferredStatus,
        message: sanitizedMessage,
      })
      const failureResult: CliSupportResult = {
        id: toolId,
        probeId: "tool-calling",
        mode: verificationMode,
        status: API_VERIFICATION_PROBE_STATUSES.Fail,
        latencyMs: Math.max(0, finishedAt - startedAt),
        summary: sanitizedMessage || "Unknown error",
        summaryKey,
        summaryParams,
        input: {
          toolId,
          baseUrl: isProfileSource
            ? sourceBaseUrl
            : selectedRuntimeKey?.baseUrl ?? sourceBaseUrl,
          modelId: resolvedModelId,
          ...(selectedRuntimeKeyId
            ? { runtimeKeyId: selectedRuntimeKeyId }
            : {}),
        },
        output: {
          error: sanitizedMessage,
          ...(typeof analyticsStatus === "number"
            ? { inferredHttpStatus: analyticsStatus }
            : {}),
        },
        details: {
          occurredAt: new Date(finishedAt).toISOString(),
        },
      }

      setTools((prev) =>
        prev.map((t) => {
          if (t.toolId !== toolId) return t

          // Ensure failures are rendered distinctly from "Not run yet" (result=null).
          return {
            ...t,
            isRunning: false,
            result: {
              ...failureResult,
              details: {
                ...failureResult.details,
                attempts: t.attempts,
              },
            },
          }
        }),
      )
      return failureResult
    } finally {
      run.finish()
    }
  }

  const runAll = async () => {
    if (!hasRunnableSource) return
    const batch = executionSession.beginBatch()
    const tracker = startProductAnalyticsAction(analyticsContext)
    let successCount = 0
    let failureCount = 0
    let hasExecutedTool = false
    let failedToolResult: CliSupportResult | undefined
    setIsRunning(true)
    setTools(buildInitialToolState())

    try {
      // Run sequentially so each tool updates independently (and can be retried individually).
      for (const toolId of CLI_TOOL_IDS) {
        if (batch.isStopped()) break
        const result = await runTool(toolId, batch)
        if (!result) continue
        if (result.status === API_VERIFICATION_PROBE_STATUSES.Pass) {
          hasExecutedTool = true
          successCount += 1
        } else if (result.status === API_VERIFICATION_PROBE_STATUSES.Fail) {
          hasExecutedTool = true
          failureCount += 1
          failedToolResult ??= result
        }
      }
      if (batch.isStopped()) {
        if (batch.isCurrent())
          setTools((prev) =>
            prev.map((tool) =>
              tool.result
                ? { ...tool, isRunning: false }
                : {
                    ...tool,
                    isRunning: false,
                    result: buildStoppedToolResult(tool.toolId),
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
          : hasExecutedTool
            ? PRODUCT_ANALYTICS_RESULTS.Success
            : PRODUCT_ANALYTICS_RESULTS.Skipped
      tracker.complete(completionResult, {
        ...(completionResult === PRODUCT_ANALYTICS_RESULTS.Failure
          ? {
              errorCategory:
                resolveProductAnalyticsErrorCategoryFromProbeResult(
                  failedToolResult,
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
      logger.error("CLI support verification run failed", {
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
      if (batch.finish()) setIsRunning(false)
    }
  }

  const stopRun = () => {
    executionSession.stopBatch()
  }

  useEffect(() => {
    executionSession.reset()
    setIsRunning(false)
    fetchModelsAbortControllerRef.current?.abort()
    fetchModelsAbortControllerRef.current = null
    if (!isOpen) return
    setTools(buildInitialToolState())
    setProfileModelOptions([])
    setFetchModelsDiagnostic(null)
    if (isProfileSource) {
      setAccountRuntimeKeys([])
      setSelectedRuntimeKeyId("")
      setIsLoadingRuntimeKeys(false)
      void loadProfileModels()
    } else {
      setIsLoadingModels(false)
      void loadRuntimeKeys()
    }
    setModelId(initialModelId?.trim() ?? "")
    setVerificationMode(API_VERIFICATION_MODES.Streaming)
  }, [
    initialModelId,
    isOpen,
    isProfileSource,
    loadProfileModels,
    loadRuntimeKeys,
    executionSession,
  ])

  useEffect(() => () => executionSession.reset(), [executionSession])

  const canRunAll = hasRunnableSource && resolvedModelId.trim().length > 0

  const stopSingleTool = (toolId: (typeof CLI_TOOL_IDS)[number]) => {
    executionSession.stopTool(toolId)
  }
  const runSingleToolCheck = (toolId: (typeof CLI_TOOL_IDS)[number]) => {
    void runTool(toolId)
  }

  return {
    isProfileSource,
    sourceBaseUrl,
    sourceName,
    modelId,
    setModelId,
    verificationMode,
    setVerificationMode,
    isRunning,
    isLoadingRuntimeKeys,
    accountRuntimeKeys,
    selectedRuntimeKeyId,
    setSelectedRuntimeKeyId,
    isLoadingModels,
    fetchModelsError,
    tools,
    hasRunnableSource,
    modelOptions,
    tokenModelHint,
    resolvedModelId,
    canClose,
    hasAnyResult,
    stopSingleTool,
    runSingleToolCheck,
    runAll,
    stopRun,
    canRunAll,
  }
}
