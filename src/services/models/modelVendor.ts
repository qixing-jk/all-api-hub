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

type KnownVendor = {
  id: string
  label: string
  aliases: readonly string[]
  modelPatterns: readonly RegExp[]
}

const KNOWN_VENDORS: readonly KnownVendor[] = [
  {
    id: "openai",
    label: "OpenAI",
    aliases: ["openai"],
    modelPatterns: [
      /(?:^|[^\p{L}\p{N}])(?:gpt(?:[-_.]?\d+(?:[a-z])?(?=$|[-_.])|[-_.]oss(?=$|[-_.]))|chatgpt(?:[-_.]|$)|dall[-_. ]?e(?:[-_.]|$)|whisper(?:[-_.]|$)|(?:text[-_.])?embeddings?(?:[-_.]|$)|image(?:[-_.]\d|[-_.]|$)|audio(?:[-_.]|$)|o(?:1|3|4)(?:[-_.]|$))/iu,
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    aliases: ["anthropic", "claude"],
    modelPatterns: [
      /(?:^|[^\p{L}\p{N}])(?:claude|sonnet|haiku|opus)(?:[-_.]|$)/iu,
    ],
  },
  {
    id: "google",
    label: "Google",
    aliases: ["google", "gemini", "gemma", "deepmind", "deep mind"],
    modelPatterns: [
      /(?:^|[^\p{L}\p{N}])(?:gemini|gemma|deepmind|imagen)(?:[-_.]|$)/iu,
    ],
  },
  {
    id: "meta",
    label: "Meta",
    aliases: ["meta", "llama"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])llama(?:[-_.]|$)/iu],
  },
  {
    id: "alibaba",
    label: "Alibaba",
    aliases: ["alibaba", "qwen", "tongyi", "tongyi qianwen"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])(?:qwen|tongyi)(?:[-_.]|$)/iu],
  },
  {
    id: "xai",
    label: "xAI",
    aliases: ["xai", "x.ai", "grok"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])grok(?:[-_.]|$)/iu],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    aliases: ["deepseek", "deepseek ai", "deepseek-ai"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])deepseek(?:[-_.]|$)/iu],
  },
  {
    id: "mistral",
    label: "Mistral",
    aliases: ["mistral", "mistral ai", "mistralai"],
    modelPatterns: [
      /(?:^|[^\p{L}\p{N}])(?:mistral|mixtral|magistral|codestral|pixtral|devstral|voxtral|ministral)(?:[-_.]|$)/iu,
    ],
  },
  {
    id: "moonshot",
    label: "Moonshot AI",
    // https://models.dev/models.json publishes Moonshot records as moonshotai/<model>.
    aliases: ["moonshot", "moonshot ai", "moonshotai", "kimi"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])(?:moonshot|kimi)(?:[-_.]|$)/iu],
  },
  {
    id: "zhipu",
    label: "Zhipu AI",
    aliases: ["zhipu", "zhipu ai", "zhipuai", "glm", "bigmodel"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])(?:glm|bigmodel)(?:[-_.]|$)/iu],
  },
  {
    id: "minimax",
    label: "MiniMax",
    aliases: ["minimax", "mini max"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])minimax(?:[-_.]|$)/iu],
  },
  {
    id: "cohere",
    label: "Cohere",
    aliases: ["cohere"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])(?:cohere|command|c4ai)(?:[-_.]|$)/iu],
  },
  {
    id: "tencent",
    label: "Tencent",
    aliases: ["tencent", "hunyuan"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])hunyuan(?:[-_.]|$)/iu],
  },
  {
    id: "baidu",
    label: "Baidu",
    aliases: ["baidu", "ernie"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])ernie(?:[-_.]|$)/iu],
  },
  {
    id: "baichuan",
    label: "Baichuan",
    aliases: ["baichuan"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])baichuan(?:[-_.]|$)/iu],
  },
  {
    id: "01-ai",
    label: "01.AI",
    aliases: ["01-ai", "01.ai", "01 ai", "yi"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])(?:01[-_.]?ai|yi)(?:[-_.]|$)/iu],
  },
  {
    id: "bytedance",
    label: "ByteDance",
    aliases: ["bytedance", "byte dance", "doubao"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])doubao(?:[-_.]|$)/iu],
  },
  {
    id: "nvidia",
    label: "NVIDIA",
    aliases: ["nvidia", "nemotron"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])nemotron(?:[-_.]|$)/iu],
  },
  {
    id: "xiaomi",
    label: "Xiaomi",
    aliases: ["xiaomi", "mimo"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])mimo(?:[-_.]|$)/iu],
  },
  {
    id: "stepfun",
    label: "StepFun",
    aliases: ["stepfun", "step fun"],
    modelPatterns: [
      /(?:^|[^\p{L}\p{N}])(?:stepfun|step(?=[-_.]\d))(?:[-_.]|$)/iu,
    ],
  },
  {
    id: "perplexity",
    label: "Perplexity",
    aliases: ["perplexity", "sonar"],
    modelPatterns: [/(?:^|[^\p{L}\p{N}])sonar(?:[-_.]|$)/iu],
  },
]

const KNOWN_VENDOR_BY_ALIAS = new Map<string, KnownVendor>()

for (const vendor of KNOWN_VENDORS) {
  for (const alias of [vendor.id, vendor.label, ...vendor.aliases]) {
    KNOWN_VENDOR_BY_ALIAS.set(normalizeKnownVendorAlias(alias), vendor)
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
): ModelVendorCandidate {
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
): ModelVendorCandidate {
  const vendor = KNOWN_VENDOR_BY_ALIAS.get(normalizeKnownVendorAlias(name))
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

/** Removes routing decoration without treating namespace prefixes as vendors. */
function getCuratedModelIdentity(modelId: string): string {
  const pathTail = modelId.trim().split("/").at(-1) ?? ""
  return pathTail.split(":", 1)[0].normalize("NFKC")
}

/** Resolves one model id through static, ambiguity-safe family rules. */
export function resolveCuratedModelVendor(
  modelId: string,
): ModelVendorCandidate {
  const identity = getCuratedModelIdentity(modelId)
  if (!identity) return { state: "unknown" }

  const matches = KNOWN_VENDORS.filter((vendor) =>
    vendor.modelPatterns.some((pattern) => pattern.test(identity)),
  )

  return matches.length === 1
    ? createKnownCandidate(matches[0], { source: "curated-rule" })
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
  return resolveKnownAlias(vendorEvidence.name, {
    source:
      kind === MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory
        ? "deployment-alias"
        : "routing-alias",
  })
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

  const metadata = resolveMetadataVendor(lookupResult)
  if (metadata.state === "candidate") return metadata

  const deployment = resolveAliasEvidence(
    descriptor.vendorEvidence,
    MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
  )
  if (deployment.state === "candidate") return deployment

  const curated = resolveCuratedModelVendor(descriptor.id)
  if (curated.state === "candidate") return curated

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
