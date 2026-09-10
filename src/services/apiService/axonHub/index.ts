import { AXON_HUB_GRAPHQL_ERROR_CODES } from "~/constants/axonHub"
import type {
  AxonHubChannel,
  AxonHubChannelMutationReceipt,
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"
import { normalizeList } from "~/utils/core/string"

// Keep channel-list reads limited to non-secret summary fields and sanitize
// over-returned nodes before exposing native resource summaries.
const AXON_HUB_CHANNEL_LIST_SELECTION = `
  id
  type
  baseURL
  name
  status
  tags
  supportedModels
  manualModels
`

// This is the minimum detail contract required by AxonHub editing and
// credential handling. Optional advanced aggregates are queried separately so
// their schema drift can safely fall back without disabling core management.
const AXON_HUB_CHANNEL_CORE_DETAIL_SELECTION = `
  __typename
  id
  createdAt
  updatedAt
  type
  baseURL
  name
  status
  credentials {
    apiKey
    apiKeys
  }
  supportedModels
  autoSyncSupportedModels
  autoSyncModelPattern
  manualModels
  tags
  defaultTestModel
  orderingWeight
  errorMessage
  remark
`

// Keep detail reads aligned with product-owned display, edit-safety, and
// migration facts. In particular, do not round-trip ChannelSettings: AxonHub
// replaces that aggregate and beta9 already added members unknown to older
// clients. Sources: https://github.com/looplj/axonhub/blob/v1.0.0-beta8/internal/server/biz/channel.go
// and https://github.com/looplj/axonhub/blob/v1.0.0-beta9/internal/server/gql/axonhub.graphql
const AXON_HUB_CHANNEL_DETAIL_SELECTION = `
  __typename
  id
  createdAt
  updatedAt
  type
  baseURL
  name
  status
  policies {
    stream
  }
  credentials {
    apiKey
    apiKeys
    gcp {
      region
      projectID
      jsonData
    }
    oauth {
      accessToken
      refreshToken
      clientID
      expiresAt
      tokenType
      scopes
    }
  }
  supportedModels
  autoSyncSupportedModels
  autoSyncModelPattern
  manualModels
  tags
  defaultTestModel
  settings {
    extraModelPrefix
    modelMappings {
      from
      to
    }
  }
  orderingWeight
  errorMessage
  remark
  endpoints {
    apiFormat
    path
    baseURL
    transport
  }
`

// Mutation responses are receipts, not detail reads. Keeping this projection
// narrow prevents unrelated Channel fields from making every write invalid.
const AXON_HUB_CHANNEL_MUTATION_SELECTION = `
  __typename
  id
  type
  baseURL
  name
  status
`

const LIST_AXON_HUB_CHANNEL_PAGE = `
  query ListAxonHubChannelPage($input: QueryChannelInput!) {
    queryChannels(input: $input) {
      edges {
        node {
          ${AXON_HUB_CHANNEL_LIST_SELECTION}
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`

const GET_AXON_HUB_CHANNEL = `
  query GetAxonHubChannel($id: ID!) {
    node(id: $id) {
      ... on Channel {
        ${AXON_HUB_CHANNEL_DETAIL_SELECTION}
      }
    }
  }
`

const GET_AXON_HUB_CHANNEL_CORE = `
  query GetAxonHubChannelCore($id: ID!) {
    node(id: $id) {
      ... on Channel {
        ${AXON_HUB_CHANNEL_CORE_DETAIL_SELECTION}
      }
    }
  }
`

const CREATE_CHANNEL = `
  mutation CreateChannel($input: CreateChannelInput!) {
    createChannel(input: $input) {
      ${AXON_HUB_CHANNEL_MUTATION_SELECTION}
    }
  }
`

const UPDATE_CHANNEL = `
  mutation UpdateChannel($id: ID!, $input: UpdateChannelInput!) {
    updateChannel(id: $id, input: $input) {
      ${AXON_HUB_CHANNEL_MUTATION_SELECTION}
    }
  }
`

const UPDATE_CHANNEL_STATUS = `
  mutation UpdateChannelStatus($id: ID!, $status: ChannelStatus!) {
    updateChannelStatus(id: $id, status: $status) {
      __typename
      id
      status
    }
  }
`

const DELETE_CHANNEL = `
  mutation DeleteChannel($id: ID!) {
    deleteChannel(id: $id)
  }
`

interface GraphQLErrorPayload {
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

type AxonHubRequestErrorDetails = {
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

export type AxonHubChannelPage = {
  items: AxonHubChannel[]
  total?: number
  nextCursor?: string
}

type AxonHubChannelStatusResult = Pick<AxonHubChannel, "id" | "status">

const tokenCache = new Map<string, string>()
const inflightSignIns = new Map<string, Promise<string>>()
const advancedDetailUnsupportedScopes = new Set<string>()
const incompleteAdvancedDetails = new WeakSet<object>()

const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, "")

const cacheKeyForConfig = (config: AxonHubConfig) =>
  `${normalizeBaseUrl(config.baseUrl)}|${config.email.trim().toLowerCase()}`

const invalidateDetailSchemaCapabilityCache = (config: AxonHubConfig) => {
  const scopeKey = cacheKeyForConfig(config)
  advancedDetailUnsupportedScopes.delete(scopeKey)
}

export const __resetCachesForTesting = () => {
  tokenCache.clear()
  inflightSignIns.clear()
  advancedDetailUnsupportedScopes.clear()
}

const isAbortError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  error.name === "AbortError"

const throwIfAborted = (signal?: AbortSignal | null) => {
  if (signal?.aborted) {
    throw new AxonHubRequestError("aborted", "not-dispatched")
  }
}

const toAxonHubRequestError = (
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0

const isNullableString = (value: unknown) =>
  value === undefined || value === null || typeof value === "string"

const isNullableNumber = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "number" && Number.isFinite(value))

const isNullableStringArray = (value: unknown) =>
  value === undefined ||
  value === null ||
  (Array.isArray(value) && value.every((item) => typeof item === "string"))

const isAxonHubChannelCore = (value: unknown): value is AxonHubChannel =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  typeof value.name === "string" &&
  typeof value.type === "string" &&
  typeof value.status === "string" &&
  (typeof value.baseURL === "string" || value.baseURL === null) &&
  isNullableString(value.createdAt) &&
  isNullableString(value.updatedAt) &&
  isNullableStringArray(value.tags) &&
  isNullableStringArray(value.supportedModels) &&
  isNullableStringArray(value.manualModels) &&
  isNullableString(value.defaultTestModel) &&
  isNullableNumber(value.orderingWeight) &&
  isNullableString(value.errorMessage) &&
  isNullableString(value.remark)

// Authoritative detail/mutation output nullability follows the pinned beta5
// Channel schemas, not the more permissive input/TypeScript shapes:
// https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/ent.graphql
// https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/axonhub.graphql
const isOutputNullableString = (value: unknown) =>
  value === null || typeof value === "string"

const isOutputNullableBoolean = (value: unknown) =>
  value === null || typeof value === "boolean"

const isOutputStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

const isOutputNullableStringArray = (value: unknown) =>
  value === null || isOutputStringArray(value)

const isOutputOAuthCredentials = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    isOutputNullableString(value.accessToken) &&
    isOutputNullableString(value.refreshToken) &&
    isOutputNullableString(value.clientID) &&
    isOutputNullableString(value.expiresAt) &&
    isOutputNullableString(value.tokenType) &&
    isOutputNullableStringArray(value.scopes))

const isOutputGcpCredential = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    typeof value.region === "string" &&
    typeof value.projectID === "string" &&
    typeof value.jsonData === "string")

