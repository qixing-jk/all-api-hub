import {
  AXON_HUB_CHANNEL_TYPE,
  type AxonHubChannelType,
} from "~/constants/axonHub"
import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  type ClaudeCodeHubProviderType,
} from "~/constants/claudeCodeHub"
import { DoneHubChannelType as DoneHubType } from "~/constants/doneHub"
import { ChannelType as NewApiType } from "~/constants/newApi"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import type { Sub2ApiApiKeyAccountPlatform } from "~/constants/sub2api"
import { VeloeraChannelType as VeloeraType } from "~/constants/veloera"
import type { ManagedSiteMigrationSource } from "~/types/managedSiteMigrationCapability"
import { OctopusOutboundType as OctopusType } from "~/types/octopus"

const {
  NEW_API,
  VELOERA,
  DONE_HUB,
  OCTOPUS,
  AXON_HUB,
  CLAUDE_CODE_HUB,
  SUB2API,
} = SITE_TYPES

type NativeChannelTypeBySite = {
  [NEW_API]: NewApiType
  [VELOERA]: VeloeraType
  [DONE_HUB]: DoneHubType
  [OCTOPUS]: OctopusType
  [AXON_HUB]: AxonHubChannelType
  [CLAUDE_CODE_HUB]: ClaudeCodeHubProviderType
  [SUB2API]: Sub2ApiApiKeyAccountPlatform
}

/**
 * A scalar explicitly permits that native type as both source and target.
 * Directional entries list accepted sources separately; omitting sourceTypes
 * makes an entry target-only. Remapping means a protocol/provider-mode change,
 * never a comparison between two providers' numeric identifiers.
 */
type TypeRouteEntry<T> =
  | T
  | {
      sourceTypes?: readonly T[]
      targetType: T
      remappedType: true
    }
type TypeRoute = {
  [Site in keyof NativeChannelTypeBySite]?: TypeRouteEntry<
    NativeChannelTypeBySite[Site]
  >
}

/**
 * Explicit native migration routes. There is no intermediate channel enum.
 * Source aliases share only this row's target rules; no inverse or transitive
 * routes are inferred. Provider-owned catalogs pin the upstream vocabularies.
 * In particular, Veloera/DoneHub 49 (GitHub Models) is not New API 49 (Coze).
 */
