// Source of truth: QuantumNous/new-api constant/channel.go.
// The numeric type and default base URL are protocol values sent to New API.
// https://github.com/QuantumNous/new-api/blob/main/constant/channel.go
import { getPublicChannelConfig } from "./channelConfig.js"
import { PROVIDER_ICON_NAMES } from "./providerIcons.js"

const CHANNELS = [
  [1, "openai", "OpenAI", "https://api.openai.com", "通用大模型"],
  [2, "midjourney", "Midjourney", "https://oa.api2d.net", "图像与视频"],
  [3, "azure", "Azure OpenAI", "", "云平台", "需要 Azure Endpoint"],
  [
    4,
    "ollama",
    "Ollama",
    "http://localhost:11434",
    "本地与自定义",
    "Key 可留空",
    true,
  ],
  [
    5,
    "midjourney-plus",
    "MidjourneyPlus",
    "https://api.openai-sb.com",
    "图像与视频",
  ],
  [6, "openai-max", "OpenAIMax", "https://api.openaimax.com", "兼容服务"],
  [7, "ohmygpt", "OhMyGPT", "https://api.ohmygpt.com", "兼容服务"],
  [8, "custom", "Custom", "", "本地与自定义", "需要自定义 Base URL"],
  [9, "ails", "AILS", "https://api.caipacity.com", "兼容服务"],
  [10, "aiproxy", "AIProxy", "https://api.aiproxy.io", "兼容服务"],
  [11, "palm", "PaLM", "", "Google"],
  [12, "api2gpt", "API2GPT", "https://api.api2gpt.com", "兼容服务"],
  [13, "aigc2d", "AIGC2D", "https://api.aigc2d.com", "兼容服务"],
  [14, "anthropic", "Anthropic", "https://api.anthropic.com", "通用大模型"],
  [15, "baidu", "Baidu", "https://aip.baidubce.com", "国内云平台"],
  [16, "zhipu", "Zhipu", "https://open.bigmodel.cn", "国内云平台"],
  [
    17,
    "ali",
    "Ali / DashScope",
    "https://dashscope.aliyuncs.com",
    "国内云平台",
  ],
  [18, "xunfei", "Xunfei", "", "国内云平台", "通常需要组合凭证"],
  [19, "360", "360", "https://api.360.cn", "国内云平台"],
  [20, "openrouter", "OpenRouter", "https://openrouter.ai/api", "聚合服务"],
  [
    21,
    "aiproxy-library",
    "AIProxyLibrary",
    "https://api.aiproxy.io",
    "兼容服务",
  ],
  [22, "fastgpt", "FastGPT", "https://fastgpt.run/api/openapi", "兼容服务"],
  [
    23,
    "tencent",
    "Tencent Hunyuan",
    "https://hunyuan.tencentcloudapi.com",
    "国内云平台",
    "通常需要组合凭证",
  ],
  [
    24,
    "gemini",
    "Google Gemini",
    "https://generativelanguage.googleapis.com",
    "Google",
  ],
  [25, "moonshot", "Moonshot", "https://api.moonshot.cn", "通用大模型"],
  [26, "zhipu-v4", "ZhipuV4", "https://open.bigmodel.cn", "国内云平台"],
  [27, "perplexity", "Perplexity", "https://api.perplexity.ai", "通用大模型"],
  [
    31,
    "lingyiwanwu",
    "LingYiWanWu",
    "https://api.lingyiwanwu.com",
    "国内云平台",
  ],
  [33, "aws", "AWS Bedrock", "", "云平台", "需要区域和 AWS 组合凭证"],
  [34, "cohere", "Cohere", "https://api.cohere.ai", "通用大模型"],
  [35, "minimax", "MiniMax", "https://api.minimax.chat", "通用大模型"],
  [36, "suno", "SunoAPI", "", "音频"],
  [37, "dify", "Dify", "https://api.dify.ai", "兼容服务"],
  [38, "jina", "Jina", "https://api.jina.ai", "通用大模型"],
  [
    39,
    "cloudflare",
    "Cloudflare",
    "https://api.cloudflare.com",
    "云平台",
    "需要 Account ID 等组合信息",
  ],
  [40, "siliconflow", "SiliconFlow", "https://api.siliconflow.cn", "聚合服务"],
  [41, "vertex-ai", "VertexAI", "", "Google", "需要服务账号 JSON 和区域配置"],
  [42, "mistral", "Mistral", "https://api.mistral.ai", "通用大模型"],
  [43, "deepseek", "DeepSeek", "https://api.deepseek.com", "通用大模型"],
  [44, "moka-ai", "MokaAI", "https://api.moka.ai", "兼容服务"],
  [
    45,
    "volcengine",
    "VolcEngine",
    "https://ark.cn-beijing.volces.com",
    "国内云平台",
    "可能需要模型部署配置",
  ],
  [
    46,
    "baidu-v2",
    "BaiduV2",
    "https://qianfan.baidubce.com",
    "国内云平台",
    "通常需要组合凭证",
  ],
  [47, "xinference", "Xinference", "", "本地与自定义", "需要自定义 Base URL"],
  [48, "xai", "xAI", "https://api.x.ai", "通用大模型"],
  [
    49,
    "coze",
    "Coze",
    "https://api.coze.cn",
    "国内云平台",
    "可能需要 Bot 配置",
  ],
  [
    50,
    "kling",
    "Kling",
    "https://api.klingai.com",
    "图像与视频",
    "通常需要组合凭证",
  ],
  [
    51,
    "jimeng",
    "Jimeng",
    "https://visual.volcengineapi.com",
    "图像与视频",
    "通常需要组合凭证",
  ],
  [52, "vidu", "Vidu", "https://api.vidu.cn", "图像与视频"],
  [53, "submodel", "Submodel", "https://llm.submodel.ai", "兼容服务"],
  [
    54,
    "doubao-video",
    "DoubaoVideo",
    "https://ark.cn-beijing.volces.com",
    "图像与视频",
    "可能需要模型部署配置",
  ],
  [55, "sora", "Sora", "https://api.openai.com", "图像与视频"],
  [56, "replicate", "Replicate", "https://api.replicate.com", "图像与视频"],
  [
    57,
    "codex",
    "ChatGPT Subscription (Codex)",
    "https://chatgpt.com",
    "订阅与 OAuth",
    "需要在 New API 中完成 OAuth，不支持纯 Key 导入",
    false,
    false,
  ],
  [
    58,
    "advanced-custom",
    "Advanced Custom",
    "",
    "本地与自定义",
    "需要完整的高级渠道配置，不支持纯 Key 导入",
    false,
    false,
  ],
]

