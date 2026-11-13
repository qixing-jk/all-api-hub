import { useMemo } from "react"

import type { VerificationGenerationProgress } from "~/services/verification/aiApiVerification/generationProgress"
import type {
  ApiVerificationApiType,
  ApiVerificationProbePromptOverrides,
} from "~/services/verification/aiApiVerification/types"
import type { runContextCapacity } from "~/services/verification/modelQuality/contextCapacityRun"
import type { getModelContextInfo } from "~/services/verification/modelQuality/contextTokens"
import type {
  PelicanExecutionMode,
  PelicanTestResult,
} from "~/services/verification/modelQuality/pelican"
import type { runQuestionAnswerTest } from "~/services/verification/modelQuality/questionAnswer"
import {
  serializeVerificationHistoryTarget,
  type ApiVerificationHistoryTarget,
  type DrawingVerificationSummary,
} from "~/services/verification/verificationResultHistory"
import type { ContextCapacityHistoryAccess } from "~/services/verification/verificationResultHistory/contextCapacityHistory"
import type { NeedleHistoryAccess } from "~/services/verification/verificationResultHistory/needleHistory"
import { discardNeedleCheckpointsInBackground } from "~/services/verification/webAiApiCheck/needleClient"

import { type VerificationToolStatus } from "./types"
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
import { usePelicanTest } from "./usePelicanTest"
import {
  useQuestionAnswerTest,
  type QuestionAnswerController,
} from "./useQuestionAnswerTest"
import { useVerificationPrompts } from "./useVerificationPrompts"
import type {
  PelicanRunner,
  VerificationToolRequestParams,
} from "./verificationToolRequestTypes"

export {
  VERIFICATION_TOOL_STATUSES,
  type VerificationToolStatus,
} from "./types"
export type VerificationToolsController = {
  questionAnswer?: QuestionAnswerController
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
  pelicanProgress?: VerificationGenerationProgress
  pelicanStartedAt?: number
  pelican: PelicanTestResult | null
  pelicanErrorMessage: string | null
  pelicanExecutionMode: PelicanExecutionMode
  setPelicanExecutionMode: (mode: PelicanExecutionMode) => void
  runPelican: () => void
  stopPelican: () => void
} & ReturnType<typeof useVerificationPrompts>

export type UseVerificationToolsOptions = {
  runQuestionAnswerRequest?: typeof runQuestionAnswerTest
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
   * Runs the drawing test in the caller's execution context. Content scripts
   * delegate to the background without bundling the guest JavaScript runtime.
   */
  runPelicanRequest: PelicanRunner
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
  runPelicanRequest,
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
  runQuestionAnswerRequest,
}: UseVerificationToolsOptions): VerificationToolsController {
  const prompts = useVerificationPrompts()
  const historyKey = historyTarget
    ? serializeVerificationHistoryTarget(historyTarget)
    : null
  const contextKey = `${historyKey}:${historyApiType}:${contextCapacityKey}`
  const drawing = usePelicanTest({
    resolveRequest,
    historyTarget,
    historyApiType,
    isSupported,
    isBlocked,
    pelicanPrompt,
    runPelicanRequest,
    promptDraft: prompts.promptDraft,
  })
  const questionAnswer = useQuestionAnswerTest({
    contextKey,
    enabled: isSupported,
    blocked: isBlocked,
    resolveRequest,
    runner: runQuestionAnswerRequest,
  })
  const contextCapacity = useContextCapacity({
    enabled: enableContextCapacity && isSupported,
    blocked: isBlocked,
    contextKey,
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
    blocked: isBlocked,
    contextKey,
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
      questionAnswer: isSupported ? questionAnswer : undefined,
      isRunning:
        drawing.isPelicanRunning ||
        contextCapacity.running ||
        needle.running ||
        questionAnswer.running,
      needle: enableContextCapacity && isSupported ? needle : undefined,
      contextCapacity,
      ...drawing,
      ...prompts,
    }),
    [
      drawing,
      prompts,
      contextCapacity,
      needle,
      enableContextCapacity,
      isSupported,
      historyTarget,
      questionAnswer,
    ],
  )
}

export type { ApiVerificationProbePromptOverrides }
