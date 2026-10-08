export interface GraphQLErrorPayload {
  message?: string
  extensions?: {
    code?: string
  }
}

interface GraphQLResponseEnvelope {
  data?: unknown
  errors?: GraphQLErrorPayload[]
}

export type AxonHubRequestFailureKind =
  | "authentication"
  | "permission"
  | "not-found"
  | "upstream-rejected"
  | "protocol"
  | "unavailable"
  | "aborted"

export type AxonHubRequestErrorDetails = {
  responseReceived?: boolean
  statusCode?: number
  code?: string
  raw?: unknown
  cause?: unknown
  safeMessage?: string
}

const toValidHttpStatusCode = (statusCode: number | undefined) =>
  statusCode !== undefined &&
  Number.isSafeInteger(statusCode) &&
  statusCode >= 100 &&
  statusCode <= 599
    ? statusCode
    : undefined

export class AxonHubRequestError extends Error {
  readonly responseReceived: boolean
  readonly statusCode?: number
  readonly code?: string
  readonly raw?: unknown
  override readonly cause?: unknown
  readonly safeMessage: string

  constructor(
    readonly kind: AxonHubRequestFailureKind,
    readonly dispatch: "not-dispatched" | "dispatched",
    message: string = kind,
    details: AxonHubRequestErrorDetails = {},
  ) {
    super(details.safeMessage ?? message)
    this.name = "AxonHubRequestError"
    this.responseReceived = details.responseReceived ?? false
    this.statusCode = toValidHttpStatusCode(details.statusCode)
    this.code = details.code
    this.raw = details.raw
    this.cause = details.cause ?? details.raw
    this.safeMessage = details.safeMessage ?? message
  }
}

export const isAbortError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  error.name === "AbortError"

export const throwIfAborted = (signal?: AbortSignal | null) => {
  if (signal?.aborted) {
    throw new AxonHubRequestError("aborted", "not-dispatched")
  }
}

export const toAxonHubRequestError = (
  error: unknown,
  dispatch: "not-dispatched" | "dispatched",
  fallbackKind: AxonHubRequestFailureKind,
) => {
  if (error instanceof AxonHubRequestError) {
    if (dispatch === "dispatched" && error.dispatch === "not-dispatched") {
      return new AxonHubRequestError(error.kind, dispatch, error.message, {
        responseReceived: error.responseReceived,
        statusCode: error.statusCode,
        code: error.code,
        raw: error.raw,
        cause: error.cause,
        safeMessage: error.safeMessage,
      })
    }
    return error
  }

  const kind = isAbortError(error) ? "aborted" : fallbackKind
  return new AxonHubRequestError(kind, dispatch, kind, {
    raw: error,
    cause: error,
  })
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const parseGraphqlEnvelope = (
  payload: unknown,
  details: Pick<
    AxonHubRequestErrorDetails,
    "responseReceived" | "statusCode"
  > & {
    dispatch: "not-dispatched" | "dispatched"
    raw?: unknown
  },
): GraphQLResponseEnvelope => {
  if (!isRecord(payload)) {
    throw new AxonHubRequestError(
      "protocol",
      details.dispatch,
      "protocol",
      details,
    )
  }

  const errors = payload.errors
  if (
    errors !== undefined &&
    (!Array.isArray(errors) ||
      errors.some(
        (error) =>
          !isRecord(error) ||
          (error.message !== undefined && typeof error.message !== "string") ||
          (error.extensions !== undefined &&
            (!isRecord(error.extensions) ||
              (error.extensions.code !== undefined &&
                typeof error.extensions.code !== "string"))),
      ))
  ) {
    throw new AxonHubRequestError(
      "protocol",
      details.dispatch,
      "protocol",
      details,
    )
  }

  return {
    data: payload.data,
    errors: errors as GraphQLErrorPayload[] | undefined,
  }
}

const GRAPHQL_AUTHENTICATION_ERROR_PATTERN =
  /unauthorized|unauthenticated|jwt expired|jwt invalid|invalid jwt|invalid token|expired token|session expired|access token expired|access token invalid|refresh token expired|refresh token invalid|malformed token|revoked token/i

const containsGraphqlError = (
  errors: GraphQLErrorPayload[] | undefined,
  pattern: RegExp,
) => errors?.some((error) => pattern.test(error.message ?? "")) ?? false

const hasGraphqlAuthenticationError = (
  errors: GraphQLErrorPayload[] | undefined,
) => containsGraphqlError(errors, GRAPHQL_AUTHENTICATION_ERROR_PATTERN)

const hasGraphqlErrorCode = (
  errors: GraphQLErrorPayload[] | undefined,
  code: string,
) => errors?.some((error) => error.extensions?.code === code) ?? false

const hasExplicitGraphqlErrorCode = (
  errors: GraphQLErrorPayload[] | undefined,
) => errors?.some((error) => error.extensions?.code !== undefined) ?? false

export const shouldRefreshAuthentication = (
  response: Response,
  errors: GraphQLErrorPayload[] | undefined,
) => {
  if (response.status >= 500 || response.status === 403) return false
  if (response.status === 401) return true
  if (hasGraphqlErrorCode(errors, "FORBIDDEN")) return false
  if (hasGraphqlErrorCode(errors, "UNAUTHENTICATED")) return true
  return false
}

export const classifyGraphqlFailure = (
  response: Response,
  errors: GraphQLErrorPayload[] | undefined,
): AxonHubRequestFailureKind => {
  if (response.status >= 500) return "unavailable"
  if (response.status === 401) return "authentication"
  if (response.status === 403) return "permission"
  if (
    response.status === 404 ||
    containsGraphqlError(errors, /not found|no .* found/i)
  ) {
    return "not-found"
  }
  if (hasGraphqlErrorCode(errors, "FORBIDDEN")) return "permission"
  if (hasGraphqlErrorCode(errors, "UNAUTHENTICATED")) return "authentication"
  if (!hasExplicitGraphqlErrorCode(errors)) {
    if (hasGraphqlAuthenticationError(errors)) return "authentication"
    if (
      containsGraphqlError(errors, /forbidden|permission denied|access denied/i)
    ) {
      return "permission"
    }
  }
  if (errors?.length) {
    return "upstream-rejected"
  }
  return "upstream-rejected"
}

const getGraphqlErrorCode = (errors: GraphQLErrorPayload[] | undefined) =>
  errors?.find((error) => error.extensions?.code)?.extensions?.code

export const isGraphqlMutationDocument = (document: string): boolean =>
  /^(?:(?:[\s,]+)|(?:#[^\r\n]*(?:\r\n|\r|\n|$)))*mutation\b/.test(document)

export const toGraphqlResponseError = (
  kind: AxonHubRequestFailureKind,
  dispatch: "not-dispatched" | "dispatched",
  response: Response,
  errors?: GraphQLErrorPayload[],
  raw?: unknown,
) =>
  new AxonHubRequestError(kind, dispatch, kind, {
    responseReceived: true,
    statusCode: response.status,
    code: getGraphqlErrorCode(errors),
    raw,
    cause: raw,
  })
