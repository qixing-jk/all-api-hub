import type { NativeResourceMutationResult } from "~/services/apiAdapters/contracts/resourceNative"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type {
  ApiTransportRequest,
  ApiTransportRequestObserver,
} from "~/services/apiTransport/type"

type NativeResourceMutationEvidence = {
  readonly dispatched: boolean
  readonly responseReceived: boolean
}

type NativeResourceMutationErrorDisposition = "not-applied" | "possibly-applied"

const appendObserver = <TRequest extends ApiTransportRequest>(
  request: TRequest,
  observer: ApiTransportRequestObserver,
): TRequest => {
  const existing = request.observer
  return {
    ...request,
    observer: existing
      ? {
          ...existing,
          onDispatch() {
            try {
              existing.onDispatch()
            } finally {
              observer.onDispatch()
            }
          },
          onResponse() {
            try {
              existing.onResponse()
            } finally {
              observer.onResponse()
            }
          },
          onMutationAccepted() {
            try {
              existing.onMutationAccepted?.()
            } finally {
              observer.onMutationAccepted?.()
            }
          },
        }
      : observer,
  }
}

/** Returns true only for an explicit business rejection parsed by an API service. */
export const isApiBusinessError = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.code === API_ERROR_CODES.BUSINESS_ERROR &&
  error.statusCode !== 408 &&
  error.statusCode !== 499 &&
  (error.statusCode === undefined || error.statusCode < 500)

/**
 * A received client-error refusal can prove this request was not applied.
 * Timeout/cancellation statuses do not establish the upstream write outcome.
 * An earlier accepted write is accounted for separately by the runner.
 */
export const isConfirmedRejection = (error: unknown): boolean =>
  error instanceof ApiError &&
  typeof error.statusCode === "number" &&
  Number.isFinite(error.statusCode) &&
  error.statusCode >= 400 &&
  error.statusCode < 500 &&
  error.statusCode !== 408 &&
  error.statusCode !== 499

/**
 * Runs one native-resource write while keeping provider parsing in the Adapter
 * and transport lifecycle evidence out of orchestration.
 */
export async function runNativeResourceMutation<TValue, TFailure>(options: {
  readonly request: ApiTransportRequest
  readonly execute: (request: ApiTransportRequest) => Promise<TValue>
  readonly mapFailure: (error: unknown) => TFailure
  readonly classifyError?: (
    error: unknown,
    evidence: NativeResourceMutationEvidence,
  ) => NativeResourceMutationErrorDisposition | undefined
}): Promise<NativeResourceMutationResult<TValue, TFailure>> {
  let dispatched = false
  let responseReceived = false
  let mutationAccepted = false
  const request = appendObserver(options.request, {
    onDispatch() {
      dispatched = true
    },
    onResponse() {
      responseReceived = true
    },
    onMutationAccepted() {
      mutationAccepted = true
    },
  })

  try {
    return { certainty: "applied", value: await options.execute(request) }
  } catch (error) {
    // A later rejected request cannot undo an earlier accepted write.
    // Keep partial writes and failed readbacks out of the retryable branch.
    if (mutationAccepted) {
      return {
        certainty: "possibly-applied",
        failure: options.mapFailure(error),
      }
    }
    const evidence = { dispatched, responseReceived }
    // Adapters parse protocol envelopes into ApiError; common refusal policy
    // belongs here so a new adapter cannot accidentally lose error feedback.
    // An adapter may still supply evidence for a protocol-specific outcome.
    const disposition =
      options.classifyError?.(error, evidence) ??
      (isApiBusinessError(error) || isConfirmedRejection(error)
        ? "not-applied"
        : undefined)
    return {
      certainty:
        disposition === "not-applied"
          ? "not-applied"
          : disposition === "possibly-applied" || dispatched
            ? "possibly-applied"
            : "not-applied",
      failure: options.mapFailure(error),
    }
  }
}
