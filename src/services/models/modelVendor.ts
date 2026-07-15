import {
  MODEL_VENDOR_EVIDENCE_KINDS,
  type ModelDescriptor,
  type ModelVendorEvidence,
} from "~/services/models/modelDescriptor"
import type {
  ModelIdentityLookupResult,
  ModelVendorCandidate,
  ModelVendorCatalogEntry,
  ModelVendorProvenance,
  ResolvedModelVendor,
} from "~/services/models/modelMetadata/types"

export const MODEL_VENDOR_FILTER_VALUES = {
  All: "filter:all",
  Unclassified: "filter:unclassified",
} as const

export type ModelVendorFilterValue =
  | ModelVendorCatalogEntry["key"]
  | (typeof MODEL_VENDOR_FILTER_VALUES)[keyof typeof MODEL_VENDOR_FILTER_VALUES]

type KnownVendorDefinition = {
  label: string
  aliases: readonly string[]
  /** Publisher and metadata aliases that are never weak ownership evidence. */
  strongAliases?: readonly string[]
  familyPatterns: readonly RegExp[]
  /** Stable bare product grammars that must not match arbitrary namespaces. */
  bareFamilyPatterns?: readonly RegExp[]
  /** Contributes only to a multi-vendor conflict, never ownership by itself. */
  ambiguityPatterns?: readonly RegExp[]
  qualifiedFamilyPatterns?: readonly RegExp[]
  /** Exact normalized product identities, including any required namespace. */
  controlledModelIds?: readonly string[]
  /** Whether the alias may be used by weak evidence or exact ID prefixes. */
  allowWeakAliasEvidence?: boolean
}