const PROVIDERS = Object.freeze(
  Object.fromEntries(
    CHANNELS.map(
      ([
        channelType,
        id,
        name,
        baseUrl,
        category,
        hint = "API Key",
        keyOptional = false,
        importable = true,
      ]) => [
        id,
        Object.freeze({
          id,
          name,
          description: hint,
          channelType,
          baseUrl,
          category,
          hasIcon: Boolean(PROVIDER_ICON_NAMES[id]),
          keyOptional,
          importable,
          requiresBaseUrl:
            !baseUrl && ![11, 18, 33, 41, 57, 58].includes(channelType),
          channelConfig: getPublicChannelConfig(id, channelType),
        }),
      ],
    ),
  ),
)

export function listPublicProviders() {
  return CHANNELS.map(([, id]) => PROVIDERS[id])
}

export function getProvider(providerId) {
  const provider = PROVIDERS[providerId]
  if (!provider) throw new Error("暂不支持这个来源")
  return provider
}

export function resolveProviderBaseUrl(provider, override) {
  const value = String(override || provider.baseUrl || "").trim()
  if (!value) {
    if (provider.requiresBaseUrl) throw new Error("这个渠道需要填写 Base URL")
    return ""
  }
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error("请输入完整的来源 Base URL")
  }
  if (!new Set(["https:", "http:"]).has(url.protocol)) {
    throw new Error("来源 Base URL 只支持 HTTP 或 HTTPS")
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("来源 Base URL 不能包含凭证、查询参数或锚点")
  }
  return url.toString().replace(/\/$/, "")
}