const isOutputPrimaryCredentials = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    isOutputNullableString(value.apiKey) &&
    isOutputNullableStringArray(value.apiKeys))

const isOutputCredentials = (value: unknown) =>
  value === null ||
  (isOutputPrimaryCredentials(value) &&
    isRecord(value) &&
    isOutputGcpCredential(value.gcp) &&
    isOutputOAuthCredentials(value.oauth))

const isOutputModelMappings = (value: unknown) =>
  value === null ||
  (Array.isArray(value) &&
    value.every(
      (mapping) =>
        isRecord(mapping) &&
        typeof mapping.from === "string" &&
        typeof mapping.to === "string",
    ))

const isOutputSettings = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    isOutputNullableString(value.extraModelPrefix) &&
    isOutputModelMappings(value.modelMappings))

const isOutputPolicies = (value: unknown) =>
  value === null || (isRecord(value) && isOutputNullableString(value.stream))

const isOutputEndpoints = (value: unknown) =>
  value === null ||
  (Array.isArray(value) &&
    value.every(
      (endpoint) =>
        isRecord(endpoint) &&
        typeof endpoint.apiFormat === "string" &&
        isOutputNullableString(endpoint.path) &&
        isOutputNullableString(endpoint.baseURL) &&
        isOutputNullableString(endpoint.transport),
    ))

