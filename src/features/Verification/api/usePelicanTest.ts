import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { VerificationGenerationProgress } from "~/services/verification/aiApiVerification/generationProgress"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification/types"
import {
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import {
  DRAWING_VERIFICATION_OUTCOMES,
  PELICAN_EXECUTION_MODES,
} from "~/services/verification/modelQuality/constants"
import type {
  PelicanExecutionMode,
  PelicanTestResult,
} from "~/services/verification/modelQuality/pelican"
import { PELICAN_PROMPT_ID } from "~/services/verification/promptOverrides"
import {
  serializeVerificationHistoryTarget,
  verificationResultHistoryStorage,
  type ApiVerificationHistoryTarget,
  type DrawingVerificationSummary,
} from "~/services/verification/verificationResultHistory"
import { API_VERIFICATION_HISTORY_TARGET_KINDS } from "~/services/verification/verificationResultHistory/types"

import {
  VERIFICATION_TOOL_STATUSES,
  type VerificationToolStatus,
} from "./types"
import type { useVerificationPrompts } from "./useVerificationPrompts"
import type {
  PelicanRunner,
  VerificationToolRequestParams,
} from "./verificationToolRequestTypes"

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

/** Own drawing execution, cancellation and accepted history independently of the tool collection. */
export function usePelicanTest({
  resolveRequest,
  historyTarget,
  historyApiType,
  isSupported,
  isBlocked,
  pelicanPrompt,
  runPelicanRequest,
  promptDraft,
}: {
  resolveRequest: (
    signal: AbortSignal,
  ) => Promise<VerificationToolRequestParams | null>
  historyTarget?: ApiVerificationHistoryTarget | null
  historyApiType?: ApiVerificationApiType
  isSupported: boolean
  isBlocked: boolean
  pelicanPrompt?: string
  runPelicanRequest: PelicanRunner
  promptDraft: ReturnType<typeof useVerificationPrompts>["promptDraft"]
}) {
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
  const [pelicanProgress, setPelicanProgress] =
    useState<VerificationGenerationProgress>()
  const [pelicanStartedAt, setPelicanStartedAt] = useState<number>()
  const [pelican, setPelican] = useState<PelicanTestResult | null>(null)
  const [pelicanErrorMessage, setPelicanErrorMessage] = useState<string | null>(
    null,
  )

  const pelicanControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    const runVersion = runVersionRef.current
    pelicanControllerRef.current?.abort()
    pelicanControllerRef.current = null
    setPelican(null)
    setPelicanProgress(undefined)
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
  const canRun = isSupported && !isBlocked && !isPelicanRunning

  const setPelicanExecutionMode = useCallback((mode: PelicanExecutionMode) => {
    if (pelicanControllerRef.current) return
    setExecutionMode(mode)
    setPelican(null)
    setPelicanProgress(undefined)
    setPelicanErrorMessage(null)
    setPelicanStatus(VERIFICATION_TOOL_STATUSES.Idle)
  }, [])

  const runPelican = useCallback(() => {
    if (!canRun || pelicanControllerRef.current) return
    runVersionRef.current += 1

    const controller = new AbortController()
    pelicanControllerRef.current = controller

    setPelicanStartedAt(Date.now())
    setPelicanStatus(VERIFICATION_TOOL_STATUSES.Running)
    setPelican(null)
    setPelicanProgress(undefined)
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
          onProgress: (progress) => {
            if (
              pelicanControllerRef.current === controller &&
              !controller.signal.aborted
            )
              setPelicanProgress(progress)
          },
          abortSignal: controller.signal,
        })

        if (pelicanControllerRef.current !== controller) return
        setPelican(result)
        if (targetToSave) {
          const summary = buildDrawingSummary(targetToSave, request, {
            metrics: result.metrics,
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
      clearPelicanHistory: () => {
        runVersionRef.current += 1
        setPelicanSummary(null)
        setPelican(null)
        setPelicanProgress(undefined)
        setPelicanErrorMessage(null)
        setPelicanStatus(VERIFICATION_TOOL_STATUSES.Idle)
      },
      canRunPelican: canRun,
      isPelicanRunning,
      pelicanStatus,
      pelicanSummary,
      pelican,
      pelicanProgress,
      pelicanStartedAt,
      pelicanErrorMessage,
      pelicanExecutionMode,
      setPelicanExecutionMode,
      runPelican,
      stopPelican,
    }),
    [
      canRun,
      isPelicanRunning,
      pelicanStatus,
      pelicanSummary,
      pelican,
      pelicanProgress,
      pelicanStartedAt,
      pelicanErrorMessage,
      pelicanExecutionMode,
      setPelicanExecutionMode,
      runPelican,
      stopPelican,
    ],
  )
}
