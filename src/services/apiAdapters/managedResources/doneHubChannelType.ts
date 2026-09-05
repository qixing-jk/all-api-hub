import type { DoneHubChannelType } from "~/constants/doneHub"
import { DoneHubChannelType as DoneHubType } from "~/constants/doneHub"
import { ChannelType } from "~/constants/newApi"

type StrictChannelTypeMapping<T> =
  | { status: "mapped"; value: T }
  | { status: "unsupported" }

const doneHubToCanonical = new Map<DoneHubChannelType, ChannelType>([
  [DoneHubType.OpenAI, ChannelType.OpenAI],
  [DoneHubType.AzureOpenAI, ChannelType.Azure],
  [DoneHubType.Custom, ChannelType.Custom],
  [DoneHubType.PaLM2, ChannelType.PaLM],
  [DoneHubType.Anthropic, ChannelType.Anthropic],
  [DoneHubType.Baidu, ChannelType.Baidu],
  [DoneHubType.Zhipu, ChannelType.Zhipu],
  [DoneHubType.Ali, ChannelType.Ali],
  [DoneHubType.Xunfei, ChannelType.Xunfei],
  [DoneHubType.Ai360, ChannelType["360"]],
  [DoneHubType.OpenRouter, ChannelType.OpenRouter],
  [DoneHubType.TencentLegacy, ChannelType.Tencent],
  [DoneHubType.Gemini, ChannelType.Gemini],
  [DoneHubType.MiniMax, ChannelType.MiniMax],
  [DoneHubType.DeepSeek, ChannelType.DeepSeek],
  [DoneHubType.Moonshot, ChannelType.Moonshot],
  [DoneHubType.Mistral, ChannelType.Mistral],
  [DoneHubType.LingYiWanWu, ChannelType.LingYiWanWu],
  [DoneHubType.Midjourney, ChannelType.Midjourney],
  [DoneHubType.Cloudflare, ChannelType.Cloudflare],
  [DoneHubType.Cohere, ChannelType.Cohere],
  [DoneHubType.Coze, ChannelType.Coze],
  [DoneHubType.Ollama, ChannelType.Ollama],
  [DoneHubType.Suno, ChannelType.SunoAPI],
  [DoneHubType.VertexAI, ChannelType.VertexAi],
  [DoneHubType.SiliconFlow, ChannelType.SiliconFlow],
  [DoneHubType.Jina, ChannelType.Jina],
  [DoneHubType.Replicate, ChannelType.Replicate],
  [DoneHubType.Kling, ChannelType.Kling],
  [DoneHubType.XAI, ChannelType.Xai],
  [DoneHubType.Codex, ChannelType.Codex],
])

const canonicalToDoneHub = new Map<ChannelType, DoneHubChannelType>(
  [...doneHubToCanonical].map(([doneHub, canonical]) => [canonical, doneHub]),
)

/** Maps one DoneHub-owned type only when its semantics are represented canonically. */
export function mapDoneHubChannelTypeToChannelTypeStrict(
  value: unknown,
): StrictChannelTypeMapping<ChannelType> {
  const numeric = Number(value)
  const mapped = doneHubToCanonical.get(numeric as DoneHubChannelType)
  return mapped === undefined
    ? { status: "unsupported" }
    : { status: "mapped", value: mapped }
}

/** Maps one canonical type to the exact DoneHub numeric contract. */
export function mapChannelTypeToDoneHubChannelTypeStrict(
  value: ChannelType,
): StrictChannelTypeMapping<DoneHubChannelType> {
  const mapped = canonicalToDoneHub.get(value)
  return mapped === undefined
    ? { status: "unsupported" }
    : { status: "mapped", value: mapped }
}