const isAuthoritativeAxonHubChannel = (
  value: unknown,
): value is AxonHubChannel & { __typename: "Channel" } =>
  isRecord(value) &&
  value.__typename === "Channel" &&
  isNonEmptyString(value.id) &&
  typeof value.createdAt === "string" &&
  typeof value.updatedAt === "string" &&
  typeof value.type === "string" &&
  isOutputNullableString(value.baseURL) &&
  typeof value.name === "string" &&
  typeof value.status === "string" &&
  isOutputPolicies(value.policies) &&
  isOutputCredentials(value.credentials) &&
  isOutputStringArray(value.supportedModels) &&
  typeof value.autoSyncSupportedModels === "boolean" &&
  isOutputNullableString(value.autoSyncModelPattern) &&
  isOutputNullableStringArray(value.manualModels) &&
  isOutputNullableStringArray(value.tags) &&
  typeof value.defaultTestModel === "string" &&
  isOutputSettings(value.settings) &&
  typeof value.orderingWeight === "number" &&
  Number.isInteger(value.orderingWeight) &&
  isOutputNullableString(value.errorMessage) &&
  isOutputNullableString(value.remark) &&
  isOutputEndpoints(value.endpoints)

const isAxonHubChannelCoreDetail = (
  value: unknown,
): value is AxonHubChannel & { __typename: "Channel" } =>
  isRecord(value) &&
  value.__typename === "Channel" &&
  isNonEmptyString(value.id) &&
  typeof value.createdAt === "string" &&
  typeof value.updatedAt === "string" &&
  typeof value.type === "string" &&
  isOutputNullableString(value.baseURL) &&
  typeof value.name === "string" &&
  typeof value.status === "string" &&
  isOutputPrimaryCredentials(value.credentials) &&
  isOutputStringArray(value.supportedModels) &&
  isOutputNullableBoolean(value.autoSyncSupportedModels) &&
  isOutputNullableString(value.autoSyncModelPattern) &&
  isOutputNullableStringArray(value.manualModels) &&
  isOutputNullableStringArray(value.tags) &&
  typeof value.defaultTestModel === "string" &&
  typeof value.orderingWeight === "number" &&
  Number.isInteger(value.orderingWeight) &&
  isOutputNullableString(value.errorMessage) &&
  isOutputNullableString(value.remark)

const isAxonHubChannelMutationProjection = (
  value: unknown,
): value is AxonHubChannelMutationReceipt =>
  isRecord(value) &&
  value.__typename === "Channel" &&
  isNonEmptyString(value.id) &&
  typeof value.type === "string" &&
  isOutputNullableString(value.baseURL) &&
  typeof value.name === "string" &&
  typeof value.status === "string"

const toSafeAxonHubChannelSummary = (value: unknown): AxonHubChannel | null => {
  if (!isAxonHubChannelCore(value)) return null

  return {
    id: value.id,
    name: value.name,
    type: value.type,
    status: value.status,
    baseURL: value.baseURL,
    tags: value.tags as string[] | null | undefined,
    supportedModels: value.supportedModels as string[] | null | undefined,
    manualModels: value.manualModels as string[] | null | undefined,
  }
}

