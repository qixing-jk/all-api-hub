import Ai2Color from "@lobehub/icons/es/Ai2/components/Color"
import Ai2 from "@lobehub/icons/es/Ai2/components/Mono"
import AlibabaColor from "@lobehub/icons/es/Alibaba/components/Color"
import Alibaba from "@lobehub/icons/es/Alibaba/components/Mono"
import Anthropic from "@lobehub/icons/es/Anthropic/components/Mono"
import ArceeColor from "@lobehub/icons/es/Arcee/components/Color"
import Arcee from "@lobehub/icons/es/Arcee/components/Mono"
import AwsColor from "@lobehub/icons/es/Aws/components/Color"
import Aws from "@lobehub/icons/es/Aws/components/Mono"
import BAAI from "@lobehub/icons/es/BAAI/components/Mono"
import BaichuanColor from "@lobehub/icons/es/Baichuan/components/Color"
import Baichuan from "@lobehub/icons/es/Baichuan/components/Mono"
import BaiduColor from "@lobehub/icons/es/Baidu/components/Color"
import Baidu from "@lobehub/icons/es/Baidu/components/Mono"
import ByteDanceColor from "@lobehub/icons/es/ByteDance/components/Color"
import ByteDance from "@lobehub/icons/es/ByteDance/components/Mono"
import CohereColor from "@lobehub/icons/es/Cohere/components/Color"
import Cohere from "@lobehub/icons/es/Cohere/components/Mono"
import DeepCogitoColor from "@lobehub/icons/es/DeepCogito/components/Color"
import DeepCogito from "@lobehub/icons/es/DeepCogito/components/Mono"
import DeepSeekColor from "@lobehub/icons/es/DeepSeek/components/Color"
import DeepSeek from "@lobehub/icons/es/DeepSeek/components/Mono"
import EssentialAIColor from "@lobehub/icons/es/EssentialAI/components/Color"
import EssentialAI from "@lobehub/icons/es/EssentialAI/components/Mono"
import GoogleColor from "@lobehub/icons/es/Google/components/Color"
import Google from "@lobehub/icons/es/Google/components/Mono"
import Groq from "@lobehub/icons/es/Groq/components/Mono"
import Inception from "@lobehub/icons/es/Inception/components/Mono"
import InternLMColor from "@lobehub/icons/es/InternLM/components/Color"
import InternLM from "@lobehub/icons/es/InternLM/components/Mono"
import Jina from "@lobehub/icons/es/Jina/components/Mono"
import KiloCode from "@lobehub/icons/es/KiloCode/components/Mono"
import KolorsColor from "@lobehub/icons/es/Kolors/components/Color"
import Kolors from "@lobehub/icons/es/Kolors/components/Mono"
import Liquid from "@lobehub/icons/es/Liquid/components/Mono"
import LongCatColor from "@lobehub/icons/es/LongCat/components/Color"
import LongCat from "@lobehub/icons/es/LongCat/components/Mono"
import MetaColor from "@lobehub/icons/es/Meta/components/Color"
import Meta from "@lobehub/icons/es/Meta/components/Mono"
import MicrosoftColor from "@lobehub/icons/es/Microsoft/components/Color"
import Microsoft from "@lobehub/icons/es/Microsoft/components/Mono"
import MinimaxColor from "@lobehub/icons/es/Minimax/components/Color"
import Minimax from "@lobehub/icons/es/Minimax/components/Mono"
import MistralColor from "@lobehub/icons/es/Mistral/components/Color"
import Mistral from "@lobehub/icons/es/Mistral/components/Mono"
import Moonshot from "@lobehub/icons/es/Moonshot/components/Mono"
import NvidiaColor from "@lobehub/icons/es/Nvidia/components/Color"
import Nvidia from "@lobehub/icons/es/Nvidia/components/Mono"
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono"
import OpenCode from "@lobehub/icons/es/OpenCode/components/Mono"
import OpenRouterColor from "@lobehub/icons/es/OpenRouter/components/Color"
import OpenRouter from "@lobehub/icons/es/OpenRouter/components/Mono"
import PerplexityColor from "@lobehub/icons/es/Perplexity/components/Color"
import Perplexity from "@lobehub/icons/es/Perplexity/components/Mono"
import SenseNovaColor from "@lobehub/icons/es/SenseNova/components/Color"
import SenseNova from "@lobehub/icons/es/SenseNova/components/Mono"
import Stepfun from "@lobehub/icons/es/Stepfun/components/Mono"
import TencentColor from "@lobehub/icons/es/Tencent/components/Color"
import Tencent from "@lobehub/icons/es/Tencent/components/Mono"
import type { IconType } from "@lobehub/icons/es/types"
import UpstageColor from "@lobehub/icons/es/Upstage/components/Color"
import Upstage from "@lobehub/icons/es/Upstage/components/Mono"
import XAI from "@lobehub/icons/es/XAI/components/Mono"
import XiaomiMiMo from "@lobehub/icons/es/XiaomiMiMo/components/Mono"
import YiColor from "@lobehub/icons/es/Yi/components/Color"
import Yi from "@lobehub/icons/es/Yi/components/Mono"
import ZhipuColor from "@lobehub/icons/es/Zhipu/components/Color"
import Zhipu from "@lobehub/icons/es/Zhipu/components/Mono"