const KNOWN_MODEL_VENDORS = {
  openai: {
    label: "OpenAI",
    aliases: ["openai"],
    familyPatterns: [
      // https://platform.openai.com/docs/models documents these first-party family roots without tying classification to a release's size or version.
      /^codex(?:[-_.]|$)/iu,
      /^text[-_.]embedding(?:[-_.]|$)/iu,
      /^gpt[-_.]?\d+(?:\.\d+)*(?:[a-z])?(?=$|[-_.])/iu,
      /^gpt[-_.](?:oss|realtime|audio|image)(?:[-_.]|$)/iu,
      /^chatgpt(?:[-_.]|$)/iu,
      /^dall[-_. ]?e(?:[-_.]|$)/iu,
      /^whisper(?:[-_.]|$)/iu,
      /^o\d+(?:[-_.]|$)/iu,
    ],
    // https://platform.openai.com/docs/models documents TTS as an OpenAI family; these direct-only forms avoid incidental suffix ownership.
    bareFamilyPatterns: [/^tts(?:\d+(?=$|[-_.])|[-_.])/iu],
    qualifiedFamilyPatterns: [/^openai\/tts(?:\d+(?=$|[-_.])|[-_.])/iu],
  },
  anthropic: {
    label: "Anthropic",
    aliases: ["anthropic", "claude"],
    familyPatterns: [/^claude(?:[-_.]|$)/iu],
    ambiguityPatterns: [
      /(?:^|[^\p{L}\p{N}])(?:claude|sonnet|haiku|opus)(?:$|[^\p{L}\p{N}])/iu,
    ],
  },
  google: {
    label: "Google",
    aliases: ["google", "gemini", "gemma", "deepmind", "deep mind"],
    familyPatterns: [
      /^(?:gemini|gemma|imagen)(?:[-_.]|$)/iu,
      // https://ai.google.dev/gemma/docs/diffusiongemma identifies DiffusionGemma as a Google model family.
      /^diffusiongemma(?:[-_.]|$)/iu,
      // https://blog.google/technology/ai/nano-banana-pro/ presents Nano Banana Pro as Google's Nano Banana model family.
      /^nano-banana(?:[-_.]|$)/iu,
    ],
  },
  meta: {
    label: "Meta",
    aliases: ["meta", "llama"],
    familyPatterns: [/(?:^|[^\p{L}\p{N}])llama(?:[-_.]|$)/iu],
  },
  alibaba: {
    label: "Alibaba",
    aliases: ["alibaba", "alibaba-cn", "qwen", "tongyi", "tongyi qianwen"],
    // https://huggingface.co/Qwen/Qwen3-Embedding-8B and https://github.com/FunAudioLLM/SenseVoice identify these Alibaba model families.
    familyPatterns: [
      /(?:^|[^\p{L}\p{N}])(?:qwen(?=\d|[-_.]|$)|tongyi(?=[-_.]|$))/iu,
      /^sensevoicesmall(?:[-_.]|$)/iu,
    ],
  },
  xai: {
    label: "xAI",
    aliases: ["xai", "x.ai", "grok"],
    familyPatterns: [/(?:^|[^\p{L}\p{N}])grok(?:[-_.]|$)/iu],
  },
  deepseek: {
    label: "DeepSeek",
    aliases: ["deepseek", "deepseek ai", "deepseek-ai"],
    familyPatterns: [/(?:^|[^\p{L}\p{N}])deepseek(?:[-_.]|$)/iu],
  },
  mistral: {
    label: "Mistral",
    aliases: ["mistral", "mistral ai", "mistralai"],
    familyPatterns: [
      /^labs[-_.]leanstral(?:[-_.]|$)/iu,
      // https://huggingface.co/mistralai/Labs-Leanstral-1.5 identifies Leanstral as a Mistral AI family.
      // https://github.com/mistralai/platform-docs-public/blob/3517a485544b0a0b66b98d40ec36081124151406/src/schema/models/models/voxtral-tts-26-03.ts documents the Voxtral TTS family.
      /(?:^|[^\p{L}\p{N}])(?:mistral|mixtral|magistral|codestral|pixtral|devstral|voxtral|ministral|leanstral)(?:[-_.]|$)/iu,
    ],
  },
  moonshot: {
    label: "Moonshot AI",
    // https://models.dev/models.json publishes Moonshot records as moonshotai/<model>.
    aliases: ["moonshot", "moonshot ai", "moonshotai", "kimi"],
    familyPatterns: [/(?:^|[^\p{L}\p{N}])(?:moonshot|kimi)(?:[-_.]|$)/iu],
  },
  zhipu: {
    label: "Zhipu AI",
    aliases: ["zhipu", "zhipu ai", "zhipuai", "glm", "bigmodel"],
    // https://huggingface.co/zai-org/GLM-4.7 publishes current Z.ai models under the zai-org namespace.
    strongAliases: ["z.ai", "zai", "zai-org"],
    // https://huggingface.co/zai-org/GLM-4.7 and https://huggingface.co/zai-org/AutoGLM-Phone-9B-Multilingual document these Z.ai families.
    familyPatterns: [
      /(?:^|[^\p{L}\p{N}])glm(?:\d+(?:\.\d+)*(?=$|[-_])|(?=[-_.]|$))/iu,
      /^autoglm-phone(?:[-_.]|$)/iu,
      // https://docs.bigmodel.cn/cn/guide/models/free/cogview-3-flash documents the CogView-3-Flash family.
      /^cogview(?:\d+(?:\.\d+)*(?=$|[-_])|(?=[-_.]|$))/iu,
    ],
  },
  minimax: {
    label: "MiniMax",
    aliases: ["minimax", "mini max"],
    familyPatterns: [/(?:^|[^\p{L}\p{N}])minimax(?:[-_.]|$)/iu],
  },
  cohere: {
    label: "Cohere",
    aliases: ["cohere"],
    // https://huggingface.co/CohereLabs/aya-expanse-32b is an official Cohere Labs release namespace.
    strongAliases: ["coherelabs"],
    familyPatterns: [
      /^(?:cohere|command|c4ai)(?:[-_.]|$)/iu,
      // https://cohere.com/research/aya and https://huggingface.co/CohereLabs/tiny-aya-global document the Aya and Tiny Aya families.
      /^aya(?:[-_.]|$)/iu,
      /^tiny[-_.]aya(?:[-_.]|$)/iu,
      // https://huggingface.co/CohereLabs/North-Mini-Code-1.0 identifies North Mini Code as a CohereLabs family.
      /^north[-_.]mini[-_.]code(?:[-_.]|$)/iu,
    ],
  },
  kuaishou: {
    label: "Kuaishou",
    aliases: ["kuaishou", "kwai", "kwai-kolors"],
    // https://huggingface.co/Kwai-Kolors/Kolors identifies Kolors as a Kwai model family.
    familyPatterns: [/^kolors(?:[-_.]|$)/iu],
  },
  "shanghai-ai-lab": {
    label: "Shanghai AI Laboratory",
    aliases: [
      "shanghai ai laboratory",
      "shanghai ai lab",
      "shanghai-ai-laboratory",
      "internlm",
    ],
    // https://github.com/InternLM/InternLM maintains the official InternLM model zoo.
    familyPatterns: [/^internlm(?:\d+(?:[._]\d+)*)?(?:[-_.]|$)/iu],
  },
  tencent: {
    label: "Tencent",
    aliases: ["tencent", "hunyuan"],
    // https://github.com/Tencent-Hunyuan identifies Tencent-Hunyuan as the official model organization.
    strongAliases: ["tencent-hunyuan"],
    familyPatterns: [
      /(?:^|[^\p{L}\p{N}])hunyuan(?:[-_.]|$)/iu,
      // https://github.com/Tencent-Hunyuan/Hy3 identifies HY3 as a Tencent Hunyuan model.
      /^hy3(?:[-_.]|$)/iu,
      // https://github.com/TencentCloudADP/youtu-embedding documents the Tencent Youtu embedding family.
      /^youtu[-_.]embedding(?:[-_.]|$)/iu,
    ],
  },
  baidu: {
    label: "Baidu",
    aliases: ["baidu", "ernie"],
    familyPatterns: [/(?:^|[^\p{L}\p{N}])ernie(?:[-_.]|$)/iu],
  },
  baichuan: {
    label: "Baichuan",
    aliases: ["baichuan"],
    // https://huggingface.co/baichuan-inc/Baichuan2-13B-Chat is published under the official baichuan-inc organization.
    strongAliases: ["baichuan-inc"],
    familyPatterns: [/^baichuan(?:\d+(?=$|[-_.])|[-_.]|$)/iu],
  },
  "01-ai": {
    label: "01.AI",
    aliases: ["01-ai", "01.ai", "01 ai", "yi"],
    familyPatterns: [/^yi(?:[-_.]|$)/iu],
  },
  bytedance: {
    label: "ByteDance",
    aliases: ["bytedance", "byte dance", "doubao"],
    // https://huggingface.co/ByteDance-Seed/Seed-OSS-36B-Instruct is an official ByteDance Seed release.
    strongAliases: ["bytedance-seed"],
    familyPatterns: [/(?:^|[^\p{L}\p{N}])doubao(?:[-_.]|$)/iu],
  },
  nvidia: {
    label: "NVIDIA",
    aliases: ["nvidia", "nemotron"],
    familyPatterns: [
      /(?:^|[^\p{L}\p{N}])nemotron(?:[-_.]|$)/iu,
      // https://huggingface.co/nvidia/gliner-PII and https://huggingface.co/nvidia/Riva-Translate-4B-Instruct-v1.1 document these NVIDIA releases.
      /^riva[-_.]translate(?:[-_.]|$)/iu,
      // https://huggingface.co/nvidia/Ising-Calibration-1-35B-A3B documents the NVIDIA Ising Calibration family.
      /^ising[-_.]calibration(?:[-_.]|$)/iu,
    ],
    controlledModelIds: ["gliner-pii", "nvidia/gliner-pii"],
  },
  xiaomi: {
    label: "Xiaomi",
    aliases: ["xiaomi", "mimo"],
    familyPatterns: [/^mimo(?:[-_.]|$)/iu],
  },
  meituan: {
    label: "Meituan",
    // https://huggingface.co/meituan-longcat/LongCat-Flash-Lite identifies the model as a Meituan LongCat release.
    aliases: ["meituan", "meituan-longcat", "longcat"],
    familyPatterns: [/(?:^|[^\p{L}\p{N}])longcat(?:[-_.]|$)/iu],
  },
  stepfun: {
    label: "StepFun",
    aliases: ["stepfun", "step fun"],
    // https://huggingface.co/stepfun-ai/step3 is published under StepFun's official stepfun-ai organization.
    strongAliases: ["stepfun-ai"],
    familyPatterns: [
      /^step(?:\d+[a-z]?|[-_.]\d+(?:\.\d+)*[a-z]?)(?:[-_.]|$)/iu,
    ],
    // https://huggingface.co/stepfun-ai publishes non-numeric Step families only under the official namespace.
    qualifiedFamilyPatterns: [/^stepfun-ai\/step(?=$|\d|[-_.])/iu],
  },
  perplexity: {
    label: "Perplexity",
    aliases: ["perplexity", "sonar"],
    familyPatterns: [/^sonar(?:[-_.]|$)/iu],
  },
  "essential-ai": {
    label: "Essential AI",
    aliases: ["essential ai", "essential-ai", "essentialai"],
    // https://www.essential.ai/research/rnj-1 documents the RNJ-1 model.
    familyPatterns: [/^rnj-\d+(?:\.\d+)*(?:[-_.]|$)/iu],
  },
  ai2: {
    label: "Ai2",
    aliases: ["ai2", "allenai"],
    // https://allenai.org/olmo documents Ai2's OLMo family.
    familyPatterns: [/^olmo(?:e)?(?:[-_.]|$)/iu],
  },
  sdaia: {
    label: "SDAIA",
    aliases: ["sdaia"],
    // https://github.com/Azure/azureml-assets/blob/main/assets/models/system/ALLaM-2-7b-instruct/description.md identifies SDAIA as the creator of the ALLaM family.
    familyPatterns: [/^allam(?:[-_.]|$)/iu],
  },
  microsoft: {
    label: "Microsoft",
    aliases: ["microsoft"],
    // https://huggingface.co/microsoft/phi-4 and https://wizardlm.github.io/WizardLM2/ document the creator-owned families.
    familyPatterns: [/^phi[-_.]?\d+(?=$|[-_.])/iu, /^wizardlm(?:[-_.]|$)/iu],
  },
  arcee: {
    label: "Arcee AI",
    aliases: ["arcee", "arcee ai", "arcee-ai"],
    familyPatterns: [],
    // https://www.arcee.ai/blog/trinity-large documents the official qualified family.
    qualifiedFamilyPatterns: [/^arcee-ai\/trinity(?:[-_.]|$)/iu],
  },
  "netease-youdao": {
    label: "NetEase Youdao",
    aliases: ["netease youdao", "netease-youdao", "youdao"],
    // https://github.com/netease-youdao/BCEmbedding documents the BCE embedding and reranker families.
    familyPatterns: [/^bce[-_.](?:embedding|reranker)(?:[-_.]|$)/iu],
  },
  baai: {
    label: "BAAI",
    aliases: ["baai"],
    // https://github.com/FlagOpen/FlagEmbedding documents the BGE model family.
    familyPatterns: [/^bge(?:[-_.]|$)/iu],
  },
  "canopy-labs": {
    label: "Canopy Labs",
    aliases: ["canopy labs", "canopy-labs", "canopylabs"],
    familyPatterns: [],
    // https://huggingface.co/canopylabs/orpheus-v1-english documents the creator-qualified family; unqualified Orpheus IDs are deliberately not claimed.
    qualifiedFamilyPatterns: [/^canopylabs\/orpheus(?:[-_.]|$)/iu],
  },
  "deep-cogito": {
    label: "Deep Cogito",
    aliases: ["deep cogito", "deep-cogito", "deepcogito"],
    familyPatterns: [],
    // https://huggingface.co/deepcogito/cogito-671b-v2.1 documents the official qualified family.
    qualifiedFamilyPatterns: [/^deepcogito\/cogito(?:[-_.]|$)/iu],
  },
  "deep-reinforce": {
    label: "DeepReinforce",
    aliases: ["deep reinforce", "deep-reinforce", "deepreinforce"],
    // https://huggingface.co/deepreinforce-ai/Ornith-1.0-35B is published under the official deepreinforce-ai organization.
    strongAliases: ["deepreinforce-ai"],
    // https://huggingface.co/deepreinforce-ai/Ornith-1.0-35B documents the Ornith release.
    familyPatterns: [/^ornith(?:[-_.]|$)/iu],
  },
  groq: {
    label: "Groq",
    aliases: ["groq"],
    familyPatterns: [],
    allowWeakAliasEvidence: false,
    // https://console.groq.com/docs/compound/systems/compound defines only these Groq-qualified Compound system IDs.
    controlledModelIds: ["groq/compound", "groq/compound-mini"],
  },
  openrouter: {
    label: "OpenRouter",
    aliases: ["openrouter", "open router"],
    familyPatterns: [],
    allowWeakAliasEvidence: false,
    // https://github.com/OpenRouterTeam/docs/tree/main/guides/routing/routers documents these exact router products; openrouter-random is an observed compatibility ID.
    controlledModelIds: [
      "openrouter/auto",
      "openrouter/free",
      "openrouter/bodybuilder",
      "openrouter/fusion",
      "openrouter/fusion-flash",
      "openrouter/pareto-code",
      "openrouter-random",
    ],
  },
  opencode: {
    label: "OpenCode",
    aliases: ["opencode", "open code", "opencode zen", "opencodezen"],
    familyPatterns: [],
    allowWeakAliasEvidence: false,
    // https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/provider/provider.ts includes Big Pickle in OpenCode provider selection;
    // https://github.com/anomalyco/opencode/blob/dev/packages/stats/core/src/domain/inference.test.ts keeps its underlying author unknown, so ownership is limited to the virtual product.
    controlledModelIds: [
      "big-pickle",
      "opencode/big-pickle",
      "opencodefree/big-pickle",
    ],
  },
  "kilo-code": {
    label: "Kilo Code",
    aliases: ["kilo code", "kilo-code", "kilocode"],
    familyPatterns: [],
    allowWeakAliasEvidence: false,
    // https://github.com/Kilo-Org/kilocode/blob/main/packages/kilo-docs/pages/code-with-ai/agents/auto-model.md documents the kilo-auto/<tier> shape and current tiers. Accepting any safe single tier segment is forward-compatibility policy; bare kilo-auto is an observed compatibility exception.
    qualifiedFamilyPatterns: [/^kilo-auto\/[a-z0-9]+(?:[-_.][a-z0-9]+)*$/iu],
    controlledModelIds: ["kilo-auto"],
  },
  "inclusion-ai": {
    label: "InclusionAI",
    aliases: ["inclusion ai", "inclusion-ai", "inclusionai"],
    familyPatterns: [],
    // https://huggingface.co/inclusionAI/Ling-2.6-1T documents the official qualified family.
    qualifiedFamilyPatterns: [/^inclusionai\/ling(?:[-_.]|$)/iu],
  },
  jina: {
    label: "Jina AI",
    aliases: ["jina", "jina ai", "jinaai"],
    // https://huggingface.co/jinaai documents the branded Clip, Reranker, and Embedding families.
    familyPatterns: [/^jina[-_.](?:clip|reranker|embeddings?)(?:[-_.]|$)/iu],
  },
  liquid: {
    label: "Liquid AI",
    aliases: ["liquid", "liquid ai", "liquidai"],
    // https://docs.liquid.ai/lfm/models/lfm25-1.2b-instruct documents the numeric LFM generation and version family.
    familyPatterns: [/^lfm[-_.]?\d+(?:\.\d+)*(?=$|[-_.])/iu],
  },
  inception: {
    label: "Inception",
    aliases: ["inception", "inception labs"],
    // https://www.inceptionlabs.ai/models identifies Inception Labs as the publisher of Mercury models.
    strongAliases: ["inceptionai"],
    familyPatterns: [],
    // https://www.inceptionlabs.ai/models documents the controlled bare Mercury product families.
    bareFamilyPatterns: [/^mercury-(?:\d+|edit|coder)(?:[-_.]|$)/iu],
  },
  nomic: {
    label: "Nomic AI",
    aliases: ["nomic", "nomic ai", "nomic-ai"],
    // https://huggingface.co/nomic-ai/nomic-embed-code documents the code embedding model.
    familyPatterns: [/^nomic[-_.]embed(?:[-_.]|$)/iu],
  },
  amazon: {
    label: "Amazon",
    aliases: ["amazon"],
    // https://docs.aws.amazon.com/nova/latest/userguide/what-is-nova.html documents Amazon Nova models.
    familyPatterns: [
      /^nova-(?:\d+(?:\.\d+)*-)?(?:canvas|lite|micro|premier|pro|reel|sonic)(?:[-_.]|$)/iu,
    ],
  },
  sarvam: {
    label: "Sarvam AI",
    aliases: ["sarvam", "sarvam ai", "sarvam-ai"],
    // https://huggingface.co/sarvamai/sarvam-m is published under Sarvam AI's sarvamai organization.
    strongAliases: ["sarvamai"],
    // https://huggingface.co/sarvamai/sarvam-m documents the Sarvam-M model.
    familyPatterns: [/^sarvam(?:[-_.]|$)/iu],
  },
  sensetime: {
    label: "SenseTime",
    aliases: ["sensetime", "sense time", "sensenova"],
    // https://github.com/OpenSenseNova/SenseNova6.7 is the official OpenSenseNova release organization.
    strongAliases: ["opensensenova"],
    // https://github.com/OpenSenseNova/SenseNova6.7/blob/main/API_CN.md documents the SenseNova family.
    familyPatterns: [/^sensenova(?:[-_.]|$)/iu],
  },
  upstage: {
    label: "Upstage",
    aliases: ["upstage"],
    // https://huggingface.co/upstage/SOLAR-10.7B-Instruct-v1.0 documents the versioned SOLAR family root.
    familyPatterns: [/^solar(?:[-_.]|$)/iu],
  },
  "swiss-ai": {
    label: "Swiss AI",
    aliases: ["swiss ai", "swiss-ai"],
    // https://huggingface.co/swiss-ai/Apertus-8B-Instruct-2509 documents the Apertus family.
    familyPatterns: [/^apertus(?:[-_.]|$)/iu],
  },
  "prism-ml": {
    label: "PrismML",
    aliases: ["prism ml", "prism-ml", "prismml"],
    familyPatterns: [],
    // https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf identifies PrismML as the publisher of this derived family.
    qualifiedFamilyPatterns: [/^prism-ml\/ternary-bonsai(?:[-_.]|$)/iu],
  },
  speakleash: {
    label: "SpeakLeash",
    aliases: ["speakleash", "speak leash"],
    familyPatterns: [],
    // https://huggingface.co/speakleash/Bielik-11B-v3.0-Instruct identifies SpeakLeash as the publisher of the Bielik family.
    qualifiedFamilyPatterns: [/^speakleash\/bielik(?:[-_.]|$)/iu],
  },
  eurollm: {
    label: "EuroLLM",
    aliases: ["eurollm", "euro llm"],
    familyPatterns: [],
    // https://huggingface.co/utter-project/EuroLLM-22B-Instruct-2512 identifies this consortium family without treating its host namespace as an alias.
    qualifiedFamilyPatterns: [/^utter-project\/eurollm(?:[-_.]|$)/iu],
  },
} as const satisfies Record<string, KnownVendorDefinition>