const parseGraphqlEnvelope = (
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

/**
 * Sign in to AxonHub admin and cache the returned session token.
 */
export async function signIn(
  config: AxonHubConfig,
  options?: Pick<RequestInit, "signal">,
): Promise<string> {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  throwIfAborted(options?.signal)

  let response: Response
  try {
    response = await fetch(`${baseUrl}/admin/auth/signin`, {
      method: "POST",
      signal: options?.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: config.email,
        password: config.password,
      }),
    })
  } catch (error) {
    throw toAxonHubRequestError(error, "not-dispatched", "unavailable")
  }

  if (!response.ok) {
    throw new AxonHubRequestError(
      response.status >= 500 ? "unavailable" : "authentication",
      "not-dispatched",
    )
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (error) {
    throw toAxonHubRequestError(error, "not-dispatched", "protocol")
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("token" in data) ||
    typeof data.token !== "string" ||
    !data.token
  ) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }

  tokenCache.set(cacheKeyForConfig(config), data.token)
  // A successful authentication is a bounded capability-renewal boundary: a
  // deployment may have upgraded since an optional detail shape was rejected.
  invalidateDetailSchemaCapabilityCache(config)
  return data.token
}

const getSessionToken = async (
  config: AxonHubConfig,
  forceRefresh = false,
  options?: Pick<RequestInit, "signal">,
) => {
  const key = cacheKeyForConfig(config)
  const callerSignal = options?.signal ?? undefined
  const hasCallerCancellation = Boolean(callerSignal)
  if (!forceRefresh) {
    const cachedToken = tokenCache.get(key)
    if (cachedToken) return cachedToken

    const inflightSignIn = inflightSignIns.get(key)
    if (inflightSignIn) {
      if (callerSignal) {
        return awaitSignInWithCallerCancellation(inflightSignIn, callerSignal)
      }

      return inflightSignIn
    }
  }

  tokenCache.delete(key)
  if (!hasCallerCancellation || forceRefresh) {
    inflightSignIns.delete(key)
  }

  if (hasCallerCancellation) {
    return signIn(config, options)
  }

  const pendingSignIn = signIn(config, options).finally(() => {
    inflightSignIns.delete(key)
  })

  inflightSignIns.set(key, pendingSignIn)
  return pendingSignIn
}

