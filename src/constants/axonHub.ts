import type { ChannelDefaults } from "~/types/managedSite"

export const AXON_HUB_CHANNEL_STATUS = {
  ENABLED: "enabled",
  DISABLED: "disabled",
  ARCHIVED: "archived",
} as const

export const AXON_HUB_GRAPHQL_ERROR_CODES = {
  VALIDATION_FAILED: "GRAPHQL_VALIDATION_FAILED",
} as const

export type AxonHubChannelStatus =
  (typeof AXON_HUB_CHANNEL_STATUS)[keyof typeof AXON_HUB_CHANNEL_STATUS]

export const AXON_HUB_CHANNEL_TYPE = {
  OPENAI: "openai",
  OPENAI_RESPONSES: "openai_responses",
  ANTHROPIC: "anthropic",
  ANTHROPIC_AWS: "anthropic_aws",
  ANTHROPIC_GCP: "anthropic_gcp",
  GEMINI_OPENAI: "gemini_openai",
  GEMINI: "gemini",
  GEMINI_VERTEX: "gemini_vertex",
  DEEPSEEK: "deepseek",
  DEEPSEEK_ANTHROPIC: "deepseek_anthropic",
  OPENROUTER: "openrouter",
  XAI: "xai",
  SILICONFLOW: "siliconflow",
  VOLCENGINE: "volcengine",
  GITHUB_COPILOT: "github_copilot",
  CLAUDECODE: "claudecode",
  NANOGPT: "nanogpt",
  OLLAMA: "ollama",
} as const

const AXON_HUB_AUTO_SYNC_UNSUPPORTED_TYPES = new Set<string>([
  AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT,
  AXON_HUB_CHANNEL_TYPE.CLAUDECODE,
])

export type AxonHubChannelType =
  (typeof AXON_HUB_CHANNEL_TYPE)[keyof typeof AXON_HUB_CHANNEL_TYPE]

export const AXON_HUB_CHANNEL_FIELD_IDS = {
  NAME: "name",
  TYPE: "type",
  BASE_URL: "baseURL",
  STATUS: "status",
  KEY: "key",
  SUPPORTED_MODELS: "supportedModels",
  MANUAL_MODELS: "manualModels",
  DEFAULT_TEST_MODEL: "defaultTestModel",
  AUTO_SYNC_SUPPORTED_MODELS: "autoSyncSupportedModels",
  AUTO_SYNC_MODEL_PATTERN: "autoSyncModelPattern",
  TAGS: "tags",
  ORDERING_WEIGHT: "orderingWeight",
  REMARK: "remark",
  EXTRA_MODEL_PREFIX: "extraModelPrefix",
} as const

export type AxonHubChannelFieldId =
  (typeof AXON_HUB_CHANNEL_FIELD_IDS)[keyof typeof AXON_HUB_CHANNEL_FIELD_IDS]

export const AXON_HUB_DETAIL_FIELD_IDS: readonly AxonHubChannelFieldId[] =
  Object.freeze(Object.values(AXON_HUB_CHANNEL_FIELD_IDS))

export const AXON_HUB_CREATE_FIELD_IDS: readonly AxonHubChannelFieldId[] =
  Object.freeze([...AXON_HUB_DETAIL_FIELD_IDS])

export const AXON_HUB_EDITABLE_FIELD_IDS: readonly AxonHubChannelFieldId[] =
  Object.freeze(
    AXON_HUB_DETAIL_FIELD_IDS.filter(
      (fieldId) => fieldId !== AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
    ),
  )

export const AXON_HUB_TABLE_FIELD_IDS = [
  AXON_HUB_CHANNEL_FIELD_IDS.NAME,
  AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
  AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
  AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
  AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
  AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
] as const

export const AxonHubChannelTypeNames: Record<AxonHubChannelType, string> = {
  [AXON_HUB_CHANNEL_TYPE.OPENAI]: "OpenAI",
  [AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES]: "OpenAI Responses",
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC]: "Anthropic",
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_AWS]: "Anthropic AWS",
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_GCP]: "Anthropic GCP",
  [AXON_HUB_CHANNEL_TYPE.GEMINI_OPENAI]: "Gemini OpenAI",
  [AXON_HUB_CHANNEL_TYPE.GEMINI]: "Gemini",
  [AXON_HUB_CHANNEL_TYPE.GEMINI_VERTEX]: "Gemini Vertex",
  [AXON_HUB_CHANNEL_TYPE.DEEPSEEK]: "DeepSeek",
  [AXON_HUB_CHANNEL_TYPE.DEEPSEEK_ANTHROPIC]: "DeepSeek Anthropic",
  [AXON_HUB_CHANNEL_TYPE.OPENROUTER]: "OpenRouter",
  [AXON_HUB_CHANNEL_TYPE.XAI]: "xAI",
  [AXON_HUB_CHANNEL_TYPE.SILICONFLOW]: "SiliconFlow",
  [AXON_HUB_CHANNEL_TYPE.VOLCENGINE]: "Volcengine",
  [AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT]: "GitHub Copilot",
  [AXON_HUB_CHANNEL_TYPE.CLAUDECODE]: "Claude Code",
  [AXON_HUB_CHANNEL_TYPE.NANOGPT]: "NanoGPT",
  [AXON_HUB_CHANNEL_TYPE.OLLAMA]: "Ollama",
}

export const AxonHubChannelTypeOptions = Object.entries(
  AxonHubChannelTypeNames,
).map(([value, label]) => ({
  value: value as AxonHubChannelType,
  label,
}))

export const isAxonHubChannelType = (
  value: unknown,
): value is AxonHubChannelType =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(AxonHubChannelTypeNames, value)

/** Matches beta5: model auto-sync is unavailable for provider-managed credentials. */
export const isAxonHubModelAutoSyncSupported = (value: unknown): boolean =>
  isAxonHubChannelType(value) &&
  !AXON_HUB_AUTO_SYNC_UNSUPPORTED_TYPES.has(value)

export const DEFAULT_AXON_HUB_CHANNEL_FIELDS = {
  mode: "single",
  status: 1,
  priority: 0,
  weight: 0,
  groups: ["default"],
  models: [],
  type: AXON_HUB_CHANNEL_TYPE.OPENAI,
} satisfies ChannelDefaults