export type KnownModelVendorId = keyof typeof KNOWN_MODEL_VENDORS

type CuratedAttributionOverride = {
  targetVendorId: KnownModelVendorId
  supersededVendorIds: readonly KnownModelVendorId[]
  familyPatterns?: readonly RegExp[]
  bareFamilyPatterns?: readonly RegExp[]
  qualifiedFamilyPatterns?: readonly RegExp[]
}

type CuratedAttributionDecision = Pick<
  CuratedAttributionOverride,
  "targetVendorId" | "supersededVendorIds"
>

const CURATED_ATTRIBUTION_OVERRIDES: readonly CuratedAttributionOverride[] = [
  {
    targetVendorId: "deepseek",
    supersededVendorIds: ["alibaba"],
    // https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B and
    // https://huggingface.co/deepseek-ai/DeepSeek-R1-0528-Qwen3-8B identify DeepSeek as the derived-family publisher despite the Qwen base-model token.
    bareFamilyPatterns: [/^deepseek-r1-(?:distill|\d{4})-qwen\d*(?:[-_.]|$)/iu],
    qualifiedFamilyPatterns: [
      /^deepseek-ai\/deepseek-r1-(?:distill|\d{4})-qwen\d*(?:[-_.]|$)/iu,
    ],
  },
  {
    targetVendorId: "deepseek",
    supersededVendorIds: ["alibaba"],
    // https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B identifies this stable DeepSeek-derived product independently of serving namespace.
    familyPatterns: [/^deepseek-r1-distill-qwen\d*(?:[-_.]|$)/iu],
  },
  {
    targetVendorId: "deepseek",
    supersededVendorIds: ["meta"],
    // https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Llama-70B identifies this stable DeepSeek-derived product independently of serving namespace.
    familyPatterns: [/^deepseek-r1-distill-llama\d*(?:[-_.]|$)/iu],
  },
]

