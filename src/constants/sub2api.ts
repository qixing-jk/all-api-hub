import { ChannelType } from "~/constants/newApi"

/** Sub2API API-key account platforms exposed by the upstream admin API. */
export const SUB2API_API_KEY_ACCOUNT_TYPE_OPTIONS = [
  { value: ChannelType.OpenAI, label: "OpenAI" },
  { value: ChannelType.Anthropic, label: "Anthropic" },
  { value: ChannelType.Gemini, label: "Gemini" },
  { value: ChannelType.Xai, label: "Grok" },
  { value: ChannelType.Custom, label: "Antigravity" },
] as const
