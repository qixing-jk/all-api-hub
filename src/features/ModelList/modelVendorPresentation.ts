import Ai2Color from "@lobehub/icons/es/Ai2/components/Color"
import AlibabaColor from "@lobehub/icons/es/Alibaba/components/Color"
import Anthropic from "@lobehub/icons/es/Anthropic/components/Mono"
import ArceeColor from "@lobehub/icons/es/Arcee/components/Color"
import AwsColor from "@lobehub/icons/es/Aws/components/Color"
import BAAI from "@lobehub/icons/es/BAAI/components/Mono"
import BaichuanColor from "@lobehub/icons/es/Baichuan/components/Color"
import BaiduColor from "@lobehub/icons/es/Baidu/components/Color"
import ByteDanceColor from "@lobehub/icons/es/ByteDance/components/Color"
import CohereColor from "@lobehub/icons/es/Cohere/components/Color"
import DeepCogitoColor from "@lobehub/icons/es/DeepCogito/components/Color"
import DeepSeekColor from "@lobehub/icons/es/DeepSeek/components/Color"
import EssentialAIColor from "@lobehub/icons/es/EssentialAI/components/Color"
import GoogleColor from "@lobehub/icons/es/Google/components/Color"
import Groq from "@lobehub/icons/es/Groq/components/Mono"
import Inception from "@lobehub/icons/es/Inception/components/Mono"
import InternLMColor from "@lobehub/icons/es/InternLM/components/Color"
import Jina from "@lobehub/icons/es/Jina/components/Mono"
import KiloCode from "@lobehub/icons/es/KiloCode/components/Mono"
import KolorsColor from "@lobehub/icons/es/Kolors/components/Color"
import Liquid from "@lobehub/icons/es/Liquid/components/Mono"
import LongCatColor from "@lobehub/icons/es/LongCat/components/Color"
import MetaColor from "@lobehub/icons/es/Meta/components/Color"
import MicrosoftColor from "@lobehub/icons/es/Microsoft/components/Color"
import MinimaxColor from "@lobehub/icons/es/Minimax/components/Color"
import MistralColor from "@lobehub/icons/es/Mistral/components/Color"
import Moonshot from "@lobehub/icons/es/Moonshot/components/Mono"
import NvidiaColor from "@lobehub/icons/es/Nvidia/components/Color"
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono"
import OpenCode from "@lobehub/icons/es/OpenCode/components/Mono"
import OpenRouterColor from "@lobehub/icons/es/OpenRouter/components/Color"
import PerplexityColor from "@lobehub/icons/es/Perplexity/components/Color"
import SenseNovaColor from "@lobehub/icons/es/SenseNova/components/Color"
import Stepfun from "@lobehub/icons/es/Stepfun/components/Mono"
import TencentColor from "@lobehub/icons/es/Tencent/components/Color"
import type { IconType } from "@lobehub/icons/es/types"
import UpstageColor from "@lobehub/icons/es/Upstage/components/Color"
import XAI from "@lobehub/icons/es/XAI/components/Mono"
import XiaomiMiMo from "@lobehub/icons/es/XiaomiMiMo/components/Mono"
import YiColor from "@lobehub/icons/es/Yi/components/Color"
import ZhipuColor from "@lobehub/icons/es/Zhipu/components/Color"

import type {
  ModelVendorCatalogEntry,
  ResolvedModelVendor,
} from "~/services/models/modelMetadata/types"
import type { KnownModelVendorId } from "~/services/models/modelVendor"

type ModelVendorPresentation =
  | { kind: "brand"; Icon: IconType }
  | { kind: "initials"; initials: string }
  | { kind: "generic" }
  | { kind: "unknown" }

const brand = (Icon: IconType): ModelVendorPresentation => ({
  kind: "brand",
  Icon,
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
  google: brand(GoogleColor),
  meta: brand(MetaColor),
  alibaba: brand(AlibabaColor),
  xai: brand(XAI),
  deepseek: brand(DeepSeekColor),
  mistral: brand(MistralColor),
  moonshot: brand(Moonshot),
  zhipu: brand(ZhipuColor),
  minimax: brand(MinimaxColor),
  cohere: brand(CohereColor),
  tencent: brand(TencentColor),
  baidu: brand(BaiduColor),
  baichuan: brand(BaichuanColor),
  "01-ai": brand(YiColor),
  bytedance: brand(ByteDanceColor),
  nvidia: brand(NvidiaColor),
  xiaomi: brand(XiaomiMiMo),
  meituan: brand(LongCatColor),
  stepfun: brand(Stepfun),
  perplexity: brand(PerplexityColor),
  "essential-ai": brand(EssentialAIColor),
  ai2: brand(Ai2Color),
  microsoft: brand(MicrosoftColor),
  arcee: brand(ArceeColor),
  "netease-youdao": initials("YD"),
  baai: brand(BAAI),
  "canopy-labs": initials("CL"),
  "deep-cogito": brand(DeepCogitoColor),
  "deep-reinforce": initials("DR"),
  groq: brand(Groq),
  openrouter: brand(OpenRouterColor),
  "kilo-code": brand(KiloCode),
  "inclusion-ai": initials("IA"),
  jina: brand(Jina),
  liquid: brand(Liquid),
  inception: brand(Inception),
  nomic: initials("N"),
  amazon: brand(AwsColor),
  sarvam: initials("S"),
  sensetime: brand(SenseNovaColor),
  upstage: brand(UpstageColor),
  kuaishou: brand(KolorsColor),
  "shanghai-ai-lab": brand(InternLMColor),
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