type KnownVendor = KnownVendorDefinition & { id: KnownModelVendorId }
type KnownModelVendorCandidate = Extract<
  ModelVendorCandidate,
  { state: "candidate"; kind: "known" }
>

type CuratedModelVendorResolution =
  | {
      state: "candidate"
      candidate: KnownModelVendorCandidate
      explicitProductPolicy: boolean
    }
  | { state: "ambiguous" }
  | { state: "no-match" }

const KNOWN_VENDORS: readonly KnownVendor[] = (
  Object.keys(KNOWN_MODEL_VENDORS) as KnownModelVendorId[]
).map((id) => ({ id, ...KNOWN_MODEL_VENDORS[id] }))

/** Applies matched ownership decisions to ordinary candidates. */
function applyCuratedAttributionDecisions(
  ordinaryCandidateIds: readonly KnownModelVendorId[],
  decisions: readonly CuratedAttributionDecision[],
): KnownModelVendorId[] {
  const targetVendorIds = new Set<KnownModelVendorId>()
  const supersededVendorIds = new Set<KnownModelVendorId>()
  for (const decision of decisions) {
    for (const supersededVendorId of decision.supersededVendorIds) {
      supersededVendorIds.add(supersededVendorId)
    }
    targetVendorIds.add(decision.targetVendorId)
  }

  const adjustedCandidateIds = new Set(
    ordinaryCandidateIds.filter(
      (vendorId) => !supersededVendorIds.has(vendorId),
    ),
  )
  for (const targetVendorId of targetVendorIds) {
    adjustedCandidateIds.add(targetVendorId)
  }

  return KNOWN_VENDORS.filter((vendor) =>
    adjustedCandidateIds.has(vendor.id),
  ).map((vendor) => vendor.id)
}

