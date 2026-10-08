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
import {
  CURATED_ATTRIBUTION_OVERRIDES,
  KNOWN_MODEL_VENDORS,
  type CuratedAttributionOverride,
  type KnownModelVendorId,
  type KnownVendorDefinition,
} from "~/services/models/modelVendorCatalog"

export const MODEL_VENDOR_FILTER_VALUES = {
  All: "filter:all",
  Unclassified: "filter:unclassified",
} as const

export type ModelVendorFilterValue =
  | ModelVendorCatalogEntry["key"]
  | (typeof MODEL_VENDOR_FILTER_VALUES)[keyof typeof MODEL_VENDOR_FILTER_VALUES]

type CuratedAttributionDecision = Pick<
  CuratedAttributionOverride,
  "targetVendorId" | "supersededVendorIds"
>

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
        result += value.charAt(index) + value.charAt(index + 1)
        index += 1
      } else {
        result += "�"
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      result += "�"
    } else {
      result += value.charAt(index)
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
  const [prefix, model] = segments
  if (!prefix || !model || segments.length !== 2) return undefined

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

  const [vendor] = adjustedMatches
  if (!vendor) return { state: "no-match" }
  if (adjustedMatches.length > 1) return { state: "ambiguous" }

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
export function compareCodePoints(left: string, right: string): number {
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
    const [first] = grouped
    if (!first) continue
    const label =
      grouped
        .map((candidate) => candidate.labelCandidate)
        .sort(compareCodePoints)[0] ?? first.labelCandidate
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
