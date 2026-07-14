import {
  removeDateSuffix,
  toModelTokenKey,
} from "~/services/models/utils/modelName"

import type { ModelIdentityLookupResult, ModelMetadata } from "./types"

type IndexedMetadata = {
  ordinal: number
  metadata: ModelMetadata
}

type LookupSlot = IndexedMetadata | null

type AliasLookupMaps = {
  aliases: Map<string, LookupSlot>
  tokenAliases: Map<string, LookupSlot>
}

/**
 * Returns a defensive copy suitable for an index snapshot or lookup result.
 */
function cloneMetadata(metadata: ModelMetadata): ModelMetadata {
  return {
    ...metadata,
    ...(metadata.capabilities
      ? { capabilities: { ...metadata.capabilities } }
      : {}),
    ...(metadata.modalities
      ? {
          modalities: {
            input: [...metadata.modalities.input],
            output: [...metadata.modalities.output],
          },
        }
      : {}),
    ...(metadata.limits ? { limits: { ...metadata.limits } } : {}),
  }
}

/**
 * Normalizes casing and surrounding whitespace without changing identity syntax.
 */
function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Extracts the model portion of a stored provider-qualified metadata id.
 */
function getBareIdentity(value: string): string {
  const lastSlashIndex = value.lastIndexOf("/")
  return lastSlashIndex === -1 ? value : value.slice(lastSlashIndex + 1)
}

/**
 * Builds an order-insensitive alias key while retaining the leading model token.
 */
function toConservativeTokenKey(value: string): string | null {
  const normalized = removeDateSuffix(normalizeIdentity(value)).replace(
    /\./g,
    "-",
  )
  const prefix = normalized
    .split(/[-_]/)
    .map((token) => token.trim())
    .find(Boolean)
  const tokenKey = toModelTokenKey(normalized)

  return prefix && tokenKey ? `${prefix}:${tokenKey}` : null
}

/**
 * Adds a lookup candidate and records collisions as ambiguous.
 */
function addLookup(
  map: Map<string, LookupSlot>,
  key: string | null,
  indexedMetadata: IndexedMetadata,
): void {
  if (!key) return

  const existing = map.get(key)
  if (existing === undefined) {
    map.set(key, indexedMetadata)
  } else if (existing?.ordinal !== indexedMetadata.ordinal) {
    map.set(key, null)
  }
}

/**
 * Adds one candidate to the raw and token-normalized alias maps.
 */
function addAliasCandidate(
  maps: AliasLookupMaps,
  candidate: string,
  indexedMetadata: IndexedMetadata,
): void {
  const normalizedAlias = normalizeIdentity(candidate)
  if (!normalizedAlias || normalizedAlias.includes("/")) return

  addLookup(maps.aliases, normalizedAlias, indexedMetadata)
  addLookup(maps.aliases, removeDateSuffix(normalizedAlias), indexedMetadata)
  addLookup(
    maps.tokenAliases,
    toConservativeTokenKey(normalizedAlias),
    indexedMetadata,
  )
}

/**
 * Converts an internal lookup slot into the public discriminated result.
 */
function toLookupResult(
  map: Map<string, LookupSlot>,
  key: string | null,
  match: "exact" | "normalized-alias",
): ModelIdentityLookupResult | null {
  if (!key || !map.has(key)) return null

  const indexedMetadata = map.get(key)
  if (!indexedMetadata) {
    return { state: "ambiguous" }
  }

  return {
    state: "resolved",
    match,
    metadata: cloneMetadata(indexedMetadata.metadata),
  }
}

/**
 * Resolves an unqualified model id against one alias scope.
 */
function resolveAliasFromMaps(
  maps: AliasLookupMaps,
  rawModelId: string,
): ModelIdentityLookupResult {
  const normalized = normalizeIdentity(rawModelId)
  if (!normalized || normalized.includes("/")) {
    return { state: "unmatched" }
  }

  const rawAlias = toLookupResult(maps.aliases, normalized, "normalized-alias")
  if (rawAlias) return rawAlias

  const dateNormalizedAlias = toLookupResult(
    maps.aliases,
    removeDateSuffix(normalized),
    "normalized-alias",
  )
  if (dateNormalizedAlias) return dateNormalizedAlias

  return (
    toLookupResult(
      maps.tokenAliases,
      toConservativeTokenKey(normalized),
      "normalized-alias",
    ) ?? { state: "unmatched" }
  )
}

class ModelIdentityIndexImpl {
  private readonly exactIds = new Map<string, LookupSlot>()
  private readonly generalAliases: AliasLookupMaps = {
    aliases: new Map(),
    tokenAliases: new Map(),
  }
  private readonly redirectAliases: AliasLookupMaps = {
    aliases: new Map(),
    tokenAliases: new Map(),
  }

  constructor(modelMetadata: ModelMetadata[]) {
    modelMetadata.forEach((metadata, ordinal) => {
      const indexedMetadata = {
        ordinal,
        metadata: cloneMetadata(metadata),
      }
      const exactId = normalizeIdentity(metadata.id)

      addLookup(this.exactIds, exactId, indexedMetadata)

      const bareId = getBareIdentity(metadata.id)
      addAliasCandidate(this.generalAliases, bareId, indexedMetadata)
      addAliasCandidate(this.redirectAliases, bareId, indexedMetadata)
      addAliasCandidate(this.generalAliases, metadata.name, indexedMetadata)
    })
  }

  resolveExact(rawModelId: string): ModelIdentityLookupResult | null {
    return toLookupResult(this.exactIds, normalizeIdentity(rawModelId), "exact")
  }

  resolveAlias(rawModelId: string): ModelIdentityLookupResult {
    return resolveAliasFromMaps(this.generalAliases, rawModelId)
  }

  resolveRedirectAlias(rawModelId: string): ModelIdentityLookupResult {
    return resolveAliasFromMaps(this.redirectAliases, rawModelId)
  }
}

export type ModelIdentityIndex = ModelIdentityIndexImpl

/**
 * Builds an ambiguity-aware identity index without exposing its lookup maps.
 */
export function createModelIdentityIndex(
  modelMetadata: ModelMetadata[],
): ModelIdentityIndex {
  return new ModelIdentityIndexImpl(modelMetadata)
}

/**
 * Resolves displayed model ids through exact identities and conservative aliases.
 */
export function resolveModelIdentity(
  index: ModelIdentityIndex,
  displayedId: string,
): ModelIdentityLookupResult {
  return index.resolveExact(displayedId) ?? index.resolveAlias(displayedId)
}

/**
 * Resolves redirect ids without aliasing a caller-selected dated version.
 */
export function resolveRedirectModelIdentity(
  index: ModelIdentityIndex,
  rawModelId: string,
): ModelIdentityLookupResult {
  const exact = index.resolveExact(rawModelId)
  if (exact) return exact

  const normalized = normalizeIdentity(rawModelId)
  if (removeDateSuffix(normalized) !== normalized) {
    return { state: "unmatched" }
  }

  return index.resolveRedirectAlias(rawModelId)
}