const KNOWN_VENDOR_BY_ALIAS = new Map<string, KnownVendor>()
const KNOWN_VENDOR_BY_WEAK_ALIAS = new Map<string, KnownVendor>()

/** Registers a normalized alias while rejecting cross-vendor collisions. */
function registerKnownVendorAlias(
  registry: Map<string, KnownVendor>,
  registryKind: "strong" | "weak",
  alias: string,
  vendor: KnownVendor,
): void {
  const normalizedAlias = normalizeKnownVendorAlias(alias)
  const registeredVendor = registry.get(normalizedAlias)

  if (!registeredVendor) {
    registry.set(normalizedAlias, vendor)
    return
  }
  if (registeredVendor.id === vendor.id) return

  const conflictingVendorIds = [registeredVendor.id, vendor.id].sort()
  throw new Error(
    `Conflicting ${registryKind} model vendor alias "${normalizedAlias}" for "${conflictingVendorIds[0]}" and "${conflictingVendorIds[1]}"`,
  )
}

for (const vendor of KNOWN_VENDORS) {
  for (const alias of [
    vendor.id,
    vendor.label,
    ...vendor.aliases,
    ...(vendor.strongAliases ?? []),
  ]) {
    registerKnownVendorAlias(KNOWN_VENDOR_BY_ALIAS, "strong", alias, vendor)
  }

  if (vendor.allowWeakAliasEvidence !== false) {
    for (const alias of [vendor.id, vendor.label, ...vendor.aliases]) {
      registerKnownVendorAlias(
        KNOWN_VENDOR_BY_WEAK_ALIAS,
        "weak",
        alias,
        vendor,
      )
    }
  }
}

