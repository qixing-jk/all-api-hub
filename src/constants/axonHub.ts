import type { ChannelDefaults } from "~/types/managedSite"

export const AXON_HUB_CHANNEL_STATUS = {
  ENABLED: "enabled",
  DISABLED: "disabled",
  ARCHIVED: "archived",
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

export type AxonHubChannelType =
  (typeof AXON_HUB_CHANNEL_TYPE)[keyof typeof AXON_HUB_CHANNEL_TYPE]

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
  typeof value === "string" && value in AxonHubChannelTypeNames

export const DEFAULT_AXON_HUB_CHANNEL_FIELDS = {
  mode: "single",
  status: 1,
  priority: 0,
  weight: 0,
  groups: ["default"],
  models: [],
  type: AXON_HUB_CHANNEL_TYPE.OPENAI,
} satisfies ChannelDefaults
