import { type ResourceFailure } from "~/services/apiAdapters/contracts/managedResourceNative"
import { type AxonHubNativeFailure } from "~/services/apiAdapters/managedResources/axonHubNativeContracts"
import {
  AxonHubRequestError,
  type AxonHubRequestFailureKind,
} from "~/services/apiService/axonHub/graphqlProtocol"

export class AxonHubNativeError extends Error {
  constructor(
    readonly failure: AxonHubNativeFailure,
    override readonly cause?: unknown,
  ) {
    super(failure.code)
    this.name = "AxonHubNativeError"
  }
}

export const normalizeOrigin = (value: string) => {
  const url = new URL(value.trim())
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("invalid origin")
  }
  return url.origin
}

const controlledNativeFailures = new WeakSet<object>()

export const createControlledNativeFailure = (
  code: AxonHubNativeFailure["code"],
  dispatch: AxonHubNativeFailure["dispatch"] = "before",
) => {
  const failure: AxonHubNativeFailure = { code, dispatch }
  controlledNativeFailures.add(failure)
  return failure
}

export const createNativeFailure = (
  code: AxonHubNativeFailure["code"],
  dispatch: AxonHubNativeFailure["dispatch"] = "before",
) => new AxonHubNativeError(createControlledNativeFailure(code, dispatch))

const AXON_HUB_NATIVE_FAILURE_CODES = new Set<string>([
  "configuration_required",
  "invalid_configuration",
  "authentication_failed",
  "permission_denied",
  "not_found",
  "unavailable",
  "upstream_rejected",
  "aborted",
  "unexpected",
])

const AXON_HUB_REQUEST_FAILURE_CODES = {
  authentication: "authentication_failed",
  permission: "permission_denied",
  "not-found": "not_found",
  "upstream-rejected": "upstream_rejected",
  protocol: "unexpected",
  unavailable: "unavailable",
  aborted: "aborted",
} as const satisfies Record<
  AxonHubRequestFailureKind,
  AxonHubNativeFailure["code"]
>

export const isAxonHubNativeFailure = (
  value: unknown,
): value is AxonHubNativeFailure =>
  typeof value === "object" &&
  value !== null &&
  controlledNativeFailures.has(value) &&
  "code" in value &&
  typeof value.code === "string" &&
  AXON_HUB_NATIVE_FAILURE_CODES.has(value.code) &&
  "dispatch" in value &&
  (value.dispatch === "before" || value.dispatch === "after")

export const mapRequestFailure = (error: unknown): AxonHubNativeError => {
  if (error instanceof AxonHubNativeError) return error
  if (!(error instanceof AxonHubRequestError)) {
    return new AxonHubNativeError(
      createControlledNativeFailure("unexpected"),
      error,
    )
  }

  const dispatch = error.dispatch === "dispatched" ? "after" : "before"
  return new AxonHubNativeError(
    createControlledNativeFailure(
      AXON_HUB_REQUEST_FAILURE_CODES[error.kind],
      dispatch,
    ),
    error,
  )
}

export const callRead = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw mapRequestFailure(error)
  }
}

export const mapFailure = (error: unknown): ResourceFailure => {
  const failure =
    error instanceof AxonHubNativeError
      ? error.failure
      : isAxonHubNativeFailure(error)
        ? error
        : mapRequestFailure(error).failure
  return { code: failure.code }
}