const routes: readonly TypeRoute[] = [
  {
    [NEW_API]: NewApiType.OpenAI,
    [VELOERA]: VeloeraType.OpenAI,
    [DONE_HUB]: DoneHubType.OpenAI,
    [OCTOPUS]: OctopusType.OpenAIChat,
    [AXON_HUB]: AXON_HUB_CHANNEL_TYPE.OPENAI,
    [CLAUDE_CODE_HUB]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
    [SUB2API]: "openai",
  },
  {
    [NEW_API]: { targetType: NewApiType.OpenAI, remappedType: true },
    [VELOERA]: { targetType: VeloeraType.OpenAI, remappedType: true },
    [DONE_HUB]: { targetType: DoneHubType.OpenAI, remappedType: true },
    [OCTOPUS]: OctopusType.OpenAIResponse,
    [AXON_HUB]: AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES,
    // Sub2API's OpenAI API-key platform supports Responses and Chat
    // Completions, but does not retain an endpoint-specific channel type.
    // github.com/Wei-Shaw/sub2api/blob/b7dba62678a834080564966c002fd0ca2b328b7a/backend/internal/service/openai_gateway_chat_completions_raw.go
    [SUB2API]: { targetType: "openai", remappedType: true },
    [CLAUDE_CODE_HUB]: {
      targetType: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
      remappedType: true,
    },
  },
  {
    [NEW_API]: { targetType: NewApiType.OpenAI, remappedType: true },
    [VELOERA]: { targetType: VeloeraType.OpenAI, remappedType: true },
    [DONE_HUB]: { targetType: DoneHubType.OpenAI, remappedType: true },
    [OCTOPUS]: OctopusType.OpenAIEmbedding,
    [AXON_HUB]: {
      targetType: AXON_HUB_CHANNEL_TYPE.OPENAI,
      remappedType: true,
    },
    [CLAUDE_CODE_HUB]: {
      targetType: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
      remappedType: true,
    },
  },
  {
    [NEW_API]: { targetType: NewApiType.OpenAI, remappedType: true },
    [VELOERA]: { targetType: VeloeraType.OpenAI, remappedType: true },
    [DONE_HUB]: { targetType: DoneHubType.OpenAI, remappedType: true },
    [OCTOPUS]: { targetType: OctopusType.OpenAIChat, remappedType: true },
    [AXON_HUB]: {
      sourceTypes: [
        AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT,
        AXON_HUB_CHANNEL_TYPE.NANOGPT,
      ],
      targetType: AXON_HUB_CHANNEL_TYPE.OPENAI,
      remappedType: true,
    },
  },
  {
    [NEW_API]: NewApiType.Anthropic,
    [VELOERA]: VeloeraType.Anthropic,
    [DONE_HUB]: DoneHubType.Anthropic,
    [OCTOPUS]: OctopusType.Anthropic,
    [AXON_HUB]: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
    [CLAUDE_CODE_HUB]: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
    [SUB2API]: "anthropic",
  },
  {
    [NEW_API]: { targetType: NewApiType.Anthropic, remappedType: true },
    [VELOERA]: { targetType: VeloeraType.Anthropic, remappedType: true },
    [DONE_HUB]: { targetType: DoneHubType.Anthropic, remappedType: true },
    [OCTOPUS]: { targetType: OctopusType.Anthropic, remappedType: true },
    [AXON_HUB]: {
      sourceTypes: [
        AXON_HUB_CHANNEL_TYPE.ANTHROPIC_AWS,
        AXON_HUB_CHANNEL_TYPE.ANTHROPIC_GCP,
        AXON_HUB_CHANNEL_TYPE.CLAUDECODE,
      ],
      targetType: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
      remappedType: true,
    },
    [CLAUDE_CODE_HUB]: {
      targetType: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      remappedType: true,
    },
  },
  {
    [NEW_API]: NewApiType.Gemini,
    [VELOERA]: VeloeraType.Gemini,
    [DONE_HUB]: DoneHubType.Gemini,
    [OCTOPUS]: OctopusType.Gemini,
    [AXON_HUB]: AXON_HUB_CHANNEL_TYPE.GEMINI,
    [CLAUDE_CODE_HUB]: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
    [SUB2API]: "gemini",
  },
  {
    [NEW_API]: { targetType: NewApiType.Gemini, remappedType: true },
    [VELOERA]: { targetType: VeloeraType.Gemini, remappedType: true },
    [DONE_HUB]: { targetType: DoneHubType.Gemini, remappedType: true },
    [OCTOPUS]: { targetType: OctopusType.Gemini, remappedType: true },
    [AXON_HUB]: {
      sourceTypes: [
        AXON_HUB_CHANNEL_TYPE.GEMINI_OPENAI,
        AXON_HUB_CHANNEL_TYPE.GEMINI_VERTEX,
      ],
      targetType: AXON_HUB_CHANNEL_TYPE.GEMINI,
      remappedType: true,
    },
    [CLAUDE_CODE_HUB]: {
      targetType: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
      remappedType: true,
    },
  },
  {
    [NEW_API]: NewApiType.VertexAi,
    [VELOERA]: VeloeraType.VertexAi,
    [DONE_HUB]: DoneHubType.VertexAI,
    [AXON_HUB]: {
      targetType: AXON_HUB_CHANNEL_TYPE.GEMINI,
      remappedType: true,
    },
    [CLAUDE_CODE_HUB]: {
      targetType: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
      remappedType: true,
    },
  },
  {
    [NEW_API]: NewApiType.DeepSeek,
    [VELOERA]: VeloeraType.DeepSeek,
    [DONE_HUB]: DoneHubType.DeepSeek,
    [AXON_HUB]: AXON_HUB_CHANNEL_TYPE.DEEPSEEK,
  },
  {
    [NEW_API]: { targetType: NewApiType.DeepSeek, remappedType: true },
    [VELOERA]: { targetType: VeloeraType.DeepSeek, remappedType: true },
    [DONE_HUB]: { targetType: DoneHubType.DeepSeek, remappedType: true },
    [AXON_HUB]: {
      sourceTypes: [AXON_HUB_CHANNEL_TYPE.DEEPSEEK_ANTHROPIC],
      targetType: AXON_HUB_CHANNEL_TYPE.DEEPSEEK,
      remappedType: true,
    },
  },
  {
    [NEW_API]: NewApiType.Midjourney,
    [VELOERA]: VeloeraType.Midjourney,
    [DONE_HUB]: DoneHubType.Midjourney,
  },
  {
    [NEW_API]: NewApiType.Azure,
    [VELOERA]: VeloeraType.Azure,
    [DONE_HUB]: DoneHubType.AzureOpenAI,
  },
  {
    [NEW_API]: NewApiType.Ollama,
    [VELOERA]: VeloeraType.Ollama,
    [DONE_HUB]: DoneHubType.Ollama,
    [AXON_HUB]: AXON_HUB_CHANNEL_TYPE.OLLAMA,
  },
  {
    [NEW_API]: NewApiType.MidjourneyPlus,
    [VELOERA]: VeloeraType.MidjourneyPlus,
  },
  {
    [NEW_API]: NewApiType.OpenAIMax,
  },
  {
    [NEW_API]: NewApiType.OhMyGPT,
  },
  {
    [NEW_API]: NewApiType.Custom,
    [VELOERA]: VeloeraType.Custom,
    [DONE_HUB]: DoneHubType.Custom,
  },
  {
    [NEW_API]: NewApiType.AILS,
  },
  {
    [NEW_API]: NewApiType.AIProxy,
  },
  {
    [NEW_API]: NewApiType.PaLM,
    [VELOERA]: VeloeraType.PaLM,
    [DONE_HUB]: DoneHubType.PaLM2,
  },
  {
    [NEW_API]: NewApiType.API2GPT,
  },
  {
    [NEW_API]: NewApiType.AIGC2D,
  },
  {
    [NEW_API]: NewApiType.Baidu,
    [VELOERA]: VeloeraType.Baidu,
    [DONE_HUB]: DoneHubType.Baidu,
  },
  {
    [NEW_API]: NewApiType.Zhipu,
    [VELOERA]: VeloeraType.Zhipu,
    [DONE_HUB]: DoneHubType.Zhipu,
  },
  {
    [NEW_API]: NewApiType.Ali,
    [VELOERA]: VeloeraType.Ali,
    [DONE_HUB]: DoneHubType.Ali,
  },
  {
    [NEW_API]: NewApiType.Xunfei,
    [VELOERA]: VeloeraType.Xunfei,
    [DONE_HUB]: DoneHubType.Xunfei,
  },
  {
    [NEW_API]: NewApiType["360"],
    [VELOERA]: VeloeraType.Ai360,
    [DONE_HUB]: DoneHubType.Ai360,
  },
  {
    [NEW_API]: NewApiType.OpenRouter,
    [VELOERA]: VeloeraType.OpenRouter,
    [DONE_HUB]: DoneHubType.OpenRouter,
    [AXON_HUB]: AXON_HUB_CHANNEL_TYPE.OPENROUTER,
  },
  {
    [NEW_API]: NewApiType.AIProxyLibrary,
    [VELOERA]: VeloeraType.AiProxyLibrary,
  },
  {
    [NEW_API]: NewApiType.FastGPT,
    [VELOERA]: VeloeraType.FastGPT,
  },
  {
    [NEW_API]: NewApiType.Tencent,
    [VELOERA]: VeloeraType.Tencent,
    [DONE_HUB]: DoneHubType.TencentLegacy,
  },
  {
    [NEW_API]: NewApiType.Moonshot,
    [VELOERA]: VeloeraType.Moonshot,
    [DONE_HUB]: DoneHubType.Moonshot,
  },
  {
    [NEW_API]: NewApiType.Zhipu_v4,
  },
  {
    [NEW_API]: NewApiType.Perplexity,
  },
  {
    [NEW_API]: NewApiType.LingYiWanWu,
    [VELOERA]: VeloeraType.LingYiWanWu,
    [DONE_HUB]: DoneHubType.LingYiWanWu,
  },
  {
    [NEW_API]: NewApiType.Aws,
    [VELOERA]: VeloeraType.Aws,
  },
  {
    [NEW_API]: NewApiType.Cohere,
    [VELOERA]: VeloeraType.Cohere,
    [DONE_HUB]: DoneHubType.Cohere,
  },
  {
    [NEW_API]: NewApiType.MiniMax,
    [VELOERA]: VeloeraType.MiniMax,
    [DONE_HUB]: DoneHubType.MiniMax,
  },
  {
    [NEW_API]: NewApiType.SunoAPI,
    [VELOERA]: VeloeraType.SunoAPI,
    [DONE_HUB]: DoneHubType.Suno,
  },
  {
    [NEW_API]: NewApiType.Dify,
    [VELOERA]: VeloeraType.Dify,
  },
  {
    [NEW_API]: NewApiType.Jina,
    [VELOERA]: VeloeraType.Jina,
    [DONE_HUB]: DoneHubType.Jina,
  },
  {
    [NEW_API]: NewApiType.Cloudflare,
    [VELOERA]: VeloeraType.Cloudflare,
    [DONE_HUB]: DoneHubType.Cloudflare,
  },
  {
    [NEW_API]: NewApiType.SiliconFlow,
    [VELOERA]: VeloeraType.SiliconFlow,
    [DONE_HUB]: DoneHubType.SiliconFlow,
    [AXON_HUB]: AXON_HUB_CHANNEL_TYPE.SILICONFLOW,
  },
  {
    [NEW_API]: NewApiType.Mistral,
    [VELOERA]: VeloeraType.Mistral,
    [DONE_HUB]: DoneHubType.Mistral,
  },
  {
    [NEW_API]: NewApiType.MokaAI,
    [VELOERA]: VeloeraType.MokaAI,
  },
  {
    [NEW_API]: NewApiType.VolcEngine,
    [VELOERA]: VeloeraType.VolcEngine,
    [OCTOPUS]: OctopusType.Volcengine,
    [AXON_HUB]: AXON_HUB_CHANNEL_TYPE.VOLCENGINE,
  },
  {
    [NEW_API]: NewApiType.BaiduV2,
    [VELOERA]: VeloeraType.BaiduV2,
  },
  {
    [NEW_API]: NewApiType.Xinference,
    [VELOERA]: VeloeraType.Xinference,
  },
  {
    [NEW_API]: NewApiType.Xai,
    [VELOERA]: VeloeraType.Xai,
    [DONE_HUB]: DoneHubType.XAI,
    [AXON_HUB]: AXON_HUB_CHANNEL_TYPE.XAI,
    [SUB2API]: "grok",
  },
  {
    [NEW_API]: NewApiType.Coze,
    [DONE_HUB]: DoneHubType.Coze,
  },
  {
    [NEW_API]: NewApiType.Kling,
    [DONE_HUB]: DoneHubType.Kling,
  },
  {
    [NEW_API]: NewApiType.Jimeng,
  },
  {
    [NEW_API]: NewApiType.Vidu,
  },
  {
    [NEW_API]: NewApiType.Submodel,
  },
  {
    [NEW_API]: NewApiType.DoubaoVideo,
  },
  {
    [NEW_API]: NewApiType.Sora,
  },
  {
    [NEW_API]: NewApiType.Replicate,
    [DONE_HUB]: DoneHubType.Replicate,
  },
  {
    [NEW_API]: NewApiType.Codex,
    [DONE_HUB]: DoneHubType.Codex,
    [CLAUDE_CODE_HUB]: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
  },
  {
    [NEW_API]: NewApiType.AdvancedCustom,
  },
  {
    [NEW_API]: NewApiType.Sub2API,
  },
  {
    [NEW_API]: NewApiType.NewAPI,
  },
]

