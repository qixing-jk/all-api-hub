import { OmniRouteApiError } from "~/services/apiService/omniroute"
import {
  createManagedSiteMutationSequence,
  type ManagedSiteMutationConfirmedEffect,
} from "~/services/managedSites/mutations"
import { getErrorMessage } from "~/utils/core/error"

export const omniRouteChannelEffect = (
  kind: ManagedSiteMutationConfirmedEffect["kind"],
  resourceId?: string,
): ManagedSiteMutationConfirmedEffect => ({
  kind,
  resourceKind: "channel",
  ...(resourceId === undefined ? {} : { resourceId }),
})

const toOmniRouteDiagnostic = (error: OmniRouteApiError) => {
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
    message: getErrorMessage(error, "OmniRoute mutation failed"),
    ...(code === undefined ? {} : { code }),
    ...(statusCode === undefined ? {} : { statusCode }),
    raw: error,
  }
}

/**
 * Preserves mutation certainty for OmniRoute resource operations.
 *
 * `callOmniRoute` records whether the request left, whether a response came
 * back, and whether a 4xx proved non-application, so a 5xx is reported as an
 * unconfirmed state rather than a clean failure.
 */
export const runOmniRouteMutation = async <TData, TResult = TData>(input: {
  effect: ManagedSiteMutationConfirmedEffect
  execute(): Promise<TData>
  successData?: (data: TData) => TResult
}) => {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  const attempt = sequence.beginStep()
  try {
    const data = await input.execute()
    attempt.markPossiblyDispatched()
    attempt.markResponseReceived()
    attempt.confirmEffect(input.effect)
    attempt.complete()
    return sequence.finish({
      finalState: "confirmed",
      data: input.successData
        ? input.successData(data)
        : (data as unknown as TResult),
    })
  } catch (error) {
    if (!(error instanceof OmniRouteApiError) || !error.dispatch) {
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
      diagnostic: toOmniRouteDiagnostic(error),
    })
  }
}
