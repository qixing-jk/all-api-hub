import { OctopusMutationApiError } from "~/services/apiService/octopus"
import {
  createManagedSiteMutationSequence,
  type ManagedSiteMutationConfirmedEffect,
} from "~/services/managedSites/mutations"
import type { OctopusApiResponse } from "~/types/octopus"
import { getErrorMessage } from "~/utils/core/error"

/** Distinguishes provider rejection from application while retaining diagnostics for boundary sanitization. */
const toOctopusMutationResponse = <TData>(
  response: OctopusApiResponse<TData>,
) =>
  response.success
    ? { outcome: "applied" as const, data: response.data }
    : {
        outcome: "rejected" as const,
        diagnostic: {
          message: getErrorMessage(
            response.message,
            "Provider rejected the mutation",
          ),
          raw: response,
        },
      }

/** Retains valid provider codes and raw local diagnostics without inventing an HTTP status. */
const toOctopusMutationDiagnostic = (error: OctopusMutationApiError) => {
  const diagnosticRaw = error.raw
  const code =
    typeof error.code === "string" ||
    (typeof error.code === "number" && Number.isSafeInteger(error.code))
      ? error.code
      : undefined
  const statusCode =
    typeof error.statusCode === "number" &&
    Number.isSafeInteger(error.statusCode) &&
    error.statusCode >= 100 &&
    error.statusCode <= 599
      ? error.statusCode
      : undefined
  return {
    message: getErrorMessage(error, "Octopus mutation failed"),
    ...(code === undefined ? {} : { code }),
    ...(statusCode === undefined ? {} : { statusCode }),
    raw: diagnosticRaw,
  }
}

/** Executes a non-idempotent mutation once and preserves uncertainty when application cannot be confirmed. */
export const runOctopusMutation = async <TData, TResult = TData>(input: {
  effect: ManagedSiteMutationConfirmedEffect
  execute(): Promise<OctopusApiResponse<TData>>
  successData?: (data: TData | null | undefined) => TResult
}) => {
  const sequence =
    createManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>({
      idempotent: false,
    })
  const attempt = sequence.beginStep()
  try {
    const response = await input.execute()
    attempt.markPossiblyDispatched()
    attempt.markResponseReceived()
    const classified = toOctopusMutationResponse(response)
    if (classified.outcome === "rejected") {
      attempt.confirmNonApplication()
      attempt.complete()
      return sequence.finish({
        finalState: "unconfirmed",
        diagnostic: classified.diagnostic,
      })
    }
    attempt.confirmEffect(input.effect)
    attempt.complete()
    return sequence.finish({
      finalState: "confirmed",
      data: input.successData
        ? input.successData(classified.data)
        : (classified.data as unknown as TResult),
    })
  } catch (error) {
    if (!(error instanceof OctopusMutationApiError)) throw error
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
      diagnostic: toOctopusMutationDiagnostic(error),
    })
  }
}

/** Describes a confirmed channel effect, omitting identity when the provider has not supplied one. */
export const octopusChannelEffect = (
  kind: ManagedSiteMutationConfirmedEffect["kind"],
  resourceId?: number,
): ManagedSiteMutationConfirmedEffect => ({
  kind,
  resourceKind: "channel",
  ...(resourceId === undefined ? {} : { resourceId }),
})