/** Replaces unpaired UTF-16 surrogates while preserving valid code points. */
function toWellFormedUnicode(value: string): string {
  let result = ""

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1)
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        result += value[index] + value[index + 1]
        index += 1
      } else {
        result += "�"
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      result += "�"
    } else {
      result += value[index]
    }
  }

  return result
}

/** Normalizes a trusted alias for exact known-vendor lookup. */
function normalizeKnownVendorAlias(name: string): string {
  return toWellFormedUnicode(name)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase()
}

/** Normalizes display whitespace while preserving publisher spelling. */
function normalizeVendorLabel(name: string): string {
  return toWellFormedUnicode(name)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
}

/** Builds the normalized identity used by custom vendor keys. */
export const normalizeCustomVendorName = (name: string) =>
  toWellFormedUnicode(name)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase()

/** Namespaces an already-normalized custom vendor identity. */
export const buildCustomVendorKey = (normalizedName: string) =>
  `custom:${encodeURIComponent(toWellFormedUnicode(normalizedName))}` as const

/** Creates a known candidate without claiming its row label is canonical. */
function createKnownCandidate(
  vendor: KnownVendor,
  provenance: ModelVendorProvenance,
): KnownModelVendorCandidate {
  return {
    state: "candidate",
    kind: "known",
    key: `known:${vendor.id}`,
    knownId: vendor.id,
    labelCandidate: vendor.label,
    ...provenance,
  }
}

/** Resolves an exact known-vendor alias with the supplied provenance. */
function resolveKnownAlias(
  name: string,
  provenance: ModelVendorProvenance,
  aliasRegistry = KNOWN_VENDOR_BY_ALIAS,
): ModelVendorCandidate {
  const vendor = aliasRegistry.get(normalizeKnownVendorAlias(name))
  return vendor
    ? createKnownCandidate(vendor, provenance)
    : { state: "unknown" }
}

/** Resolves non-empty publisher text to a deterministic custom identity. */
function resolveCustomVendor(
  name: string,
  provenance: ModelVendorProvenance,
): ModelVendorCandidate {
  const labelCandidate = normalizeVendorLabel(name)
  const normalizedName = normalizeCustomVendorName(labelCandidate)
  if (!normalizedName) return { state: "unknown" }

  return {
    state: "candidate",
    kind: "custom",
    key: buildCustomVendorKey(normalizedName),
    labelCandidate,
    ...provenance,
  }
}

/** Resolves validated publisher evidence as known or deterministic custom. */
function resolvePublisherEvidence(name: string): ModelVendorCandidate {
  const provenance = { source: "publisher-evidence" } as const
  const known = resolveKnownAlias(name, provenance)
  return known.state === "candidate"
    ? known
    : resolveCustomVendor(name, provenance)
}

/** Resolves provider evidence only from an unambiguous metadata identity. */
function resolveMetadataVendor(
  lookupResult: ModelIdentityLookupResult,
): ModelVendorCandidate {
  if (lookupResult.state !== "resolved") return { state: "unknown" }

  const provenance = {
    source: "metadata",
    identityMatch: lookupResult.match,
  } as const
  const providerId = lookupResult.metadata.provider_id
  const known = resolveKnownAlias(providerId, provenance)
  return known.state === "candidate"
    ? known
    : resolveCustomVendor(providerId, provenance)
}

/** Normalizes curated matching forms before exact weak-prefix lookup. */
function getCuratedModelIdentity(modelId: string): {
  qualified: string
  tail: string
} {
  const normalized = toWellFormedUnicode(modelId).normalize("NFKC").trim()
  const tailStart = normalized.lastIndexOf("/") + 1
  const routingDecoration = normalized.indexOf(":", tailStart)
  const qualified =
    routingDecoration === -1
      ? normalized
      : normalized.slice(0, routingDecoration)

  return {
    qualified,
    tail: qualified.slice(tailStart),
  }
}

