/**
 * 模型厂商识别和图标映射工具
 */

import {
  Azure,
  Baichuan,
  Baidu,
  Claude,
  Cohere,
  DeepMind,
  DeepSeek,
  Gemini,
  Grok,
  Mistral,
  Moonshot,
  Ollama,
  OpenAI,
  Qwen,
  Tencent,
  Yi,
  Zhipu,
} from "@lobehub/icons"

import { resolveCuratedModelVendor } from "~/services/models/modelVendor"

// 厂商类型
export type ProviderType = keyof typeof PROVIDER_CONFIGS

export const MODEL_PROVIDER_FILTER_VALUES = {
  ALL: "all",
} as const

export type ModelProviderFilterValue =
  | ProviderType
  | (typeof MODEL_PROVIDER_FILTER_VALUES)[keyof typeof MODEL_PROVIDER_FILTER_VALUES]

// 厂商配置接口
interface ProviderConfig {
  name: string
  icon: React.ComponentType<any>
  patterns: RegExp[]
  color: string
  bgColor: string
}

// todo: 考虑优先使用owner_by来识别厂商
// 厂商配置映射
export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  OpenAI: {
    name: "OpenAI",
    icon: OpenAI,
    patterns: [
      /gpt|whisper/i,
      /o\d+/i, // o1, o3 等
      /text-embedding/i,
    ],
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  Claude: {
    name: "Claude",
    icon: Claude,
    patterns: [/claude/i, /sonnet/i, /haiku/i, /neptune/i, /opus/i],
    color: "text-orange-600",
    bgColor: "bg-orange-50",
  },
  Gemini: {
    name: "Gemini",
    icon: Gemini,
    patterns: [/gemini/i],
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  Grok: {
    name: "Grok",
    icon: Grok,
    patterns: [/grok/i],
    color: "text-gray-900",
    bgColor: "bg-gray-50",
  },
  Qwen: {
    name: "阿里",
    icon: Qwen,
    patterns: [/qwen/i],
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
  DeepSeek: {
    name: "DeepSeek",
    icon: DeepSeek,
    patterns: [/deepseek/i],
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
  },
  Mistral: {
    name: "Mistral",
    icon: Mistral,
    patterns: [
      /mistral|magistral|mixtral|codestral|pixtral|devstral|Voxtral|ministral/i,
    ],
    color: "text-orange-500",
    bgColor: "bg-orange-50",
  },
  Moonshot: {
    name: "Moonshot",
    icon: Moonshot,
    patterns: [/moonshot|kimi/i],
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
  },
  Azure: {
    name: "Azure",
    icon: Azure,
    patterns: [/azure/i],
    color: "text-blue-500",
    bgColor: "bg-blue-50",
  },
  ZhipuAI: {
    name: "智谱",
    icon: Zhipu,
    patterns: [/glm/i],
    color: "text-blue-700",
    bgColor: "bg-blue-50",
  },
  DeepMind: {
    name: "DeepMind",
    icon: DeepMind,
    patterns: [/gemma|imagen/i],
    color: "text-blue-700",
    bgColor: "bg-blue-50",
  },
  Ollama: {
    name: "Ollama",
    icon: Ollama,
    patterns: [/llama/i],
    color: "text-blue-700",
    bgColor: "bg-blue-50",
  },
  Tencent: {
    name: "腾讯",
    icon: Tencent,
    patterns: [/Tencent|hunyuan/i],
    color: "text-blue-700",
    bgColor: "bg-blue-50",
  },
  Baidu: {
    name: "百度",
    icon: Baidu,
    patterns: [/Baidu|ERNIE/i],
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
  },
  yi: {
    name: "零一万物",
    icon: Yi,
    patterns: [/01-ai|yi/i],
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
  },
  Baichuan: {
    name: "百川",
    icon: Baichuan,
    patterns: [/baichuan/i],
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
  },
  Cohere: {
    name: "Cohere",
    icon: Cohere,
    patterns: [/command|c4ai/i],
    color: "text-purple-500",
    bgColor: "bg-purple-50",
  },
  Unknown: {
    name: "Unknown",
    icon: () => null,
    patterns: [],
    color: "text-gray-600",
    bgColor: "bg-gray-50",
  },
}

const PROTOCOL_COMPATIBILITY_RULES: ReadonlyArray<{
  provider: "Claude" | "Gemini"
  pattern: RegExp
}> = [
  {
    provider: "Claude",
    pattern:
      /(?:^|[^\p{L}\p{N}])(?:claude|sonnet|haiku|neptune|opus)(?:[-_.]|$)/iu,
  },
  {
    provider: "Gemini",
    pattern: /(?:^|[^\p{L}\p{N}])gemini(?:[-_.]|$)/iu,
  },
]

/** Keeps protocol-family aliases independent from publisher taxonomy. */
function identifyProtocolCompatibilityProvider(
  modelName: string,
): "Claude" | "Gemini" | null {
  return (
    PROTOCOL_COMPATIBILITY_RULES.find(({ pattern }) => pattern.test(modelName))
      ?.provider ?? null
  )
}

/**
 * 根据模型名称识别厂商
 */
export const identifyProvider = (modelName: string): ProviderType => {
  const protocolProvider = identifyProtocolCompatibilityProvider(modelName)
  if (protocolProvider) return protocolProvider

  const vendor = resolveCuratedModelVendor(modelName)
  if (vendor.state !== "candidate" || vendor.kind !== "known") {
    return "Unknown"
  }

  const legacyProviderByVendor: Partial<Record<string, ProviderType>> = {
    openai: "OpenAI",
    anthropic: "Claude",
    google: /(?:^|[^a-z0-9])(?:gemma|imagen)(?:[-_.]|$)/i.test(modelName)
      ? "DeepMind"
      : "Gemini",
    meta: "Ollama",
    alibaba: "Qwen",
    xai: "Grok",
    deepseek: "DeepSeek",
    mistral: "Mistral",
    moonshot: "Moonshot",
    zhipu: "ZhipuAI",
    cohere: "Cohere",
    tencent: "Tencent",
    baidu: "Baidu",
    baichuan: "Baichuan",
    "01-ai": "yi",
  }

  return legacyProviderByVendor[vendor.knownId] ?? "Unknown"
}

/**
 * 获取厂商配置
 */
export const getProviderConfig = (modelName: string): ProviderConfig => {
  const providerType = identifyProvider(modelName)
  return PROVIDER_CONFIGS[providerType]
}

/**
 * 获取所有厂商类型
 */
export const getAllProviders = (): ProviderType[] => {
  return Object.keys(PROVIDER_CONFIGS).filter(
    (key) => key !== "Unknown",
  ) as ProviderType[]
}

/**
 * 根据厂商类型过滤模型
 */
export const filterModelsByProvider = <T extends { model_name: string }>(
  models: T[],
  providerType: ModelProviderFilterValue,
): T[] => {
  if (providerType === MODEL_PROVIDER_FILTER_VALUES.ALL) return models

  return models.filter(
    (model) => identifyProvider(model.model_name) === providerType,
  )
}
