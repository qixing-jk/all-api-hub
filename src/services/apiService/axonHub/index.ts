import { AXON_HUB_CHANNEL_STATUS } from "~/constants/axonHub"
import type {
  ApiResponse,
  ApiServiceRequest,
} from "~/services/apiTransport/type"
import type {
  AxonHubChannel,
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"
import {
  CHANNEL_STATUS,
  type ManagedSiteChannelListData,
} from "~/types/managedSite"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

const logger = createLogger("AxonHubApiService")

// Channel list responses are cached briefly, so keep this selection limited to
// non-secret summary fields and sanitize over-returned nodes before caching.
const AXON_HUB_CHANNEL_LIST_SELECTION = `
  id
  type
  baseURL
  name
  status
  tags
  supportedModels
`

// AxonHub v1.0.0-beta5 keeps ChannelSettingsInput as a replacement value, so
// detail reads select every pinned settings member before callers rebuild it.
// Its credential resolver may return null for an existing channel when the
// caller lacks write scope. Sources: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/axonhub.graphql#L151-L205
// and https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/axonhub.resolvers.go#L50-L55
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
    autoTrimedModelPrefixes
    hideOriginalModels
    hideMappedModels
    lowercaseModelId
    proxy {
      type
      url
      username
      password
    }
    transformOptions {
      forceArrayInstructions
      forceArrayInputs
      replaceDeveloperRoleWithSystem
      reasoningEffortMapping {
        from
        to
      }
    }
    headerOverrideOperations {
      op
      path
      from
      to
      value
      condition
      match {
        path
        eq
      }
      index
      splat
    }
    bodyOverrideOperations {
      op
      path
      from
      to
      value
      condition
      match {
        path
        eq
      }
      index
      splat
    }
    passThroughUserAgent
    passThroughBody
    rateLimit {
      rpm
      tpm
      maxConcurrent
      queueSize
      queueTimeoutMs
    }
    retryableStatusCodes
    retryableErrorPatterns {
      pattern
      regex
    }
    providerQuota {
      opencodeGo {
        workspaceId
        authCookie
      }
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
  disabledAPIKeys {
    key
    disabledAt
    errorCode
    reason
  }
`

// The legacy table still needs the primary API key and model mappings, but it
// must not retain unrelated provider credentials or secret-bearing settings.
const AXON_HUB_LEGACY_CHANNEL_SELECTION = `
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
  manualModels
  tags
  defaultTestModel
  settings {
    extraModelPrefix
    modelMappings {
      from
      to
    }
    autoTrimedModelPrefixes
    hideOriginalModels
    hideMappedModels
    lowercaseModelId
    transformOptions {
      forceArrayInstructions
      forceArrayInputs
      replaceDeveloperRoleWithSystem
      reasoningEffortMapping {
        from
        to
      }
    }
    passThroughUserAgent
    passThroughBody
    rateLimit {
      rpm
      tpm
      maxConcurrent
      queueSize
      queueTimeoutMs
    }
    retryableStatusCodes
    retryableErrorPatterns {
      pattern
      regex
    }
  }
  orderingWeight
  errorMessage
  remark
`

const QUERY_CHANNELS = `
  query QueryChannels($input: QueryChannelInput!) {
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

const GET_AXON_HUB_LEGACY_CHANNEL = `
  query GetAxonHubChannel($id: ID!) {
    node(id: $id) {
      ... on Channel {
        ${AXON_HUB_LEGACY_CHANNEL_SELECTION}
      }
    }
  }
`

const CREATE_CHANNEL = `
  mutation CreateChannel($input: CreateChannelInput!) {
    createChannel(input: $input) {
      ${AXON_HUB_CHANNEL_DETAIL_SELECTION}
    }
  }
`

const UPDATE_CHANNEL = `
  mutation UpdateChannel($id: ID!, $input: UpdateChannelInput!) {
    updateChannel(id: $id, input: $input) {
      ${AXON_HUB_CHANNEL_DETAIL_SELECTION}
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

const toAxonHubStatus = (status: number) =>
  status === CHANNEL_STATUS.Enable
    ? AXON_HUB_CHANNEL_STATUS.ENABLED
    : AXON_HUB_CHANNEL_STATUS.DISABLED

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

export class AxonHubRequestError extends Error {
  constructor(
    readonly kind: AxonHubRequestFailureKind,
    readonly dispatch: "not-dispatched" | "dispatched",
  ) {
    super(kind)
    this.name = "AxonHubRequestError"
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
const safeChannelListCache = new Map<
  string,
  {
    data: { items: AxonHubChannel[]; total: number }
    expiresAt: number
  }
>()
const numericIdToGraphqlId = new Map<number, string>()
const CHANNEL_LIST_CACHE_TTL_MS = 15_000
const MAX_LIST_CHANNEL_PAGES = 100
const LEGACY_CHANNEL_DETAIL_CONCURRENCY = 4

const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, "")

const cacheKeyForConfig = (config: AxonHubConfig) =>
  `${normalizeBaseUrl(config.baseUrl)}|${config.email.trim().toLowerCase()}`

const invalidateChannelListCache = (config: AxonHubConfig) => {
  safeChannelListCache.delete(cacheKeyForConfig(config))
}

export const __resetCachesForTesting = () => {
  tokenCache.clear()
  inflightSignIns.clear()
  safeChannelListCache.clear()
  numericIdToGraphqlId.clear()
}

const extractRequestConfig = (request: ApiServiceRequest): AxonHubConfig => ({
  baseUrl: request.baseUrl,
  email: String(request.auth.userId ?? ""),
  password: request.auth.accessToken ?? "",
})

const reserveNumericIdSlot = (preferredNumericId: number, id: string) => {
  let numericId = preferredNumericId

  while (true) {
    const existing = numericIdToGraphqlId.get(numericId)
    if (!existing || existing === id) {
      numericIdToGraphqlId.set(numericId, id)
      return numericId
    }
    numericId = (numericId + 1) >>> 0 || 1
  }
}

const numericIdFromGraphqlId = (id: string): number => {
  const parsed = Number(id)
  if (Number.isSafeInteger(parsed) && parsed > 0) {
    return reserveNumericIdSlot(parsed, id)
  }

  let hash = 0
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  const numericId = hash || 1
  // GraphQL IDs can be opaque strings; keep a reversible session map for UI
  // mutations that only pass the New API-shaped numeric row id back down.
  // Probe forward on collision so distinct opaque ids never share a slot.
  return reserveNumericIdSlot(numericId, id)
}

export const resolveAxonHubGraphqlId = (id: number) =>
  numericIdToGraphqlId.get(id) ?? String(id)

/**
 * Resolve the GraphQL global id required by AxonHub channel mutations.
 */
export async function resolveAxonHubGraphqlIdForMutation(
  config: AxonHubConfig,
  id: number,
) {
  let graphqlId = numericIdToGraphqlId.get(id)
  if (graphqlId) {
    return graphqlId
  }

  // AxonHub mutations reject bare numeric row ids; hydrate the reversible map
  // from the channel list before sending update/delete mutations.
  await listChannels(config)
  graphqlId = numericIdToGraphqlId.get(id)
  if (graphqlId) {
    return graphqlId
  }

  throw new Error(`Unable to resolve AxonHub GraphQL id for channel ${id}`)
}

const toSafeErrorMessage = (error: unknown, fallback: string) => {
  const message = getErrorMessage(error)
  if (!message) return fallback
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
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
      return new AxonHubRequestError(error.kind, dispatch)
    }
    return error
  }

  return new AxonHubRequestError(
    isAbortError(error) ? "aborted" : fallbackKind,
    dispatch,
  )
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

const isOutputNullableInteger = (value: unknown) =>
  value === null || (typeof value === "number" && Number.isInteger(value))

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

const isOutputCredentials = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    isOutputNullableString(value.apiKey) &&
    isOutputNullableStringArray(value.apiKeys) &&
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

const isOutputOverrideMatch = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.eq === "string")

const isOutputOverrideOperations = (value: unknown) =>
  Array.isArray(value) &&
  value.every(
    (operation) =>
      isRecord(operation) &&
      typeof operation.op === "string" &&
      isOutputNullableString(operation.path) &&
      isOutputNullableString(operation.from) &&
      isOutputNullableString(operation.to) &&
      isOutputNullableString(operation.value) &&
      isOutputNullableString(operation.condition) &&
      isOutputOverrideMatch(operation.match) &&
      isOutputNullableInteger(operation.index) &&
      isOutputNullableBoolean(operation.splat),
  )

const isOutputProxy = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    typeof value.type === "string" &&
    isOutputNullableString(value.url) &&
    isOutputNullableString(value.username) &&
    isOutputNullableString(value.password))

const isOutputTransformOptions = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    typeof value.forceArrayInstructions === "boolean" &&
    typeof value.forceArrayInputs === "boolean" &&
    typeof value.replaceDeveloperRoleWithSystem === "boolean" &&
    (value.reasoningEffortMapping === null ||
      (Array.isArray(value.reasoningEffortMapping) &&
        value.reasoningEffortMapping.every(
          (mapping) =>
            isRecord(mapping) &&
            typeof mapping.from === "string" &&
            typeof mapping.to === "string",
        ))))

const isOutputRateLimit = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    isOutputNullableInteger(value.rpm) &&
    isOutputNullableInteger(value.tpm) &&
    isOutputNullableInteger(value.maxConcurrent) &&
    isOutputNullableInteger(value.queueSize) &&
    isOutputNullableInteger(value.queueTimeoutMs))

const isOutputRetryableStatusCodes = (value: unknown) =>
  value === null ||
  (Array.isArray(value) && value.every((code) => Number.isInteger(code)))

const isOutputRetryableErrorPatterns = (value: unknown) =>
  value === null ||
  (Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.pattern === "string" &&
        typeof entry.regex === "boolean",
    ))

const isOutputProviderQuota = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    (value.opencodeGo === null ||
      (isRecord(value.opencodeGo) &&
        isOutputNullableString(value.opencodeGo.workspaceId) &&
        isOutputNullableString(value.opencodeGo.authCookie))))

const isOutputSettings = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    isOutputNullableString(value.extraModelPrefix) &&
    isOutputModelMappings(value.modelMappings) &&
    isOutputNullableStringArray(value.autoTrimedModelPrefixes) &&
    isOutputNullableBoolean(value.hideOriginalModels) &&
    isOutputNullableBoolean(value.hideMappedModels) &&
    isOutputNullableBoolean(value.lowercaseModelId) &&
    isOutputProxy(value.proxy) &&
    isOutputTransformOptions(value.transformOptions) &&
    isOutputOverrideOperations(value.headerOverrideOperations) &&
    isOutputOverrideOperations(value.bodyOverrideOperations) &&
    isOutputNullableBoolean(value.passThroughUserAgent) &&
    isOutputNullableBoolean(value.passThroughBody) &&
    isOutputRateLimit(value.rateLimit) &&
    isOutputRetryableStatusCodes(value.retryableStatusCodes) &&
    isOutputRetryableErrorPatterns(value.retryableErrorPatterns) &&
    isOutputProviderQuota(value.providerQuota))

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

const isOutputDisabledApiKeys = (value: unknown) =>
  value === null ||
  (Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.key === "string" &&
        typeof entry.disabledAt === "string" &&
        typeof entry.errorCode === "number" &&
        Number.isInteger(entry.errorCode) &&
        isOutputNullableString(entry.reason),
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
  isOutputEndpoints(value.endpoints) &&
  isOutputDisabledApiKeys(value.disabledAPIKeys)

const isLegacyOutputCredentials = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    isOutputNullableString(value.apiKey) &&
    isOutputNullableStringArray(value.apiKeys))

const isLegacyOutputSettings = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    isOutputNullableString(value.extraModelPrefix) &&
    isOutputModelMappings(value.modelMappings) &&
    isOutputNullableStringArray(value.autoTrimedModelPrefixes) &&
    isOutputNullableBoolean(value.hideOriginalModels) &&
    isOutputNullableBoolean(value.hideMappedModels) &&
    isOutputNullableBoolean(value.lowercaseModelId) &&
    isOutputTransformOptions(value.transformOptions) &&
    isOutputNullableBoolean(value.passThroughUserAgent) &&
    isOutputNullableBoolean(value.passThroughBody) &&
    isOutputRateLimit(value.rateLimit) &&
    isOutputRetryableStatusCodes(value.retryableStatusCodes) &&
    isOutputRetryableErrorPatterns(value.retryableErrorPatterns))

const isLegacyAxonHubChannel = (
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
  isLegacyOutputCredentials(value.credentials) &&
  isOutputStringArray(value.supportedModels) &&
  isOutputNullableStringArray(value.manualModels) &&
  isOutputNullableStringArray(value.tags) &&
  typeof value.defaultTestModel === "string" &&
  isLegacyOutputSettings(value.settings) &&
  typeof value.orderingWeight === "number" &&
  Number.isInteger(value.orderingWeight) &&
  isOutputNullableString(value.errorMessage) &&
  isOutputNullableString(value.remark)

const sanitizeLegacyAxonHubChannel = (
  value: AxonHubChannel,
): AxonHubChannel => {
  const primaryApiKey =
    value.credentials?.apiKeys
      ?.map((key) => key.trim())
      .find((key) => key.length > 0) ?? value.credentials?.apiKey?.trim()
  const settings = value.settings

  return {
    id: value.id,
    type: value.type,
    baseURL: value.baseURL,
    name: value.name,
    status: value.status,
    credentials: primaryApiKey ? { apiKeys: [primaryApiKey] } : null,
    supportedModels: value.supportedModels ? [...value.supportedModels] : null,
    manualModels: value.manualModels ? [...value.manualModels] : null,
    tags: value.tags ? [...value.tags] : null,
    defaultTestModel: value.defaultTestModel ?? null,
    settings:
      settings == null
        ? null
        : {
            extraModelPrefix: settings.extraModelPrefix ?? null,
            modelMappings:
              settings.modelMappings?.map(({ from, to }) => ({ from, to })) ??
              null,
            autoTrimedModelPrefixes:
              settings.autoTrimedModelPrefixes == null
                ? null
                : [...settings.autoTrimedModelPrefixes],
            hideOriginalModels: settings.hideOriginalModels ?? null,
            hideMappedModels: settings.hideMappedModels ?? null,
            lowercaseModelId: settings.lowercaseModelId ?? null,
            transformOptions:
              settings.transformOptions == null
                ? null
                : {
                    forceArrayInstructions:
                      settings.transformOptions.forceArrayInstructions ?? null,
                    forceArrayInputs:
                      settings.transformOptions.forceArrayInputs ?? null,
                    replaceDeveloperRoleWithSystem:
                      settings.transformOptions
                        .replaceDeveloperRoleWithSystem ?? null,
                    reasoningEffortMapping:
                      settings.transformOptions.reasoningEffortMapping?.map(
                        ({ from, to }) => ({ from, to }),
                      ) ?? null,
                  },
            passThroughUserAgent: settings.passThroughUserAgent ?? null,
            passThroughBody: settings.passThroughBody ?? null,
            rateLimit:
              settings.rateLimit == null
                ? null
                : {
                    rpm: settings.rateLimit.rpm ?? null,
                    tpm: settings.rateLimit.tpm ?? null,
                    maxConcurrent: settings.rateLimit.maxConcurrent ?? null,
                    queueSize: settings.rateLimit.queueSize ?? null,
                    queueTimeoutMs: settings.rateLimit.queueTimeoutMs ?? null,
                  },
            retryableStatusCodes:
              settings.retryableStatusCodes == null
                ? null
                : [...settings.retryableStatusCodes],
            retryableErrorPatterns:
              settings.retryableErrorPatterns?.map(({ pattern, regex }) => ({
                pattern,
                regex: regex ?? null,
              })) ?? null,
          },
    createdAt: value.createdAt ?? null,
    updatedAt: value.updatedAt ?? null,
    orderingWeight: value.orderingWeight ?? null,
    errorMessage: value.errorMessage ?? null,
    remark: value.remark ?? null,
  }
}

const toLegacyAxonHubChannel = (value: unknown): AxonHubChannel | null => {
  if (!isLegacyAxonHubChannel(value)) return null

  return sanitizeLegacyAxonHubChannel(value)
}

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
  }
}

const parseGraphqlEnvelope = (
  payload: unknown,
  dispatch: "not-dispatched" | "dispatched",
): GraphQLResponseEnvelope => {
  if (!isRecord(payload)) {
    throw new AxonHubRequestError("protocol", dispatch)
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
    throw new AxonHubRequestError("protocol", dispatch)
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
  const isMutation = /^\s*mutation\b/.test(query)
  let mutationDispatched = false

  type GraphqlAttempt = { kind: "data"; data: T } | { kind: "retry-auth" }

  const retryAuthentication = (): GraphqlAttempt => {
    if (isMutation) mutationDispatched = false
    return { kind: "retry-auth" }
  }

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
        throw new AxonHubRequestError(
          classifyGraphqlFailure(response, undefined),
          dispatch,
        )
      }
      throw new AxonHubRequestError("protocol", dispatch)
    }

    if (response.status >= 500) {
      throw new AxonHubRequestError("unavailable", dispatch)
    }
    if (response.status === 401) {
      if (allowAuthRetry) return retryAuthentication()
      throw new AxonHubRequestError("authentication", dispatch)
    }
    if (response.status === 403) {
      throw new AxonHubRequestError("permission", dispatch)
    }

    const graphqlPayload = parseGraphqlEnvelope(payload, dispatch)

    if (!response.ok || graphqlPayload.errors?.length) {
      if (
        allowAuthRetry &&
        shouldRefreshAuthentication(response, graphqlPayload.errors)
      ) {
        return retryAuthentication()
      }

      throw new AxonHubRequestError(
        classifyGraphqlFailure(response, graphqlPayload.errors),
        dispatch,
      )
    }

    if (graphqlPayload.data === undefined || graphqlPayload.data === null) {
      throw new AxonHubRequestError("protocol", dispatch)
    }

    return { kind: "data", data: graphqlPayload.data as T }
  }

  try {
    throwIfAborted(options?.signal)
    const token = await getSessionToken(config, false, options)
    const firstAttempt = await execute(token, retryAuth)
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

/**
 * Convert an AxonHub GraphQL channel into the managed-site channel row shape.
 */
export function axonHubChannelToManagedSite(
  authoritativeChannel: AxonHubChannel,
) {
  const channel = sanitizeLegacyAxonHubChannel(authoritativeChannel)
  const models = normalizeList([
    ...(channel.supportedModels ?? []),
    ...(channel.manualModels ?? []),
  ])
  const mappingObject = (channel.settings?.modelMappings ?? []).reduce<
    Record<string, string>
  >((acc, mapping) => {
    const from = mapping.from?.trim()
    const to = mapping.to?.trim()
    if (from && to) {
      acc[from] = to
    }
    return acc
  }, {})
  const modelMapping =
    Object.keys(mappingObject).length > 0 ? JSON.stringify(mappingObject) : ""
  const credentials = channel.credentials ?? {}
  const apiKey =
    credentials.apiKeys
      ?.map((key) => key.trim())
      .find((key) => key.length > 0) ??
    credentials.apiKey?.trim() ??
    ""

  return {
    id: numericIdFromGraphqlId(channel.id),
    name: channel.name,
    type: channel.type,
    base_url: channel.baseURL ?? "",
    key: apiKey,
    models: models.join(","),
    status:
      channel.status === AXON_HUB_CHANNEL_STATUS.ENABLED
        ? CHANNEL_STATUS.Enable
        : CHANNEL_STATUS.ManuallyDisabled,
    priority: 0,
    weight: channel.orderingWeight ?? 0,
    group: "",
    model_mapping: modelMapping,
    status_code_mapping: "",
    test_model: channel.defaultTestModel ?? null,
    auto_ban: 0,
    created_time: (() => {
      if (!channel.createdAt) return 0
      const parsed = Date.parse(channel.createdAt)
      return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0
    })(),
    test_time: 0,
    response_time: 0,
    balance: 0,
    balance_updated_time: 0,
    used_quota: 0,
    tag: null,
    remark: channel.remark ?? null,
    setting: channel.settings ? JSON.stringify(channel.settings) : "",
    settings: channel.settings ? JSON.stringify(channel.settings) : "",
    openai_organization: null,
    other: "",
    other_info: channel.errorMessage ?? "",
    param_override: null,
    header_override: null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: credentials.apiKeys?.length ?? 0,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    _axonHubData: channel,
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

/**
 * Load one native AxonHub channel by its opaque GraphQL id.
 */
export async function getAxonHubChannel(
  config: AxonHubConfig,
  id: string,
  options?: Pick<RequestInit, "signal">,
): Promise<AxonHubChannel> {
  const data = await graphqlRequest<unknown>(
    config,
    GET_AXON_HUB_CHANNEL,
    { id },
    options,
  )

  if (!isRecord(data) || !("node" in data)) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }
  if (data.node === null) {
    throw new AxonHubRequestError("not-found", "not-dispatched")
  }
  if (
    !isRecord(data.node) ||
    !isAuthoritativeAxonHubChannel(data.node) ||
    data.node.id !== id
  ) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }

  return data.node
}

const getLegacyAxonHubChannel = async (
  config: AxonHubConfig,
  id: string,
  options?: Pick<RequestInit, "signal">,
): Promise<AxonHubChannel> => {
  const data = await graphqlRequest<unknown>(
    config,
    GET_AXON_HUB_LEGACY_CHANNEL,
    { id },
    options,
  )

  if (!isRecord(data) || !("node" in data)) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }
  if (data.node === null) {
    throw new AxonHubRequestError("not-found", "not-dispatched")
  }

  const channel = toLegacyAxonHubChannel(data.node)
  if (!channel || channel.id !== id) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }
  return channel
}

const hydrateLegacyAxonHubChannels = async (
  config: AxonHubConfig,
  channels: readonly AxonHubChannel[],
  options?: Pick<RequestInit, "signal">,
): Promise<ManagedSiteChannelListData["items"]> => {
  if (channels.length === 0) return []

  const items = new Array<ManagedSiteChannelListData["items"][number]>(
    channels.length,
  )
  let nextIndex = 0
  let stopped = false

  const worker = async () => {
    while (!stopped) {
      throwIfAborted(options?.signal)
      const index = nextIndex
      if (index >= channels.length) return
      nextIndex += 1

      try {
        const channel = channels[index]
        if (!channel) return
        items[index] = axonHubChannelToManagedSite(
          await getLegacyAxonHubChannel(config, channel.id, options),
        )
      } catch (error) {
        stopped = true
        throw error
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(LEGACY_CHANNEL_DETAIL_CONCURRENCY, channels.length),
      },
      worker,
    ),
  )
  return items
}

const listSafeAxonHubChannels = async (
  config: AxonHubConfig,
  options?: Pick<RequestInit, "signal">,
): Promise<{ items: AxonHubChannel[]; total: number }> => {
  const cacheKey = cacheKeyForConfig(config)
  const cachedChannels = safeChannelListCache.get(cacheKey)
  if (cachedChannels && cachedChannels.expiresAt > Date.now()) {
    return cachedChannels.data
  }

  safeChannelListCache.delete(cacheKey)
  const items: AxonHubChannel[] = []
  let after: string | null | undefined
  let total = 0
  let pageCount = 0
  const seenCursors = new Set<string>()

  do {
    if (pageCount >= MAX_LIST_CHANNEL_PAGES) {
      throw new Error("AxonHub returned too many channel-list pages")
    }
    pageCount += 1

    const page = await requestAxonHubChannelPage(
      config,
      {
        cursor: after ?? undefined,
        limit: 100,
      },
      QUERY_CHANNELS,
      options,
    )

    total = page.total ?? total
    items.push(...page.items)
    const nextCursor = page.nextCursor
    if (nextCursor) {
      if (seenCursors.has(nextCursor)) {
        throw new Error("AxonHub channel pagination cursor repeated")
      }
      seenCursors.add(nextCursor)
    }
    after = nextCursor
  } while (after)

  const result = {
    items,
    total: total || items.length,
  }

  safeChannelListCache.set(cacheKey, {
    data: result,
    expiresAt: Date.now() + CHANNEL_LIST_CACHE_TTL_MS,
  })

  return result
}

/**
 * List all AxonHub channels through the legacy managed-site contract.
 */
export async function listChannels(
  config: AxonHubConfig,
  options?: Pick<RequestInit, "signal">,
): Promise<ManagedSiteChannelListData> {
  const safeChannels = await listSafeAxonHubChannels(config, options)
  const items = await hydrateLegacyAxonHubChannels(
    config,
    safeChannels.items,
    options,
  )

  return {
    items,
    total: safeChannels.total,
    type_counts: items.reduce<Record<string, number>>((acc, channel) => {
      const key = String(channel.type)
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {}),
  }
}

/**
 * Search AxonHub channels client-side across display fields.
 */
export async function searchChannels(
  config: AxonHubConfig,
  keyword: string,
): Promise<ManagedSiteChannelListData> {
  const channels = await listChannels(config)
  const normalizedKeyword = keyword.trim().toLowerCase()

  if (!normalizedKeyword) {
    return channels
  }

  const items = channels.items.filter((channel) =>
    [
      channel.name,
      channel.base_url,
      channel.models,
      channel.key,
      String(channel.type),
    ].some((value) => value?.toLowerCase().includes(normalizedKeyword)),
  )

  return {
    items,
    total: items.length,
    type_counts: channels.type_counts,
  }
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
  if (!isRecord(data) || !isAuthoritativeAxonHubChannel(data.createChannel)) {
    throw new AxonHubRequestError("protocol", "dispatched")
  }
  invalidateChannelListCache(config)
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
  // beta5 UpdateChannelInput treats settings as replacement data and exposes
  // only these generated append/clear fields; forward the verified input
  // unchanged. Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/ent.graphql#L5993-L6033
  const data = await graphqlRequest<unknown>(
    config,
    UPDATE_CHANNEL,
    { id, input },
    options,
  )
  if (
    !isRecord(data) ||
    !isAuthoritativeAxonHubChannel(data.updateChannel) ||
    data.updateChannel.id !== id
  ) {
    throw new AxonHubRequestError("protocol", "dispatched")
  }
  invalidateChannelListCache(config)
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
  invalidateChannelListCache(config)
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
  invalidateChannelListCache(config)
  return data.deleteChannel
}

/**
 * API-service adapter for model-sync channel listing.
 */
export async function listAllChannels(
  request: ApiServiceRequest,
): Promise<ManagedSiteChannelListData> {
  return listChannels(extractRequestConfig(request))
}

/**
 * API-service adapter for channel search.
 */
export async function searchChannel(
  request: ApiServiceRequest,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  return searchChannels(extractRequestConfig(request), keyword)
}

/**
 * API-service adapter for channel creation.
 */
export async function createChannel(
  request: ApiServiceRequest,
  channelData: {
    channel: AxonHubCreateChannelInput & { status?: number }
  },
): Promise<ApiResponse<unknown>> {
  try {
    const config = extractRequestConfig(request)
    const { status, ...input } = channelData.channel
    const created = await createAxonHubChannel(config, input)
    const finalChannel = { ...created }
    invalidateChannelListCache(config)
    if (status === CHANNEL_STATUS.Enable) {
      const axonHubStatus = toAxonHubStatus(status)
      await updateAxonHubChannelStatus(config, created.id, axonHubStatus)
      finalChannel.status = axonHubStatus
    }

    return {
      success: true,
      data: axonHubChannelToManagedSite(finalChannel),
      message: "success",
    }
  } catch (error) {
    logger.error("Failed to create AxonHub channel", error)
    return {
      success: false,
      data: null,
      message: toSafeErrorMessage(error, "Failed to create AxonHub channel"),
    }
  }
}

/**
 * API-service adapter for channel updates.
 */
export async function updateChannel(
  request: ApiServiceRequest,
  channelData: Omit<AxonHubUpdateChannelInput, "status"> & {
    id: number
    status?: number
  },
): Promise<ApiResponse<unknown>> {
  try {
    const config = extractRequestConfig(request)
    const { id, status, ...input } = channelData
    const graphqlId = await resolveAxonHubGraphqlIdForMutation(config, id)
    const updated = await updateAxonHubChannel(config, graphqlId, input)
    const finalChannel = { ...updated }
    invalidateChannelListCache(config)

    if (status !== undefined) {
      const axonHubStatus = toAxonHubStatus(status)
      await updateAxonHubChannelStatus(config, graphqlId, axonHubStatus)
      finalChannel.status = axonHubStatus
    }

    return {
      success: true,
      data: axonHubChannelToManagedSite(finalChannel),
      message: "success",
    }
  } catch (error) {
    logger.error("Failed to update AxonHub channel", error)
    return {
      success: false,
      data: null,
      message: toSafeErrorMessage(error, "Failed to update AxonHub channel"),
    }
  }
}

/**
 * API-service adapter for channel deletion.
 */
export async function deleteChannel(
  request: ApiServiceRequest,
  channelId: number,
): Promise<ApiResponse<unknown>> {
  try {
    const config = extractRequestConfig(request)
    const deleted = await deleteAxonHubChannel(
      config,
      await resolveAxonHubGraphqlIdForMutation(config, channelId),
    )
    if (deleted) {
      invalidateChannelListCache(config)
    }

    return {
      success: deleted,
      data: deleted,
      message: deleted ? "success" : "Failed to delete AxonHub channel",
    }
  } catch (error) {
    logger.error("Failed to delete AxonHub channel", error)
    return {
      success: false,
      data: null,
      message: toSafeErrorMessage(error, "Failed to delete AxonHub channel"),
    }
  }
}

/**
 * Return no groups because AxonHub does not expose New API group semantics.
 */
export async function fetchSiteUserGroups(): Promise<string[]> {
  return []
}