const awaitSignInWithCallerCancellation = async (
  pendingSignIn: Promise<string>,
  callerSignal: AbortSignal,
) => {
  let abort: (() => void) | null = null
  try {
    return await Promise.race([
      pendingSignIn,
      new Promise<string>((_resolve, reject) => {
        abort = () => {
          reject(new AxonHubRequestError("aborted", "not-dispatched"))
        }

        if (callerSignal.aborted) {
          abort()
          return
        }

        callerSignal.addEventListener("abort", abort, { once: true })
      }),
    ])
  } finally {
    if (abort) {
      callerSignal.removeEventListener("abort", abort)
    }
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

const shouldRefreshAuthentication = (
  response: Response,
  errors: GraphQLErrorPayload[] | undefined,
) => {
  if (response.status >= 500 || response.status === 403) return false
  if (response.status === 401) return true
  if (hasGraphqlErrorCode(errors, "FORBIDDEN")) return false
  if (hasGraphqlErrorCode(errors, "UNAUTHENTICATED")) return true
  return false
}

const classifyGraphqlFailure = (
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

const isGraphqlMutationDocument = (document: string): boolean =>
  /^(?:(?:[\s,]+)|(?:#[^\r\n]*(?:\r\n|\r|\n|$)))*mutation\b/.test(document)

const toGraphqlResponseError = (
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

/**
 * Execute an authenticated AxonHub admin GraphQL request with one auth retry.
 */
export async function graphqlRequest<T>(
  config: AxonHubConfig,
  query: string,
  variables?: Record<string, unknown>,
  options?: { retryAuth?: boolean } & Pick<RequestInit, "signal">,
): Promise<T> {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const retryAuth = options?.retryAuth ?? true
  const isMutation = isGraphqlMutationDocument(query)
  let mutationDispatched = false

  type GraphqlAttempt = { kind: "data"; data: T } | { kind: "retry-auth" }

  const retryAuthentication = (): GraphqlAttempt => ({ kind: "retry-auth" })

  const execute = async (
    sessionToken: string,
    allowAuthRetry: boolean,
  ): Promise<GraphqlAttempt> => {
    throwIfAborted(options?.signal)

    let response: Response
    try {
      if (isMutation) {
        mutationDispatched = true
      }
      response = await fetch(`${baseUrl}/admin/graphql`, {
        method: "POST",
        signal: options?.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ query, variables }),
      })
    } catch (error) {
      throw toAxonHubRequestError(
        error,
        isMutation ? "dispatched" : "not-dispatched",
        "unavailable",
      )
    }

    const dispatch = isMutation ? "dispatched" : "not-dispatched"
    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      if (isAbortError(error)) {
        throw toAxonHubRequestError(error, dispatch, "protocol")
      }
      if (allowAuthRetry && shouldRefreshAuthentication(response, undefined)) {
        return retryAuthentication()
      }
      if (!response.ok) {
        throw toGraphqlResponseError(
          classifyGraphqlFailure(response, undefined),
          dispatch,
          response,
          undefined,
          error,
        )
      }
      throw toGraphqlResponseError(
        "protocol",
        dispatch,
        response,
        undefined,
        error,
      )
    }

    const graphqlPayload = parseGraphqlEnvelope(payload, {
      dispatch,
      responseReceived: true,
      statusCode: response.status,
      raw: payload,
    })

    if (response.status >= 500) {
      throw toGraphqlResponseError(
        "unavailable",
        dispatch,
        response,
        graphqlPayload.errors,
        payload,
      )
    }
    if (response.status === 401) {
      if (allowAuthRetry) return retryAuthentication()
      throw toGraphqlResponseError(
        "authentication",
        dispatch,
        response,
        graphqlPayload.errors,
        payload,
      )
    }
    if (response.status === 403) {
      throw toGraphqlResponseError(
        "permission",
        dispatch,
        response,
        graphqlPayload.errors,
        payload,
      )
    }

    if (!response.ok || graphqlPayload.errors?.length) {
      if (
        allowAuthRetry &&
        shouldRefreshAuthentication(response, graphqlPayload.errors)
      ) {
        return retryAuthentication()
      }

      throw toGraphqlResponseError(
        classifyGraphqlFailure(response, graphqlPayload.errors),
        dispatch,
        response,
        graphqlPayload.errors,
        payload,
      )
    }

    if (graphqlPayload.data === undefined || graphqlPayload.data === null) {
      throw toGraphqlResponseError(
        "protocol",
        dispatch,
        response,
        undefined,
        payload,
      )
    }

    return { kind: "data", data: graphqlPayload.data as T }
  }

  try {
    throwIfAborted(options?.signal)
    const token = await getSessionToken(config, false, options)
    const firstAttempt = await execute(token, retryAuth && !isMutation)
    if (firstAttempt.kind === "data") return firstAttempt.data

    // Cached admin JWTs are session-scoped and may expire while the extension
    // page remains open; retry once with fresh credentials before surfacing.
    const refreshedToken = await getSessionToken(config, true, options)
    const secondAttempt = await execute(refreshedToken, false)
    if (secondAttempt.kind !== "data") {
      throw new AxonHubRequestError(
        "protocol",
        isMutation ? "dispatched" : "not-dispatched",
      )
    }
    return secondAttempt.data
  } catch (error) {
    throw toAxonHubRequestError(
      error,
      isMutation && mutationDispatched ? "dispatched" : "not-dispatched",
      "unavailable",
    )
  }
}

const requestAxonHubChannelPage = async (
  config: AxonHubConfig,
  input: { cursor?: string; limit: number },
  query: string,
  options?: Pick<RequestInit, "signal">,
): Promise<AxonHubChannelPage> => {
  const data = await graphqlRequest<unknown>(
    config,
    query,
    {
      input: {
        first: input.limit,
        ...(input.cursor ? { after: input.cursor } : {}),
      },
    },
    options,
  )

  if (!isRecord(data) || !isRecord(data.queryChannels)) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }
  const connection = data.queryChannels
  if (!Array.isArray(connection.edges) || !isRecord(connection.pageInfo)) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }
  if (
    typeof connection.pageInfo.hasNextPage !== "boolean" ||
    (connection.pageInfo.endCursor !== null &&
      typeof connection.pageInfo.endCursor !== "string") ||
    (connection.pageInfo.hasNextPage &&
      !isNonEmptyString(connection.pageInfo.endCursor)) ||
    (connection.totalCount !== undefined &&
      (typeof connection.totalCount !== "number" ||
        !Number.isInteger(connection.totalCount) ||
        connection.totalCount < 0))
  ) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }

  const items: AxonHubChannel[] = []
  for (const edge of connection.edges) {
    if (
      !isRecord(edge) ||
      (edge.cursor !== undefined &&
        edge.cursor !== null &&
        typeof edge.cursor !== "string")
    ) {
      throw new AxonHubRequestError("protocol", "not-dispatched")
    }
    const channel = toSafeAxonHubChannelSummary(edge.node)
    if (!channel) {
      throw new AxonHubRequestError("protocol", "not-dispatched")
    }
    items.push(channel)
  }

  const nextCursor = connection.pageInfo.hasNextPage
    ? (connection.pageInfo.endCursor as string)
    : undefined

  return {
    items,
    ...(typeof connection.totalCount === "number"
      ? { total: connection.totalCount }
      : {}),
    ...(nextCursor ? { nextCursor } : {}),
  }
}

