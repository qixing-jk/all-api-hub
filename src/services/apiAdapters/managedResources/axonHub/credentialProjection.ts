import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import {
  MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS,
  MANAGED_RESOURCE_SECRET_STATES,
  type ResourceSecretReplacementBlockReason,
  type ResourceSecretState,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { AxonHubChannel } from "~/types/axonHub"

// beta5 requires apiKeys for these audited regular-key types; structured
// AWS/GCP/OAuth and unknown future types stay excluded by default.
// Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/data/schema.ts
export const REGULAR_AXON_HUB_CHANNEL_TYPES = [
  AXON_HUB_CHANNEL_TYPE.OPENAI,
  AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES,
  AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
  AXON_HUB_CHANNEL_TYPE.GEMINI_OPENAI,
  AXON_HUB_CHANNEL_TYPE.GEMINI,
  AXON_HUB_CHANNEL_TYPE.GEMINI_VERTEX,
  AXON_HUB_CHANNEL_TYPE.DEEPSEEK,
  AXON_HUB_CHANNEL_TYPE.DEEPSEEK_ANTHROPIC,
  AXON_HUB_CHANNEL_TYPE.OPENROUTER,
  AXON_HUB_CHANNEL_TYPE.XAI,
  AXON_HUB_CHANNEL_TYPE.SILICONFLOW,
  AXON_HUB_CHANNEL_TYPE.VOLCENGINE,
  AXON_HUB_CHANNEL_TYPE.NANOGPT,
  AXON_HUB_CHANNEL_TYPE.OLLAMA,
] as const

export const REGULAR_AXON_HUB_CHANNEL_TYPE_SET = new Set<string>(
  REGULAR_AXON_HUB_CHANNEL_TYPES,
)

const editorCredentialStates = new WeakMap<
  AxonHubChannel,
  ResourceSecretState
>()

const editorCredentialReplacementBlockReasons = new WeakMap<
  AxonHubChannel,
  ResourceSecretReplacementBlockReason
>()

/** Returns whether AxonHub represents this channel with regular API-key credentials. */
export const isRegularAxonHubChannelType = (type: string): boolean =>
  REGULAR_AXON_HUB_CHANNEL_TYPE_SET.has(type)

export const getAxonHubCredentialCandidates = (
  channel: AxonHubChannel,
): string[] =>
  [...(channel.credentials?.apiKeys ?? []), channel.credentials?.apiKey]
    .filter((key): key is string => typeof key === "string")
    .map((key) => key.trim())
    .filter(Boolean)

export const getCredentialReplacementBlockReason = (
  channel: AxonHubChannel,
): ResourceSecretReplacementBlockReason | undefined =>
  editorCredentialReplacementBlockReasons.get(channel) ??
  (getAxonHubCredentialCandidates(channel).length > 1
    ? MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS.MultipleCredentials
    : undefined)

export const getCredentialState = (
  channel: AxonHubChannel,
): ResourceSecretState => {
  const editorState = editorCredentialStates.get(channel)
  if (editorState) return editorState
  if (channel.credentials === null)
    return MANAGED_RESOURCE_SECRET_STATES.PermissionHidden
  const keys = getAxonHubCredentialCandidates(channel)
  if (keys.some(hasUsableApiTokenKey))
    return MANAGED_RESOURCE_SECRET_STATES.Available
  if (keys.length) return MANAGED_RESOURCE_SECRET_STATES.Masked
  return MANAGED_RESOURCE_SECRET_STATES.Unavailable
}

export const sanitizeAxonHubEditorDetail = (
  detail: AxonHubChannel,
): AxonHubChannel => {
  if (
    isRegularAxonHubChannelType(String(detail.type)) &&
    detail.credentials != null &&
    getAxonHubCredentialCandidates(detail).every(hasUsableApiTokenKey)
  )
    return detail
  const credentialState = getCredentialState(detail)
  const credentialReplacementBlockReason =
    getCredentialReplacementBlockReason(detail)
  const sanitized: AxonHubChannel = {
    id: detail.id,
    name: detail.name,
    type: detail.type,
    status: detail.status,
    baseURL: detail.baseURL,
    credentials: undefined,
    supportedModels: detail.supportedModels,
    manualModels: detail.manualModels,
    autoSyncSupportedModels: detail.autoSyncSupportedModels,
    autoSyncModelPattern: detail.autoSyncModelPattern,
    tags: detail.tags,
    defaultTestModel: detail.defaultTestModel,
    orderingWeight: detail.orderingWeight,
    remark: detail.remark,
    settings: detail.settings
      ? { extraModelPrefix: detail.settings.extraModelPrefix }
      : undefined,
  }
  editorCredentialStates.set(sanitized, credentialState)
  if (credentialReplacementBlockReason) {
    editorCredentialReplacementBlockReasons.set(
      sanitized,
      credentialReplacementBlockReason,
    )
  }
  return sanitized
}

export const getAxonHubCredentialKey = (channel: AxonHubChannel) => {
  if (
    getCredentialState(channel) !== MANAGED_RESOURCE_SECRET_STATES.Available ||
    getCredentialReplacementBlockReason(channel)
  ) {
    return undefined
  }
  return getAxonHubCredentialCandidates(channel).find(hasUsableApiTokenKey)
}

export const canReplaceCredential = (channel: AxonHubChannel) =>
  isRegularAxonHubChannelType(String(channel.type)) &&
  getCredentialState(channel) !==
    MANAGED_RESOURCE_SECRET_STATES.PermissionHidden &&
  getCredentialReplacementBlockReason(channel) === undefined

/** Preserve credential order, including duplicate native entries. */
export function axonCredentialRecords(detail: AxonHubChannel) {
  return getAxonHubCredentialCandidates(detail).map((key, index) => ({
    id: String(index),
    key,
    fields: {},
  }))
}
