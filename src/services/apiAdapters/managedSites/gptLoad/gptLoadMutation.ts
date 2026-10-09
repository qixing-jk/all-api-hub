import { GptLoadApiError } from "~/services/apiService/gptLoad"
import { type ManagedSiteMutationConfirmedEffect } from "~/services/managedSites/mutations/contracts"
import {
  createManagedSiteMutationSequence,
  type ManagedSiteMutationStepAttempt,
} from "~/services/managedSites/mutations/execution"
import { getErrorMessage } from "~/utils/core/error"

export const gptLoadChannelEffect = (
  kind: ManagedSiteMutationConfirmedEffect["kind"],
  resourceId?: number,
): ManagedSiteMutationConfirmedEffect => ({
  kind,
  resourceKind: "channel",
  ...(resourceId === undefined ? {} : { resourceId: String(resourceId) }),
})

const toGptLoadDiagnostic = (error: GptLoadApiError) => {
  const code =
    typeof error.code === "string" ||
    (typeof error.code === "number" && Number.isSafeInteger(error.code))
      ? error.code
      : undefined
  const statusCode =
    typeof error.status === "number" &&
    Number.isSafeInteger(error.status) &&
    error.status >= 100 &&
    error.status <= 599
      ? error.status
      : undefined
  return {
    message: getErrorMessage(error, "gpt-load mutation failed"),
    ...(code === undefined ? {} : { code }),
    ...(statusCode === undefined ? {} : { statusCode }),
    raw: error,
  }
}

/**
 * Preserves mutation certainty for gpt-load resource operations.
 *
 * `callGptLoad` records whether the request left, whether a response came back,
 * and whether a 4xx proved non-application, so a 5xx is reported as an
 * unconfirmed state rather than a clean failure.
 */
export const runGptLoadMutation = async <TData, TResult = TData>(input: {
  effect: ManagedSiteMutationConfirmedEffect
  execute(): Promise<TData>
  /** Separate writes from the final read so each applied step is retained. */
  steps?: readonly (() => Promise<unknown>)[]
  successData?: (data: TData) => TResult
}) => {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  let attempt:
    | ManagedSiteMutationStepAttempt<ManagedSiteMutationConfirmedEffect>
    | undefined
  try {
    for (const step of input.steps ?? []) {
      attempt = sequence.beginStep()
      await step()
      attempt.markPossiblyDispatched()
      attempt.markResponseReceived()
      attempt.confirmEffect(input.effect)
      attempt.complete()
      attempt = undefined
    }
    if (input.steps === undefined) attempt = sequence.beginStep()
    const data = await input.execute()
    if (attempt) {
      attempt.markPossiblyDispatched()
      attempt.markResponseReceived()
      attempt.confirmEffect(input.effect)
      attempt.complete()
    }
    return sequence.finish({
      finalState: "confirmed",
      data: input.successData
        ? input.successData(data)
        : (data as unknown as TResult),
    })
  } catch (error) {
    if (input.steps !== undefined && !attempt) {
      return sequence.finish({
        finalState: "unconfirmed",
        diagnostic: {
          message: getErrorMessage(error, "gpt-load readback failed"),
          raw: error,
        },
      })
    }
    if (!attempt || !(error instanceof GptLoadApiError) || !error.dispatch) {
      throw error
    }
    if (error.dispatch === "dispatched") attempt.markPossiblyDispatched()
    if (error.responseReceived) attempt.markResponseReceived()
    if (
      error.confirmedNonApplication &&
      error.dispatch === "dispatched" &&
      error.responseReceived
    ) {
      attempt.confirmNonApplication()
    }
    attempt.complete()
    return sequence.finish({
      finalState: "unconfirmed",
      diagnostic: toGptLoadDiagnostic(error),
    })
  }
}
