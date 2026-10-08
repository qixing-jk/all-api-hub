export type KnownVendorDefinition = {
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

export const KNOWN_MODEL_VENDORS = {
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

export type CuratedAttributionOverride = {
  targetVendorId: KnownModelVendorId
  supersededVendorIds: readonly KnownModelVendorId[]
  familyPatterns?: readonly RegExp[]
  bareFamilyPatterns?: readonly RegExp[]
  qualifiedFamilyPatterns?: readonly RegExp[]
}

export const CURATED_ATTRIBUTION_OVERRIDES: readonly CuratedAttributionOverride[] =
  [
    {
      targetVendorId: "deepseek",
      supersededVendorIds: ["alibaba"],
      // https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B and
      // https://huggingface.co/deepseek-ai/DeepSeek-R1-0528-Qwen3-8B identify DeepSeek as the derived-family publisher despite the Qwen base-model token.
      bareFamilyPatterns: [
        /^deepseek-r1-(?:distill|\d{4})-qwen\d*(?:[-_.]|$)/iu,
      ],
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
