import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationProbePromptOverrides,
  ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification/types"
import {
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import {
  DRAWING_VERIFICATION_OUTCOMES,
  PELICAN_EXECUTION_MODES,
} from "~/services/verification/modelQuality/constants"
import type { runContextCapacity } from "~/services/verification/modelQuality/contextCapacityRun"
import type { getModelContextInfo } from "~/services/verification/modelQuality/contextTokens"
import {
  runPelicanTest,
  type PelicanExecutionMode,
  type PelicanTestResult,
} from "~/services/verification/modelQuality/pelican"
import { PELICAN_PROMPT_ID } from "~/services/verification/promptOverrides"
import {
  serializeVerificationHistoryTarget,
  verificationResultHistoryStorage,
  type ApiVerificationHistoryTarget,
  type DrawingVerificationSummary,
} from "~/services/verification/verificationResultHistory"
import type { ContextCapacityHistoryAccess } from "~/services/verification/verificationResultHistory/contextCapacityHistory"
import type { NeedleHistoryAccess } from "~/services/verification/verificationResultHistory/needleHistory"
import { API_VERIFICATION_HISTORY_TARGET_KINDS } from "~/services/verification/verificationResultHistory/types"
import { discardNeedleCheckpointsInBackground } from "~/services/verification/webAiApiCheck/needleClient"

import {
  useContextCapacity,
  type ContextCapacityController,
  type ContextCapacityHistoryRequestResolver,
} from "./useContextCapacity"
import {
  useNeedleTest,
  type NeedleController,
  type NeedleRunner,
} from "./useNeedleTest"
import { useVerificationPrompts } from "./useVerificationPrompts"

export const VERIFICATION_TOOL_STATUSES = {
  Idle: "idle",
  Running: "running",
  Done: "done",
  Stopped: "stopped",
  Error: "error",
} as const

export type VerificationToolStatus =
  (typeof VERIFICATION_TOOL_STATUSES)[keyof typeof VERIFICATION_TOOL_STATUSES]

export type VerificationToolRequestParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
  mode: ApiVerificationMode
  requestProfile: ApiVerificationRequestProfile
  requestProfileEnhanced: boolean
  /** Request overrides the credential carries; sent, and redacted from errors. */
  requestHeaders?: Record<string, string>
  /** Secret values to redact from error text. */
  secrets: string[]
}

export type VerificationToolsController = {
  needle?: NeedleController
  contextCapacity?: ContextCapacityController
  /** At least one shared verification tool is in flight. */
  isRunning: boolean
  canRunPelican: boolean
  isPelicanRunning: boolean
  pelicanStatus: VerificationToolStatus
  clearContextCapacityHistory?: (target?: ApiVerificationHistoryTarget) => void
  clearPelicanHistory?: () => void
  pelicanSummary?: DrawingVerificationSummary | null
  pelican: PelicanTestResult | null
  pelicanErrorMessage: string | null
  pelicanExecutionMode: PelicanExecutionMode
  setPelicanExecutionMode: (mode: PelicanExecutionMode) => void
  runPelican: () => void
  stopPelican: () => void
} & ReturnType<typeof useVerificationPrompts>

/** Executes one drawing test; injectable so a content script can delegate it. */
export type PelicanRunner = (
  params: VerificationToolRequestParams & {
    prompt?: string
    executionMode?: PelicanExecutionMode
    abortSignal: AbortSignal
  },
) => Promise<PelicanTestResult>