import type {
  ModelVendorCatalogEntry,
  ResolvedModelVendor,
} from "~/services/models/modelMetadata/types"
import type { KnownModelVendorId } from "~/services/models/modelVendor"

interface ModelVendorBrand {
  Mark: IconType
  Color?: IconType
}

type ModelVendorPresentation =
  | { kind: "brand"; Brand: ModelVendorBrand }
  | { kind: "initials"; initials: string }
  | { kind: "generic" }
  | { kind: "unknown" }

const brand = (Mark: IconType, Color?: IconType): ModelVendorPresentation => ({
  kind: "brand",
  Brand: { Mark, Color },
})

const initials = (value: string): ModelVendorPresentation => ({
  kind: "initials",
  initials: value,
})

const GENERIC_VENDOR_PRESENTATION = {
  kind: "generic",
} as const satisfies ModelVendorPresentation

const UNKNOWN_VENDOR_PRESENTATION = {
  kind: "unknown",
} as const satisfies ModelVendorPresentation

const KNOWN_VENDOR_PRESENTATION = {
  openai: brand(OpenAI),
  anthropic: brand(Anthropic),
  google: brand(Google, GoogleColor),
  meta: brand(Meta, MetaColor),
  alibaba: brand(Alibaba, AlibabaColor),
  xai: brand(XAI),
  deepseek: brand(DeepSeek, DeepSeekColor),
  mistral: brand(Mistral, MistralColor),
  moonshot: brand(Moonshot),
  zhipu: brand(Zhipu, ZhipuColor),
  minimax: brand(Minimax, MinimaxColor),
  cohere: brand(Cohere, CohereColor),
  tencent: brand(Tencent, TencentColor),
  baidu: brand(Baidu, BaiduColor),
  baichuan: brand(Baichuan, BaichuanColor),
  "01-ai": brand(Yi, YiColor),
  bytedance: brand(ByteDance, ByteDanceColor),
  nvidia: brand(Nvidia, NvidiaColor),
  xiaomi: brand(XiaomiMiMo),
  meituan: brand(LongCat, LongCatColor),
  stepfun: brand(Stepfun),
  perplexity: brand(Perplexity, PerplexityColor),
  "essential-ai": brand(EssentialAI, EssentialAIColor),
  ai2: brand(Ai2, Ai2Color),
  microsoft: brand(Microsoft, MicrosoftColor),
  arcee: brand(Arcee, ArceeColor),
  "netease-youdao": initials("YD"),
  baai: brand(BAAI),
  "canopy-labs": initials("CL"),
  "deep-cogito": brand(DeepCogito, DeepCogitoColor),
  "deep-reinforce": initials("DR"),
  groq: brand(Groq),
  openrouter: brand(OpenRouter, OpenRouterColor),
  "kilo-code": brand(KiloCode),
  "inclusion-ai": initials("IA"),
  jina: brand(Jina),
  liquid: brand(Liquid),
  inception: brand(Inception),
  nomic: initials("N"),
  amazon: brand(Aws, AwsColor),
  sarvam: initials("S"),
  sensetime: brand(SenseNova, SenseNovaColor),
  upstage: brand(Upstage, UpstageColor),
  kuaishou: brand(Kolors, KolorsColor),
  "shanghai-ai-lab": brand(InternLM, InternLMColor),
  opencode: brand(OpenCode),
  "swiss-ai": initials("CH"),
  sdaia: initials("SA"),
  "prism-ml": initials("PM"),
  speakleash: initials("SL"),
  eurollm: initials("EU"),
} satisfies Record<KnownModelVendorId, ModelVendorPresentation>

export type ModelVendorPresentationInput =
  | ResolvedModelVendor
  | ModelVendorCatalogEntry

/** Checks whether an arbitrary resolved ID belongs to the canonical registry. */
function isKnownModelVendorId(knownId: string): knownId is KnownModelVendorId {
  return Object.prototype.hasOwnProperty.call(
    KNOWN_VENDOR_PRESENTATION,
    knownId,
  )
}

/** Returns semantic vendor-mark data without owning third-party brand styling. */
export function getModelVendorPresentation(
  vendor: ModelVendorPresentationInput,
): ModelVendorPresentation {
  if ("state" in vendor && vendor.state === "unknown") {
    return UNKNOWN_VENDOR_PRESENTATION
  }

  if (vendor.kind === "known" && isKnownModelVendorId(vendor.knownId)) {
    return KNOWN_VENDOR_PRESENTATION[vendor.knownId]
  }

  return GENERIC_VENDOR_PRESENTATION
}