/** Accepts only an exact eligible alias in a well-formed prefix/model ID. */
function getWeakAliasPrefixVendor(
  identity: ReturnType<typeof getCuratedModelIdentity>,
): KnownVendor | undefined {
  const segments = identity.qualified.split("/")
  if (segments.length !== 2) return undefined

  const [prefix, model] = segments
  const normalizedPrefix = normalizeKnownVendorAlias(prefix)
  if (!normalizedPrefix || !model.trim() || model.includes("�")) {
    return undefined
  }

  return KNOWN_VENDOR_BY_WEAK_ALIAS.get(normalizedPrefix)
}

const CONTROLLED_MODEL_IDS_BY_VENDOR = new Map(
  KNOWN_VENDORS.map(
    (vendor) =>
      [
        vendor.id,
        new Set(
          (vendor.controlledModelIds ?? []).map((modelId) =>
            getCuratedModelIdentity(modelId).qualified.toLowerCase(),
          ),
        ),
      ] as const,
  ),
)

const MODEL_TOKEN_SEPARATOR_PATTERN = /[^\p{L}\p{N}]/u

/** Returns the original tail and each suffix starting after a safe token separator. */
function getCuratedModelTokenSuffixes(tail: string): string[] {
  const suffixes = new Set([tail])
  let nextOffset = 0

  for (const codePoint of tail) {
    nextOffset += codePoint.length
    if (
      nextOffset < tail.length &&
      MODEL_TOKEN_SEPARATOR_PATTERN.test(codePoint)
    ) {
      suffixes.add(tail.slice(nextOffset))
    }
  }

  return [...suffixes]
}

/** Returns whether a family pattern starts at the product-leading position. */
function matchesLeadingFamily(pattern: RegExp, modelId: string): boolean {
  return modelId.search(pattern) === 0
}

/** Resolves one model id without flattening ambiguity into a normal miss. */
function resolveCuratedModelVendorResolution(
  modelId: string,
): CuratedModelVendorResolution {
  const identity = getCuratedModelIdentity(modelId)
  if (!identity.tail) return { state: "no-match" }
  const isBareIdentity = identity.qualified === identity.tail
  const normalizedQualifiedIdentity = identity.qualified.toLowerCase()
  const candidateMatchIds = new Set<KnownModelVendorId>()
  const naturalCandidateIds = new Set<KnownModelVendorId>()
  const ambiguityCandidateIds = new Set<KnownModelVendorId>()
  const explicitProductPolicyIds = new Set<KnownModelVendorId>()

  for (const vendor of KNOWN_VENDORS) {
    const familyMatch = vendor.familyPatterns.some((pattern) =>
      matchesLeadingFamily(pattern, identity.tail),
    )
    const bareFamilyMatch =
      isBareIdentity &&
      vendor.bareFamilyPatterns?.some((pattern) => pattern.test(identity.tail))
    const qualifiedFamilyMatch = vendor.qualifiedFamilyPatterns?.some(
      (pattern) => pattern.test(identity.qualified),
    )
    const controlledModelMatch = CONTROLLED_MODEL_IDS_BY_VENDOR.get(
      vendor.id,
    )?.has(normalizedQualifiedIdentity)

    if (
      familyMatch ||
      bareFamilyMatch ||
      qualifiedFamilyMatch ||
      controlledModelMatch
    ) {
      candidateMatchIds.add(vendor.id)
      naturalCandidateIds.add(vendor.id)
    }
    if (qualifiedFamilyMatch || controlledModelMatch) {
      explicitProductPolicyIds.add(vendor.id)
    }
  }

  const weakAliasPrefixVendor = getWeakAliasPrefixVendor(identity)
  if (candidateMatchIds.size === 0 && weakAliasPrefixVendor) {
    candidateMatchIds.add(weakAliasPrefixVendor.id)
  }

  if (candidateMatchIds.size > 0) {
    const tokenSuffixes = getCuratedModelTokenSuffixes(identity.tail)
    for (const vendor of KNOWN_VENDORS) {
      const familyMatch = tokenSuffixes.some((suffix) =>
        vendor.familyPatterns.some((pattern) => pattern.test(suffix)),
      )
      const ambiguityMatch = vendor.ambiguityPatterns?.some((pattern) =>
        pattern.test(identity.tail),
      )
      if (familyMatch || ambiguityMatch) {
        candidateMatchIds.add(vendor.id)
      }
      if (familyMatch) naturalCandidateIds.add(vendor.id)
      if (ambiguityMatch) ambiguityCandidateIds.add(vendor.id)
    }
  }

  const matches = KNOWN_VENDORS.filter((vendor) =>
    candidateMatchIds.has(vendor.id),
  )
  const attributionOverrides = CURATED_ATTRIBUTION_OVERRIDES.filter(
    (override) =>
      override.familyPatterns?.some((pattern) => pattern.test(identity.tail)) ||
      (isBareIdentity &&
        override.bareFamilyPatterns?.some((pattern) =>
          pattern.test(identity.tail),
        )) ||
      override.qualifiedFamilyPatterns?.some((pattern) =>
        pattern.test(identity.qualified),
      ),
  )
  for (const override of attributionOverrides) {
    explicitProductPolicyIds.add(override.targetVendorId)
  }

  let adjustedMatchIds = new Set(
    applyCuratedAttributionDecisions(
      matches.map((vendor) => vendor.id),
      attributionOverrides,
    ),
  )

  if (
    adjustedMatchIds.size > 1 &&
    weakAliasPrefixVendor &&
    naturalCandidateIds.has(weakAliasPrefixVendor.id) &&
    adjustedMatchIds.has(weakAliasPrefixVendor.id) &&
    !Array.from(adjustedMatchIds).some(
      (vendorId) =>
        vendorId !== weakAliasPrefixVendor.id &&
        ambiguityCandidateIds.has(vendorId),
    )
  ) {
    adjustedMatchIds = new Set([weakAliasPrefixVendor.id])
  }

  const adjustedMatches = KNOWN_VENDORS.filter((vendor) =>
    adjustedMatchIds.has(vendor.id),
  )

  if (adjustedMatches.length === 0) return { state: "no-match" }
  if (adjustedMatches.length > 1) return { state: "ambiguous" }

  const vendor = adjustedMatches[0]
  return {
    state: "candidate",
    candidate: createKnownCandidate(vendor, { source: "curated-rule" }),
    explicitProductPolicy: explicitProductPolicyIds.has(vendor.id),
  }
}