export type UseVerificationToolsOptions = {
  modelId?: string
  runNeedleRequest?: NeedleRunner
  loadNeedleCounter?: typeof getModelContextInfo
  needleHistoryAccess?: NeedleHistoryAccess
  discardNeedleCheckpoints?: () => Promise<unknown>

  discardContextCheckpoints?: () => Promise<void>
  contextHistoryAccess?: ContextCapacityHistoryAccess
  resolveContextHistoryRequest?: ContextCapacityHistoryRequestResolver
  runContextCapacityRequest?: typeof runContextCapacity
  enableContextCapacity?: boolean
  contextCapacityKey?: string
  historyTarget?: ApiVerificationHistoryTarget | null
  historyApiType?: ApiVerificationApiType

  /** Resolve credentials for one run; `null` means the action cannot start. */
  resolveRequest: (
    signal: AbortSignal,
  ) => Promise<VerificationToolRequestParams | null>
  /** Only text models support the drawing test. */
  isSupported: boolean
  /** Required configuration is unavailable; unrelated tests do not block runs. */
  isBlocked: boolean
  /** Pelican prompt override; blank falls back to the built-in prompt. */
  pelicanPrompt?: string
  /**
   * Runs the drawing test. Defaults to calling the provider directly; the Web AI
   * API Check content script delegates to the background instead.
   */
  runPelicanRequest?: PelicanRunner
}

/** Bind a drawing's compact history to the model actually requested. */
function buildDrawingSummary(
  target: ApiVerificationHistoryTarget,
  request: VerificationToolRequestParams,
  result: Omit<
    DrawingVerificationSummary,
    "target" | "targetKey" | "apiType" | "modelId"
  >,
): DrawingVerificationSummary {
  const finalTarget =
    target.kind === API_VERIFICATION_HISTORY_TARGET_KINDS.Profile &&
    request.modelId
      ? {
          kind: API_VERIFICATION_HISTORY_TARGET_KINDS.ProfileModel,
          profileId: target.profileId,
          modelId: request.modelId,
        }
      : target
  return {
    ...result,
    target: finalTarget,
    targetKey: serializeVerificationHistoryTarget(finalTarget),
    apiType: request.apiType,
    modelId: request.modelId,
  }
}

/**
 * Owns the shared verification tools: the on-demand pelican drawing test and the
 * user-editable probe prompts. Both are shared by every verification entry
 * point, so the component can be dropped into any dialog unchanged.
 */