/**
 * Return exactly one native AxonHub cursor page.
 */
export async function listAxonHubChannelPage(
  config: AxonHubConfig,
  input: { cursor?: string; limit: number },
  options?: Pick<RequestInit, "signal">,
): Promise<AxonHubChannelPage> {
  return requestAxonHubChannelPage(
    config,
    input,
    LIST_AXON_HUB_CHANNEL_PAGE,
    options,
  )
}

const isAxonHubSchemaValidationError = (error: unknown) =>
  error instanceof AxonHubRequestError &&
  error.code === AXON_HUB_GRAPHQL_ERROR_CODES.VALIDATION_FAILED

const requestAxonHubChannelNode = async (
  config: AxonHubConfig,
  id: string,
  query: string,
  options?: Pick<RequestInit, "signal">,
) => {
  const data = await graphqlRequest<unknown>(config, query, { id }, options)
  if (!isRecord(data) || !("node" in data)) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }
  if (data.node === null) {
    throw new AxonHubRequestError("not-found", "not-dispatched")
  }
  return data.node
}

/** Returns whether an AxonHub detail read included all optional aggregates. */
export const hasCompleteAxonHubAdvancedDetail = (
  channel: AxonHubChannel,
): boolean => !incompleteAdvancedDetails.has(channel)

/**
 * Load one native AxonHub channel by its opaque GraphQL id.
 */
export async function getAxonHubChannel(
  config: AxonHubConfig,
  id: string,
  options?: Pick<RequestInit, "signal">,
): Promise<AxonHubChannel> {
  const scopeKey = cacheKeyForConfig(config)
  let complete = !advancedDetailUnsupportedScopes.has(scopeKey)
  let node: unknown
  try {
    node = await requestAxonHubChannelNode(
      config,
      id,
      complete ? GET_AXON_HUB_CHANNEL : GET_AXON_HUB_CHANNEL_CORE,
      options,
    )
  } catch (error) {
    if (!complete || !isAxonHubSchemaValidationError(error)) throw error
    complete = false
    advancedDetailUnsupportedScopes.add(scopeKey)
    node = await requestAxonHubChannelNode(
      config,
      id,
      GET_AXON_HUB_CHANNEL_CORE,
      options,
    )
  }

  if (complete) {
    if (!isAuthoritativeAxonHubChannel(node) || node.id !== id) {
      throw new AxonHubRequestError("protocol", "not-dispatched")
    }
    advancedDetailUnsupportedScopes.delete(scopeKey)
    return node
  }

  if (!isAxonHubChannelCoreDetail(node) || node.id !== id) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }

  incompleteAdvancedDetails.add(node)
  return node
}

