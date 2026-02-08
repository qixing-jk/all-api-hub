import { OctopusOutboundType } from "~/types/octopus"

/**
 * Octopus 渠道类型选项
 * 用于 UI 下拉选择器
 */
export const OctopusOutboundTypeOptions = [
  {
    value: OctopusOutboundType.OpenAIChat,
    label: "OpenAI Chat",
    description: "OpenAI 聊天补全 API",
  },
  {
    value: OctopusOutboundType.OpenAIResponse,
    label: "OpenAI Response",
    description: "OpenAI 响应模式",
  },
  {
    value: OctopusOutboundType.Anthropic,
    label: "Anthropic",
    description: "Claude API",
  },
  {
    value: OctopusOutboundType.Gemini,
    label: "Gemini",
    description: "Google Gemini API",
  },
  {
    value: OctopusOutboundType.Volcengine,
    label: "Volcengine",
    description: "火山引擎 API",
  },
  {
    value: OctopusOutboundType.OpenAIEmbedding,
    label: "OpenAI Embedding",
    description: "OpenAI 嵌入 API",
  },
] as const

/**
 * Octopus 渠道类型名称映射
 */
export const OctopusOutboundTypeNames: Record<number, string> = {
  [OctopusOutboundType.OpenAIChat]: "OpenAI Chat",
  [OctopusOutboundType.OpenAIResponse]: "OpenAI Response",
  [OctopusOutboundType.Anthropic]: "Anthropic",
  [OctopusOutboundType.Gemini]: "Gemini",
  [OctopusOutboundType.Volcengine]: "Volcengine",
  [OctopusOutboundType.OpenAIEmbedding]: "OpenAI Embedding",
}

/**
 * 获取渠道类型的显示名称
 */
export function getOctopusTypeName(type: OctopusOutboundType): string {
  return OctopusOutboundTypeNames[type] || `Unknown (${type})`
}

/**
 * Octopus 默认渠道字段值
 */
export const DEFAULT_OCTOPUS_CHANNEL_FIELDS = {
  type: OctopusOutboundType.OpenAIChat,
  enabled: true,
  proxy: false,
  auto_sync: true, // 默认启用自动同步
  auto_group: 0,
} as const