export function useVerificationTools({
  resolveRequest,
  historyTarget,
  historyApiType,
  isSupported,
  isBlocked,
  pelicanPrompt,
  runPelicanRequest = runPelicanTest,
  enableContextCapacity = false,
  contextCapacityKey = "",
  runContextCapacityRequest,
  contextHistoryAccess,
  resolveContextHistoryRequest,
  discardContextCheckpoints,
  modelId = "",
  runNeedleRequest,
  loadNeedleCounter,
  needleHistoryAccess,
  discardNeedleCheckpoints = discardNeedleCheckpointsInBackground,
}: UseVerificationToolsOptions): VerificationToolsController {
  const [pelicanSummary, setPelicanSummary] =
    useState<DrawingVerificationSummary | null>(null)
  const historyKey = historyTarget
    ? serializeVerificationHistoryTarget(historyTarget)
    : null
  const runVersionRef = useRef(0)
  const historyTargetRef = useRef(historyTarget)
  historyTargetRef.current = historyTarget
  const [pelicanExecutionMode, setExecutionMode] =
    useState<PelicanExecutionMode>(PELICAN_EXECUTION_MODES.Reply)
  const [pelicanStatus, setPelicanStatus] = useState<VerificationToolStatus>(
    VERIFICATION_TOOL_STATUSES.Idle,
  )
  const [pelican, setPelican] = useState<PelicanTestResult | null>(null)
  const [pelicanErrorMessage, setPelicanErrorMessage] = useState<string | null>(
    null,
  )
  const prompts = useVerificationPrompts()
  const { promptDraft } = prompts

  const pelicanControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    const runVersion = runVersionRef.current
    pelicanControllerRef.current?.abort()
    pelicanControllerRef.current = null
    setPelican(null)
    setPelicanSummary(null)
    setPelicanErrorMessage(null)
    setPelicanStatus(VERIFICATION_TOOL_STATUSES.Idle)
    const target = historyTargetRef.current
    if (target)
      void verificationResultHistoryStorage
        .getDrawingSummary(target)
        .then((summary) => {
          if (
            !cancelled &&
            runVersion === runVersionRef.current &&
            summary &&
            summary.apiType === historyApiType
          ) {
            setPelicanSummary(summary)
            setExecutionMode(summary.executionMode)
          }
        })
        .catch((error) => {
          if (!cancelled)
            setPelicanErrorMessage(toSanitizedErrorSummary(error, []))
        })
    return () => {
      cancelled = true
    }
  }, [historyKey, historyApiType])

  useEffect(
    () => () => {
      pelicanControllerRef.current?.abort()
    },
    [],
  )

  const isPelicanRunning = pelicanStatus === VERIFICATION_TOOL_STATUSES.Running
  const contextCapacity = useContextCapacity({
    enabled: enableContextCapacity && isSupported,
    blocked: isBlocked,
    contextKey: `${historyKey}:${historyApiType}:${contextCapacityKey}`,
    resolveRequest,
    resolveHistoryRequest: resolveContextHistoryRequest,
    runner: runContextCapacityRequest,
    historyAccess: contextHistoryAccess,
    historyTarget,
    discardCheckpoints: discardContextCheckpoints,
  })
  const measurement = contextCapacity.result ?? contextCapacity.history
  const needle = useNeedleTest({
    enabled: enableContextCapacity && isSupported,
    blocked: isBlocked || contextCapacity.running,
    contextKey: `${historyKey}:${historyApiType}:${contextCapacityKey}`,
    modelId,
    resolveRequest,
    resolveHistoryRequest: resolveContextHistoryRequest,
    capacity: measurement?.counter
      ? {
          lowerBoundTokens: measurement.lowerBoundTokens,
          counter: measurement.counter,
          requiresCredentialVerification:
            !contextCapacity.result &&
            contextCapacity.history?.requiresCredentialVerification,
        }
      : undefined,
    runner: runNeedleRequest,
    loadCounter: loadNeedleCounter,
    historyAccess: needleHistoryAccess,
    historyTarget,
    discardCheckpoints: discardNeedleCheckpoints,
  })
  const canRun = isSupported && !isBlocked && !isPelicanRunning

  const setPelicanExecutionMode = useCallback((mode: PelicanExecutionMode) => {
    if (pelicanControllerRef.current) return
    setExecutionMode(mode)
    setPelican(null)
    setPelicanErrorMessage(null)
    setPelicanStatus(VERIFICATION_TOOL_STATUSES.Idle)
  }, [])

  const runPelican = useCallback(() => {
    if (!canRun || pelicanControllerRef.current) return
    runVersionRef.current += 1

    const controller = new AbortController()
    pelicanControllerRef.current = controller

    setPelicanStatus(VERIFICATION_TOOL_STATUSES.Running)
    setPelican(null)
    setPelicanErrorMessage(null)

    let secrets: string[] = []
    const targetToSave = historyTargetRef.current
    const startedAt = Date.now()
    let runRequest: VerificationToolRequestParams | null = null

    void (async () => {
      try {
        const request = await resolveRequest(controller.signal)
        if (!request) {
          if (pelicanControllerRef.current === controller) {
            setPelicanStatus(VERIFICATION_TOOL_STATUSES.Idle)
          }
          return
        }
        runRequest = request
        secrets = request.secrets
        controller.signal.throwIfAborted()

        const customPrompt = promptDraft[PELICAN_PROMPT_ID]?.trim()
        const effectivePrompt =
          customPrompt ||
          (pelicanPrompt?.trim() ? pelicanPrompt.trim() : undefined)

        const result = await runPelicanRequest({
          ...request,
          ...(pelicanExecutionMode === PELICAN_EXECUTION_MODES.Agent
            ? { executionMode: PELICAN_EXECUTION_MODES.Agent }
            : {}),
          ...(effectivePrompt ? { prompt: effectivePrompt } : {}),
          abortSignal: controller.signal,
        })

        if (pelicanControllerRef.current !== controller) return
        setPelican(result)
        if (targetToSave) {
          const summary = buildDrawingSummary(targetToSave, request, {
            verifiedAt: result.runAt || Date.now(),
            latencyMs: result.latencyMs,
            executionMode: pelicanExecutionMode,
            outcome: result.svg
              ? DRAWING_VERIFICATION_OUTCOMES.Generated
              : DRAWING_VERIFICATION_OUTCOMES.NoArtifact,
            steps: result.agent?.steps ?? 1,
            calls: result.agent?.calls.length ?? 0,
            files: result.agent?.files.length ?? 0,
          })
          setPelicanSummary(summary)
          try {
            await verificationResultHistoryStorage.upsertDrawingSummary(summary)
          } catch (error) {
            if (pelicanControllerRef.current === controller)
              setPelicanErrorMessage(toSanitizedErrorSummary(error, secrets))
          }
        }
        if (pelicanControllerRef.current === controller)
          setPelicanStatus(VERIFICATION_TOOL_STATUSES.Done)
      } catch (error) {
        if (pelicanControllerRef.current !== controller) return
        if (isAbortError(error, controller.signal)) {
          setPelicanStatus(VERIFICATION_TOOL_STATUSES.Stopped)
          return
        }
        setPelicanErrorMessage(toSanitizedErrorSummary(error, secrets))
        setPelicanStatus(VERIFICATION_TOOL_STATUSES.Error)
        if (targetToSave && runRequest) {
          const summary = buildDrawingSummary(targetToSave, runRequest, {
            verifiedAt: Date.now(),
            latencyMs: Date.now() - startedAt,
            executionMode: pelicanExecutionMode,
            outcome: DRAWING_VERIFICATION_OUTCOMES.Error,
            steps: 0,
            calls: 0,
            files: 0,
          })
          setPelicanSummary(summary)
          try {
            await verificationResultHistoryStorage.upsertDrawingSummary(summary)
          } catch {
            /* The request error remains visible; do not replace it. */
          }
        }
      } finally {
        if (pelicanControllerRef.current === controller) {
          pelicanControllerRef.current = null
        }
      }
    })()
  }, [
    canRun,
    pelicanPrompt,
    promptDraft,
    pelicanExecutionMode,
    resolveRequest,
    runPelicanRequest,
  ])

  const stopPelican = useCallback(() => {
    pelicanControllerRef.current?.abort()
  }, [])

  return useMemo(
    () => ({
      clearContextCapacityHistory: (target?: ApiVerificationHistoryTarget) => {
        if (
          target &&
          (!historyTarget ||
            serializeVerificationHistoryTarget(target) !==
              serializeVerificationHistoryTarget(historyTarget))
        )
          return
        contextCapacity.clearHistory()
        needle.clearHistory()
      },
      clearPelicanHistory: () => {
        runVersionRef.current += 1
        setPelicanSummary(null)
        setPelican(null)
        setPelicanErrorMessage(null)
        setPelicanStatus(VERIFICATION_TOOL_STATUSES.Idle)
      },
      isRunning: isPelicanRunning || contextCapacity.running || needle.running,
      needle: enableContextCapacity && isSupported ? needle : undefined,
      contextCapacity: {
        ...contextCapacity,
        canRun: contextCapacity.canRun && !needle.running,
      },
      canRunPelican: canRun,
      isPelicanRunning,
      pelicanStatus,
      pelicanSummary,
      pelican,
      pelicanErrorMessage,
      pelicanExecutionMode,
      setPelicanExecutionMode,
      runPelican,
      stopPelican,
      ...prompts,
    }),
    [
      canRun,
      isPelicanRunning,
      pelicanStatus,
      pelicanSummary,
      pelican,
      pelicanErrorMessage,
      pelicanExecutionMode,
      setPelicanExecutionMode,
      runPelican,
      stopPelican,
      prompts,
      contextCapacity,
      needle,
      enableContextCapacity,
      isSupported,
      historyTarget,
    ],
  )
}

export type { ApiVerificationProbePromptOverrides }
