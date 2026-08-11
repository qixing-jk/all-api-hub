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
        }
      : observer,
  }
}

/** Returns true only for an explicit business rejection parsed by an API service. */
export const isApiBusinessError = (error: unknown): boolean =>
  error instanceof ApiError && error.code === API_ERROR_CODES.BUSINESS_ERROR

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
  const request = appendObserver(options.request, {
    onDispatch() {
      dispatched = true
    },
    onResponse() {
      responseReceived = true
    },
  })

  try {
    return { certainty: "applied", value: await options.execute(request) }
  } catch (error) {
    const evidence = { dispatched, responseReceived }
    const disposition = options.classifyError?.(error, evidence)
    if (disposition === "not-applied") {
      return {
        certainty: "not-applied",
        failure: options.mapFailure(error),
      }
    }
    if (disposition === "possibly-applied" || dispatched) {
      return {
        certainty: "possibly-applied",
        failure: options.mapFailure(error),
      }
    }
    throw error
  }
}