const findSourceRoute = (
  siteType: ManagedSiteType,
  resourceType: string | number,
) =>
  routes.find((route) => {
    const entry = route[siteType]
    return typeof entry === "object"
      ? entry.sourceTypes?.some((type) => type === resourceType) === true
      : entry !== undefined && entry === resourceType
  })

/** A known native source needs an explicit migration route, not just a catalog label. */
export const isManagedSiteMigrationSourceType = (
  siteType: ManagedSiteType,
  resourceType: string | number,
): boolean => findSourceRoute(siteType, resourceType) !== undefined

/** Resolves one directional native-type conversion without reinterpreting an enum. */
export function resolveManagedSiteMigrationType<
  Target extends keyof NativeChannelTypeBySite,
>(
  source: Pick<ManagedSiteMigrationSource, "sourceSiteType" | "resourceType">,
  targetSiteType: Target,
):
  | {
      status: "mapped"
      value: NativeChannelTypeBySite[Target]
      remappedType: boolean
    }
  | { status: "unsupported" } {
  const route = findSourceRoute(source.sourceSiteType, source.resourceType)
  if (!route) return { status: "unsupported" }

  const target = route[targetSiteType]
  if (target !== undefined) {
    return typeof target === "object"
      ? {
          status: "mapped",
          value: target.targetType,
          remappedType: target.remappedType,
        }
      : {
          status: "mapped",
          value: target as NativeChannelTypeBySite[Target],
          remappedType: false,
        }
  }

  // CCH's existing OpenAI-compatible fallback is limited to the explicitly
  // admitted sources above. Unknown, GitHub Models and other unlisted native
  // types must never acquire a fallback merely because a catalog names them.
  if (targetSiteType === CLAUDE_CODE_HUB) {
    return {
      status: "mapped",
      value:
        CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE as NativeChannelTypeBySite[Target],
      remappedType: true,
    }
  }
  return { status: "unsupported" }
}
