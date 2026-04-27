import type { ChannelDefaults } from "~/types/managedSite"

export const CLAUDE_CODE_HUB_PROVIDER_TYPE = {
  OPENAI_COMPATIBLE: "openai-compatible",
  CODEX: "codex",
  CLAUDE: "claude",
  GEMINI: "gemini",
} as const

export type ClaudeCodeHubProviderType =
  (typeof CLAUDE_CODE_HUB_PROVIDER_TYPE)[keyof typeof CLAUDE_CODE_HUB_PROVIDER_TYPE]

export const ClaudeCodeHubProviderTypeNames: Record<
  ClaudeCodeHubProviderType,
  string
> = {
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE]: "OpenAI Compatible",
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX]: "Codex (Responses API)",
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE]: "Claude (Anthropic Messages API)",
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI]: "Gemini (Google Gemini API)",
}

export const ClaudeCodeHubProviderTypeOptions = Object.entries(
  ClaudeCodeHubProviderTypeNames,
).map(([value, label]) => ({
  value: value as ClaudeCodeHubProviderType,
  label,
}))

export const isClaudeCodeHubProviderType = (
  value: unknown,
): value is ClaudeCodeHubProviderType =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(ClaudeCodeHubProviderTypeNames, value)

export const DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS = {
  mode: "single",
  status: 1,
  priority: 0,
  weight: 1,
  groups: ["default"],
  models: [],
  type: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
} satisfies ChannelDefaults
