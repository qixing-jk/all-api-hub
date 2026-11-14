import type { VerificationGenerationMetrics } from "~/services/verification/aiApiVerification/generationMetrics"
import { createSafeGenerationProgressCallback } from "~/services/verification/aiApiVerification/generationProgress"
import type { VerificationProgressCallback } from "~/services/verification/aiApiVerification/generationProgress"
import { runProbeGeneration } from "~/services/verification/aiApiVerification/probes/probeGeneration"
import { createModel } from "~/services/verification/aiApiVerification/providers"
import { createVerificationProfileHeaders } from "~/services/verification/aiApiVerification/requestProfiles"
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification/types"

export const QUESTION_ANSWER_TEST_ID = "question-answer" as const

export type QuestionAnswerSettings = {
  question: string
  referenceAnswer: string
}

export type QuestionAnswerRequest = QuestionAnswerSettings & {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
  mode?: ApiVerificationMode
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: boolean
  requestHeaders?: Record<string, string>
  onProgress?: VerificationProgressCallback
  abortSignal?: AbortSignal
}

export const QUESTION_ANSWER_OUTCOMES = {
  Matched: "matched",
  Mismatched: "mismatched",
  Manual: "manual",
  Ungraded: "ungraded",
  Empty: "empty",
  Incomplete: "incomplete",
} as const
export type QuestionAnswerOutcome =
  (typeof QUESTION_ANSWER_OUTCOMES)[keyof typeof QUESTION_ANSWER_OUTCOMES]

export type QuestionAnswerResult = QuestionAnswerSettings & {
  text: string
  answer: string | null
  outcome: QuestionAnswerOutcome
  metrics?: VerificationGenerationMetrics[]
  latencyMs: number
}

/** Run one question; the reference answer is used locally and never sent upstream. */
export async function runQuestionAnswerTest(
  params: QuestionAnswerRequest,
): Promise<QuestionAnswerResult> {
  params.abortSignal?.throwIfAborted()
  if (!params.question.trim()) throw new Error("Question is required")
  const startedAt = Date.now()
  const automatic = Boolean(params.referenceAnswer.trim())
  const result = await runProbeGeneration(
    {
      model: createModel({
        ...params,
        requestHeaders: createVerificationProfileHeaders(
          params.requestProfile,
          params.requestHeaders,
          params.modelId,
          params.requestProfileEnhanced,
        ),
      }),
      prompt: params.question,
      ...(automatic
        ? {
            system:
              "Answer the question. Put your final short answer on the last line in this format: FINAL_ANSWER: <answer>",
          }
        : {}),
      onProgress: createSafeGenerationProgressCallback(params.onProgress, [
        params.apiKey,
        ...Object.values(params.requestHeaders ?? {}),
      ]),
      abortSignal: params.abortSignal,
      maxRetries: 0,
    },
    params.mode,
  )
  const text = result.text.trim()
  const normalize = (value: string) => value.normalize("NFKC").trim()
  const answer =
    text
      .split(/\r?\n/)
      .at(-1)
      ?.match(/^FINAL_ANSWER:\s*(.+)$/)?.[1]
      ?.trim() ??
    (normalize(text) === normalize(params.referenceAnswer) ? text : null)
  const outcome =
    result.finishReason !== "stop"
      ? QUESTION_ANSWER_OUTCOMES.Incomplete
      : !text
        ? QUESTION_ANSWER_OUTCOMES.Empty
        : !automatic
          ? QUESTION_ANSWER_OUTCOMES.Manual
          : !answer
            ? QUESTION_ANSWER_OUTCOMES.Ungraded
            : normalize(answer) === normalize(params.referenceAnswer)
              ? QUESTION_ANSWER_OUTCOMES.Matched
              : QUESTION_ANSWER_OUTCOMES.Mismatched
  return {
    question: params.question,
    referenceAnswer: params.referenceAnswer,
    text,
    metrics: result.metrics,
    answer,
    outcome,
    latencyMs: Date.now() - startedAt,
  }
}
