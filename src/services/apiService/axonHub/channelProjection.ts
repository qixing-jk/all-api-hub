import { cacheKeyForConfig } from "~/services/apiService/axonHub/configIdentity"
import { isRecord } from "~/services/apiService/axonHub/graphqlProtocol"
import type {
  AxonHubChannel,
  AxonHubChannelMutationReceipt,
} from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"

const advancedDetailUnsupportedScopes = new Set<string>()

const incompleteAdvancedDetails = new WeakSet<object>()

export const invalidateDetailSchemaCapabilityCache = (
  config: AxonHubConfig,
) => {
  const scopeKey = cacheKeyForConfig(config)
  advancedDetailUnsupportedScopes.delete(scopeKey)
}

export const isNonEmptyString = (value: unknown): value is string =>
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

export const isAuthoritativeAxonHubChannel = (
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

export const isAxonHubChannelCoreDetail = (
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

export const isAxonHubChannelMutationProjection = (
  value: unknown,
): value is AxonHubChannelMutationReceipt =>
  isRecord(value) &&
  value.__typename === "Channel" &&
  isNonEmptyString(value.id) &&
  typeof value.type === "string" &&
  isOutputNullableString(value.baseURL) &&
  typeof value.name === "string" &&
  typeof value.status === "string"

export const toSafeAxonHubChannelSummary = (
  value: unknown,
): AxonHubChannel | null => {
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

/** Returns whether an AxonHub detail read included all optional aggregates. */
export const hasCompleteAxonHubAdvancedDetail = (
  channel: AxonHubChannel,
): boolean => !incompleteAdvancedDetails.has(channel)
/** Checks optional detail support for the current authenticated configuration. */
export const isAdvancedDetailUnsupported = (config: AxonHubConfig) =>
  advancedDetailUnsupportedScopes.has(cacheKeyForConfig(config))
/** Records a schema rejection until the next successful authentication. */
export const markAdvancedDetailUnsupported = (config: AxonHubConfig) => {
  advancedDetailUnsupportedScopes.add(cacheKeyForConfig(config))
}
/** Marks a core-only detail without adding fields to the native payload. */
export const markIncompleteAdvancedDetail = (channel: AxonHubChannel) => {
  incompleteAdvancedDetails.add(channel)
}
/** Resets schema capability cache between isolated protocol tests. */
export const resetChannelDetailSchemaCacheForTesting = () => {
  advancedDetailUnsupportedScopes.clear()
}