/** Resolves one model id through static, ambiguity-safe family rules. */
export function resolveCuratedModelVendor(
  modelId: string,
): ModelVendorCandidate {
  const resolution = resolveCuratedModelVendorResolution(modelId)
  return resolution.state === "candidate"
    ? resolution.candidate
    : { state: "unknown" }
}

/** Resolves only known aliases from deployment or routing evidence. */
function resolveAliasEvidence(
  vendorEvidence: ModelVendorEvidence | undefined,
  kind:
    | typeof MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory
    | typeof MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
): ModelVendorCandidate {
  if (vendorEvidence?.kind !== kind) return { state: "unknown" }
  return resolveKnownAlias(
    vendorEvidence.name,
    {
      source:
        kind === MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory
          ? "deployment-alias"
          : "routing-alias",
    },
    KNOWN_VENDOR_BY_WEAK_ALIAS,
  )
}

/** Applies the fixed per-row vendor-evidence precedence. */
export function resolveModelVendorCandidate(
  descriptor: ModelDescriptor,
  lookupResult: ModelIdentityLookupResult,
): ModelVendorCandidate {
  if (
    descriptor.vendorEvidence?.kind === MODEL_VENDOR_EVIDENCE_KINDS.Publisher
  ) {
    const publisher = resolvePublisherEvidence(descriptor.vendorEvidence.name)
    if (publisher.state === "candidate") return publisher
  }

  const curated = resolveCuratedModelVendorResolution(descriptor.id)
  const metadata = resolveMetadataVendor(lookupResult)
  if (metadata.state === "candidate") {
    if (metadata.kind === "known") return metadata
    if (curated.state === "candidate" && curated.explicitProductPolicy) {
      return curated.candidate
    }
    return metadata
  }

  if (curated.state === "candidate") return curated.candidate
  if (curated.state === "ambiguous") return { state: "unknown" }

  const deployment = resolveAliasEvidence(
    descriptor.vendorEvidence,
    MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
  )
  if (deployment.state === "candidate") return deployment

  return resolveAliasEvidence(
    descriptor.vendorEvidence,
    MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
  )
}

/** Compares labels by direct code-point order without locale variation. */
function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** Canonicalizes labels by key and preserves positional row alignment. */
export function aggregateModelVendors(
  candidates: readonly ModelVendorCandidate[],
): {
  catalog: ModelVendorCatalogEntry[]
  resolved: ResolvedModelVendor[]
} {
  const candidatesByKey = new Map<
    string,
    Extract<ModelVendorCandidate, { state: "candidate" }>[]
  >()

  for (const candidate of candidates) {
    if (candidate.state !== "candidate") continue
    const grouped = candidatesByKey.get(candidate.key) ?? []
    grouped.push(candidate)
    candidatesByKey.set(candidate.key, grouped)
  }

  const catalogByKey = new Map<string, ModelVendorCatalogEntry>()
  for (const [key, grouped] of candidatesByKey) {
    const label = grouped
      .map((candidate) => candidate.labelCandidate)
      .sort(compareCodePoints)[0]
    const first = grouped[0]
    catalogByKey.set(
      key,
      first.kind === "known"
        ? {
            kind: "known",
            key: first.key,
            knownId: first.knownId,
            label,
          }
        : { kind: "custom", key: first.key, label },
    )
  }

  const catalog = Array.from(catalogByKey.values()).sort((left, right) =>
    compareCodePoints(left.key, right.key),
  )
  const resolved = candidates.map((candidate): ResolvedModelVendor => {
    if (candidate.state === "unknown") return candidate
    const entry = catalogByKey.get(candidate.key)!
    const provenance: ModelVendorProvenance =
      candidate.source === "metadata"
        ? {
            source: "metadata",
            identityMatch: candidate.identityMatch,
          }
        : { source: candidate.source }

    return candidate.kind === "known"
      ? {
          state: "resolved",
          kind: "known",
          key: candidate.key,
          knownId: candidate.knownId,
          label: entry.label,
          ...provenance,
        }
      : {
          state: "resolved",
          kind: "custom",
          key: candidate.key,
          label: entry.label,
          ...provenance,
        }
  })

  return { catalog, resolved }
}
