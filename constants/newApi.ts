import { ChannelDefaults } from "~/types"

/**
 * Channel Type enumeration
 * Based on https://github.com/QuantumNous/new-api/blob/00782aae88c3ae6a3623ca557f6af17c4a28b8b9/constant/channel.go#L3
 */
export const ChannelType = {
  Unknown: 0,
  OpenAI: 1,
  Midjourney: 2,
  Azure: 3,
  Ollama: 4,
  MidjourneyPlus: 5,
  OpenAIMax: 6,
  OhMyGPT: 7,
  Custom: 8,
  AILS: 9,
  AIProxy: 10,
  PaLM: 11,
  API2GPT: 12,
  AIGC2D: 13,
  Anthropic: 14,
  Baidu: 15,
  Zhipu: 16,
  Ali: 17,
  Xunfei: 18,
  "360": 19,
  OpenRouter: 20,
  AIProxyLibrary: 21,
  FastGPT: 22,
  Tencent: 23,
  Gemini: 24,
  Moonshot: 25,
  Zhipu_v4: 26,
  Perplexity: 27,
  LingYiWanWu: 31,
  Aws: 33,
  Cohere: 34,
  MiniMax: 35,
  SunoAPI: 36,
  Dify: 37,
  Jina: 38,
  Cloudflare: 39,
  SiliconFlow: 40,
  VertexAi: 41,
  Mistral: 42,
  DeepSeek: 43,
  MokaAI: 44,
  VolcEngine: 45,
  BaiduV2: 46,
  Xinference: 47,
  Xai: 48,
  Coze: 49,
  Kling: 50,
  Jimeng: 51,
  Vidu: 52,
  Submodel: 53,
  DoubaoVideo: 54,
  Sora: 55
} as const

export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType]

/**
 * Default field values for all channels
 */
export const DEFAULT_CHANNEL_FIELDS: ChannelDefaults = {
  mode: "single",
  status: 1,
  priority: 0,
  weight: 0,
  groups: ["default"],
  models: [],
  type: ChannelType.OpenAI
}

export const ChannelTypeNames: Record<ChannelType, string> = {
  [ChannelType.Unknown]: "Unknown",
  [ChannelType.OpenAI]: "OpenAI",
  [ChannelType.Midjourney]: "Midjourney",
  [ChannelType.Azure]: "Azure",
  [ChannelType.Ollama]: "Ollama",
  [ChannelType.MidjourneyPlus]: "MidjourneyPlus",
  [ChannelType.OpenAIMax]: "OpenAIMax",
  [ChannelType.OhMyGPT]: "OhMyGPT",
  [ChannelType.Custom]: "Custom",
  [ChannelType.AILS]: "AILS",
  [ChannelType.AIProxy]: "AIProxy",
  [ChannelType.PaLM]: "PaLM",
  [ChannelType.API2GPT]: "API2GPT",
  [ChannelType.AIGC2D]: "AIGC2D",
  [ChannelType.Anthropic]: "Anthropic",
  [ChannelType.Baidu]: "Baidu",
  [ChannelType.Zhipu]: "Zhipu",
  [ChannelType.Ali]: "Ali",
  [ChannelType.Xunfei]: "Xunfei",
  [ChannelType["360"]]: "360",
  [ChannelType.OpenRouter]: "OpenRouter",
  [ChannelType.AIProxyLibrary]: "AIProxyLibrary",
  [ChannelType.FastGPT]: "FastGPT",
  [ChannelType.Tencent]: "Tencent",
  [ChannelType.Gemini]: "Gemini",
  [ChannelType.Moonshot]: "Moonshot",
  [ChannelType.Zhipu_v4]: "ZhipuV4",
  [ChannelType.Perplexity]: "Perplexity",
  [ChannelType.LingYiWanWu]: "LingYiWanWu",
  [ChannelType.Aws]: "AWS",
  [ChannelType.Cohere]: "Cohere",
  [ChannelType.MiniMax]: "MiniMax",
  [ChannelType.SunoAPI]: "SunoAPI",
  [ChannelType.Dify]: "Dify",
  [ChannelType.Jina]: "Jina",
  [ChannelType.Cloudflare]: "Cloudflare",
  [ChannelType.SiliconFlow]: "SiliconFlow",
  [ChannelType.VertexAi]: "VertexAI",
  [ChannelType.Mistral]: "Mistral",
  [ChannelType.DeepSeek]: "DeepSeek",
  [ChannelType.MokaAI]: "MokaAI",
  [ChannelType.VolcEngine]: "VolcEngine",
  [ChannelType.BaiduV2]: "BaiduV2",
  [ChannelType.Xinference]: "Xinference",
  [ChannelType.Xai]: "xAI",
  [ChannelType.Coze]: "Coze",
  [ChannelType.Kling]: "Kling",
  [ChannelType.Jimeng]: "Jimeng",
  [ChannelType.Vidu]: "Vidu",
  [ChannelType.Submodel]: "Submodel",
  [ChannelType.DoubaoVideo]: "DoubaoVideo",
  [ChannelType.Sora]: "Sora"
}

export const ChannelTypeOptions = Object.entries(ChannelTypeNames).map(
  ([key, label]) => ({
    value: Number(key) as ChannelType,
    label
  })
)
