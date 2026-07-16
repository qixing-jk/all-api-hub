import type {
  AxonHubChannelStatus,
  AxonHubChannelType,
} from "~/constants/axonHub"

export interface AxonHubModelMapping {
  from: string
  to: string
}

export interface AxonHubOverrideMatch {
  path: string
  eq: string
}

export interface AxonHubOverrideOperation {
  op: string
  path?: string | null
  from?: string | null
  to?: string | null
  value?: string | null
  condition?: string | null
  match?: AxonHubOverrideMatch | null
  index?: number | null
  splat?: boolean | null
}

export interface AxonHubProxyConfig {
  type: string
  url?: string | null
  username?: string | null
  password?: string | null
}

export interface AxonHubReasoningEffortMapping {
  from: string
  to: string
}

export interface AxonHubTransformOptions {
  forceArrayInstructions?: boolean | null
  forceArrayInputs?: boolean | null
  replaceDeveloperRoleWithSystem?: boolean | null
  reasoningEffortMapping?: AxonHubReasoningEffortMapping[] | null
}

export interface AxonHubChannelRateLimit {
  rpm?: number | null
  tpm?: number | null
  maxConcurrent?: number | null
  queueSize?: number | null
  queueTimeoutMs?: number | null
}

export interface AxonHubRetryableErrorPattern {
  pattern: string
  regex?: boolean | null
}

export interface AxonHubOpenCodeGoQuotaSettings {
  workspaceId?: string | null
  authCookie?: string | null
}

export interface AxonHubChannelProviderQuotaSettings {
  opencodeGo?: AxonHubOpenCodeGoQuotaSettings | null
}

export interface AxonHubChannelSettings {
  extraModelPrefix?: string | null
  modelMappings?: AxonHubModelMapping[] | null
  autoTrimedModelPrefixes?: string[] | null
  hideOriginalModels?: boolean | null
  hideMappedModels?: boolean | null
  lowercaseModelId?: boolean | null
  proxy?: AxonHubProxyConfig | null
  transformOptions?: AxonHubTransformOptions | null
  headerOverrideOperations?: AxonHubOverrideOperation[] | null
  bodyOverrideOperations?: AxonHubOverrideOperation[] | null
  passThroughUserAgent?: boolean | null
  passThroughBody?: boolean | null
  rateLimit?: AxonHubChannelRateLimit | null
  retryableStatusCodes?: number[] | null
  retryableErrorPatterns?: AxonHubRetryableErrorPattern[] | null
  providerQuota?: AxonHubChannelProviderQuotaSettings | null
}

export interface AxonHubOAuthCredentials {
  accessToken?: string | null
  refreshToken?: string | null
  clientID?: string | null
  expiresAt?: string | null
  tokenType?: string | null
  scopes?: string[] | null
}

export interface AxonHubGCPCredential {
  region: string
  projectID: string
  jsonData: string
}

export interface AxonHubChannelCredentials {
  apiKey?: string | null
  apiKeys?: string[] | null
  gcp?: AxonHubGCPCredential | null
  oauth?: AxonHubOAuthCredentials | null
}

export interface AxonHubChannelPolicies {
  stream?: string | null
}

export interface AxonHubChannelEndpoint {
  apiFormat: string
  path?: string | null
  baseURL?: string | null
  transport?: string | null
}

export interface AxonHubDisabledAPIKey {
  key: string
  disabledAt: string
  errorCode: number
  reason?: string | null
}

export interface AxonHubChannelModelEntry {
  requestModel: string
  actualModel: string
  source: string
}

export interface AxonHubChannelLimiterStats {
  inFlight: number
  waiting: number
  capacity: number
  queueSize: number
}

export interface AxonHubChannel {
  id: string
  name: string
  type: AxonHubChannelType | string
  status: AxonHubChannelStatus | string
  baseURL: string | null
  credentials?: AxonHubChannelCredentials | null
  supportedModels?: string[] | null
  manualModels?: string[] | null
  autoSyncSupportedModels?: boolean | null
  autoSyncModelPattern?: string | null
  tags?: string[] | null
  defaultTestModel?: string | null
  policies?: AxonHubChannelPolicies | null
  settings?: AxonHubChannelSettings | null
  createdAt?: string | null
  updatedAt?: string | null
  orderingWeight?: number | null
  remark?: string | null
  errorMessage?: string | null
  endpoints?: AxonHubChannelEndpoint[] | null
  defaultEndpoints?: AxonHubChannelEndpoint[] | null
  disabledAPIKeys?: AxonHubDisabledAPIKey[] | null
  allModelEntries?: AxonHubChannelModelEntry[] | null
  liveLimiterStats?: AxonHubChannelLimiterStats | null
}

export interface AxonHubCreateChannelInput {
  type: AxonHubChannelType | string
  name: string
  baseURL?: string | null
  credentials: AxonHubChannelCredentials
  supportedModels: string[]
  manualModels?: string[] | null
  autoSyncSupportedModels?: boolean | null
  autoSyncModelPattern?: string | null
  tags?: string[] | null
  defaultTestModel: string
  policies?: AxonHubChannelPolicies | null
  settings?: AxonHubChannelSettings | null
  orderingWeight?: number | null
  remark?: string | null
  endpoints?: AxonHubChannelEndpoint[] | null
}

export interface AxonHubUpdateChannelInput {
  type?: AxonHubChannelType | string
  baseURL?: string | null
  clearBaseURL?: boolean
  name?: string
  status?: AxonHubChannelStatus | string
  credentials?: AxonHubChannelCredentials | null
  supportedModels?: string[] | null
  appendSupportedModels?: string[] | null
  manualModels?: string[] | null
  appendManualModels?: string[] | null
  clearManualModels?: boolean
  autoSyncSupportedModels?: boolean | null
  autoSyncModelPattern?: string | null
  clearAutoSyncModelPattern?: boolean
  tags?: string[] | null
  appendTags?: string[] | null
  clearTags?: boolean
  defaultTestModel?: string | null
  policies?: AxonHubChannelPolicies | null
  clearPolicies?: boolean
  settings?: AxonHubChannelSettings | null
  clearSettings?: boolean
  orderingWeight?: number | null
  errorMessage?: string | null
  clearErrorMessage?: boolean
  remark?: string | null
  clearRemark?: boolean
  endpoints?: AxonHubChannelEndpoint[] | null
  appendEndpoints?: AxonHubChannelEndpoint[] | null
  clearEndpoints?: boolean
}
