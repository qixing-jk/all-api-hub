import {
  AXON_HUB_CHANNEL_TYPE,
  isAxonHubChannelType,
  type AxonHubChannelType,
} from "~/constants/axonHub"
import { ChannelType } from "~/constants/managedSite"

const AXON_HUB_TO_CHANNEL_TYPE = {
  [AXON_HUB_CHANNEL_TYPE.OPENAI]: ChannelType.OpenAI,
  [AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES]: ChannelType.OpenAI,
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC]: ChannelType.Anthropic,
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_AWS]: ChannelType.Anthropic,
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_GCP]: ChannelType.Anthropic,
  [AXON_HUB_CHANNEL_TYPE.CLAUDECODE]: ChannelType.Anthropic,
  [AXON_HUB_CHANNEL_TYPE.GEMINI_OPENAI]: ChannelType.Gemini,
  [AXON_HUB_CHANNEL_TYPE.GEMINI]: ChannelType.Gemini,
  [AXON_HUB_CHANNEL_TYPE.GEMINI_VERTEX]: ChannelType.Gemini,
  [AXON_HUB_CHANNEL_TYPE.DEEPSEEK]: ChannelType.DeepSeek,
  [AXON_HUB_CHANNEL_TYPE.DEEPSEEK_ANTHROPIC]: ChannelType.DeepSeek,
  [AXON_HUB_CHANNEL_TYPE.OPENROUTER]: ChannelType.OpenRouter,
  [AXON_HUB_CHANNEL_TYPE.XAI]: ChannelType.Xai,
  [AXON_HUB_CHANNEL_TYPE.SILICONFLOW]: ChannelType.SiliconFlow,
  [AXON_HUB_CHANNEL_TYPE.VOLCENGINE]: ChannelType.VolcEngine,
  [AXON_HUB_CHANNEL_TYPE.OLLAMA]: ChannelType.Ollama,
  [AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT]: ChannelType.OpenAI,
  [AXON_HUB_CHANNEL_TYPE.NANOGPT]: ChannelType.OpenAI,
} satisfies Readonly<Record<AxonHubChannelType, ChannelType>>

const CHANNEL_TYPE_TO_AXON_HUB: Readonly<
  Partial<Record<ChannelType, AxonHubChannelType>>
> = {
  [ChannelType.OpenAI]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [ChannelType.Anthropic]: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
  [ChannelType.OpenRouter]: AXON_HUB_CHANNEL_TYPE.OPENROUTER,
  [ChannelType.Gemini]: AXON_HUB_CHANNEL_TYPE.GEMINI,
  [ChannelType.VertexAi]: AXON_HUB_CHANNEL_TYPE.GEMINI,
  [ChannelType.SiliconFlow]: AXON_HUB_CHANNEL_TYPE.SILICONFLOW,
  [ChannelType.DeepSeek]: AXON_HUB_CHANNEL_TYPE.DEEPSEEK,
  [ChannelType.VolcEngine]: AXON_HUB_CHANNEL_TYPE.VOLCENGINE,
  [ChannelType.Xai]: AXON_HUB_CHANNEL_TYPE.XAI,
  [ChannelType.Ollama]: AXON_HUB_CHANNEL_TYPE.OLLAMA,
}

type AxonHubChannelTypeMapping<T> =
  | { status: "mapped"; value: T }
  | { status: "unsupported" }

/** Strictly maps an AxonHub-native channel type into the shared migration type. */
export function mapAxonHubChannelTypeToChannelTypeStrict(
  type: string,
): AxonHubChannelTypeMapping<ChannelType> {
  return isAxonHubChannelType(type)
    ? { status: "mapped", value: AXON_HUB_TO_CHANNEL_TYPE[type] }
    : { status: "unsupported" }
}

/** Strictly maps a supported shared migration type into an AxonHub-native type. */
export function mapChannelTypeToAxonHubChannelTypeStrict(
  type: ChannelType,
): AxonHubChannelTypeMapping<AxonHubChannelType> {
  const mappedType = CHANNEL_TYPE_TO_AXON_HUB[type]
  return mappedType === undefined
    ? { status: "unsupported" }
    : { status: "mapped", value: mappedType }
}

/** Maps an AxonHub-native channel type using the legacy OpenAI fallback. */
export function mapAxonHubChannelTypeToChannelType(type: string): ChannelType {
  const mappedType = mapAxonHubChannelTypeToChannelTypeStrict(type)
  return mappedType.status === "mapped" ? mappedType.value : ChannelType.OpenAI
}

/** Maps a shared channel type using the legacy AxonHub OpenAI fallback. */
export function mapChannelTypeToAxonHubChannelType(
  type: ChannelType,
): AxonHubChannelType {
  const mappedType = mapChannelTypeToAxonHubChannelTypeStrict(type)
  return mappedType.status === "mapped"
    ? mappedType.value
    : AXON_HUB_CHANNEL_TYPE.OPENAI
}