/** Resolve matching credentials without requesting optional advanced editor fields. */
export async function getAxonHubChannelSecretKey(
  config: AxonHubConfig,
  id: string,
  options?: Pick<RequestInit, "signal">,
): Promise<string> {
  const node = await requestAxonHubChannelNode(
    config,
    id,
    GET_AXON_HUB_CHANNEL_CORE,
    options,
  )
  if (!isAxonHubChannelCoreDetail(node) || node.id !== id) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }
  return normalizeList([
    ...(node.credentials?.apiKeys ?? []),
    node.credentials?.apiKey ?? "",
  ]).join("\n")
}

/**
 * Create a channel through AxonHub admin GraphQL.
 */
export async function createAxonHubChannel(
  config: AxonHubConfig,
  input: AxonHubCreateChannelInput,
  options?: Pick<RequestInit, "signal">,
) {
  const data = await graphqlRequest<unknown>(
    config,
    CREATE_CHANNEL,
    { input },
    options,
  )
  if (
    !isRecord(data) ||
    !isAxonHubChannelMutationProjection(data.createChannel)
  ) {
    throw new AxonHubRequestError("protocol", "dispatched")
  }
  return data.createChannel
}

/**
 * Update a channel through AxonHub admin GraphQL.
 */
export async function updateAxonHubChannel(
  config: AxonHubConfig,
  id: string,
  input: AxonHubUpdateChannelInput,
  options?: Pick<RequestInit, "signal">,
) {
  // This transport forwards UpdateChannelInput unchanged. Product adapters
  // must account for AxonHub's custom updater semantics instead of assuming
  // every generated append/clear field is implemented. Source:
  // https://github.com/looplj/axonhub/blob/v1.0.0-beta9/internal/server/biz/channel.go
  const data = await graphqlRequest<unknown>(
    config,
    UPDATE_CHANNEL,
    { id, input },
    options,
  )
  if (
    !isRecord(data) ||
    !isAxonHubChannelMutationProjection(data.updateChannel) ||
    data.updateChannel.id !== id
  ) {
    throw new AxonHubRequestError("protocol", "dispatched")
  }
  return data.updateChannel
}

/**
 * Update an AxonHub channel status independently from editable fields.
 */
export async function updateAxonHubChannelStatus(
  config: AxonHubConfig,
  id: string,
  status: string,
  options?: Pick<RequestInit, "signal">,
) {
  const data = await graphqlRequest<unknown>(
    config,
    UPDATE_CHANNEL_STATUS,
    { id, status },
    options,
  )
  if (
    !isRecord(data) ||
    !isRecord(data.updateChannelStatus) ||
    data.updateChannelStatus.__typename !== "Channel" ||
    data.updateChannelStatus.id !== id ||
    data.updateChannelStatus.status !== status
  ) {
    throw new AxonHubRequestError("protocol", "dispatched")
  }
  return { id, status } as AxonHubChannelStatusResult
}

/**
 * Delete an AxonHub channel by GraphQL id.
 */
export async function deleteAxonHubChannel(
  config: AxonHubConfig,
  id: string,
  options?: Pick<RequestInit, "signal">,
) {
  const data = await graphqlRequest<unknown>(
    config,
    DELETE_CHANNEL,
    { id },
    options,
  )
  if (!isRecord(data) || typeof data.deleteChannel !== "boolean") {
    throw new AxonHubRequestError("protocol", "dispatched")
  }
  return data.deleteChannel
}

/**
 * Return no groups because AxonHub does not expose New API group semantics.
 */
export async function fetchSiteUserGroups(): Promise<string[]> {
  return []
}
