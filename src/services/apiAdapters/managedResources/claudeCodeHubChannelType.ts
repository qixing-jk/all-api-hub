import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  type ClaudeCodeHubProviderType,
} from "~/constants/claudeCodeHub"
import { ChannelType } from "~/constants/managedSite"

const PROVIDER_TO_CHANNEL_TYPE: Readonly<
  Record<ClaudeCodeHubProviderType, ChannelType>
> = {
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE]: ChannelType.OpenAI,
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX]: ChannelType.Codex,
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE]: ChannelType.Anthropic,
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI]: ChannelType.Gemini,
}

const CHANNEL_TO_PROVIDER_TYPE: Partial<
  Record<ChannelType, ClaudeCodeHubProviderType>
> = {
  [ChannelType.Anthropic]: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
  [ChannelType.Codex]: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
  [ChannelType.Gemini]: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
  [ChannelType.VertexAi]: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
}

export const mapClaudeCodeHubProviderTypeToChannelTypeStrict = (
  value: string,
) => {
  const mapped = PROVIDER_TO_CHANNEL_TYPE[value as ClaudeCodeHubProviderType]
  return mapped === undefined
    ? { status: "unsupported" as const }
    : { status: "mapped" as const, value: mapped }
}

export const mapChannelTypeToClaudeCodeHubProviderType = (
  value: ChannelType,
): ClaudeCodeHubProviderType =>
  CHANNEL_TO_PROVIDER_TYPE[value] ??
  CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE
