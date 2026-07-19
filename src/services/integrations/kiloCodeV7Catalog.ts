import { coerceBaseUrlToPathSuffix } from "~/utils/core/url"

export const KILO_CODE_PROVIDER_PROTOCOLS = {
  OpenAICompatible: "openai-compatible",
  OpenAIResponses: "openai-responses",
  AnthropicMessages: "anthropic-messages",
} as const

export type KiloCodeProviderProtocol =
  (typeof KILO_CODE_PROVIDER_PROTOCOLS)[keyof typeof KILO_CODE_PROVIDER_PROTOCOLS]

export const KILO_CODE_PROVIDER_PROTOCOL_NPM = {
  [KILO_CODE_PROVIDER_PROTOCOLS.OpenAICompatible]: "@ai-sdk/openai-compatible",
  [KILO_CODE_PROVIDER_PROTOCOLS.OpenAIResponses]: "@ai-sdk/openai",
  [KILO_CODE_PROVIDER_PROTOCOLS.AnthropicMessages]: "@ai-sdk/anthropic",
} as const satisfies Record<KiloCodeProviderProtocol, string>

export type KiloCodeProviderNpm =
  (typeof KILO_CODE_PROVIDER_PROTOCOL_NPM)[KiloCodeProviderProtocol]

export interface KiloCodeRuntimeKeyExportInput {
  accountId: string
  siteName: string
  baseUrl: string
  tokenId: number
  tokenName: string
  tokenKey: string
}

export interface KiloCodeLegacySelection extends KiloCodeRuntimeKeyExportInput {
  legacyModelId?: string
}

export interface KiloCodeV7ProviderSelection
  extends KiloCodeRuntimeKeyExportInput {
  selectionId: string
  providerName?: string
  protocol?: KiloCodeProviderProtocol
  discoveredModelIds: string[]
  manualModelId?: string
}

export interface KiloCodeDefaultModelSelection {
  selectionId: string
  modelId: string
}

export interface PreparedKiloCodeV7Provider {
  selectionId: string
  providerId: string
  providerName: string
  baseURL: string
  tokenKey: string
  protocol: KiloCodeProviderProtocol
  modelIds: string[]
}

export interface PreparedKiloCodeV7Catalog {
  providers: PreparedKiloCodeV7Provider[]
  providerCount: number
  modelCount: number
}

interface NormalizedKiloCodeV7Selection {
  tuple: KiloCodeV7ProviderSelection
  baseURL: string
  protocol: KiloCodeProviderProtocol
  modelIds: string[]
}

/** Convert a provider label to Kilo Code's settings-safe identifier format. */
function slugifyProviderName(value: string) {
  return (
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "provider"
  )
}

/** Produce a deterministic FNV-1a digest for a provider identity. */
function hashProviderIdentity(value: string) {
  let hash = 0x811c9dc5
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

/** Combine a readable label with a stable identity digest. */
function defaultKiloCodeV7ProviderId(selection: NormalizedKiloCodeV7Selection) {
  const { tuple, baseURL } = selection
  const identity = [
    tuple.accountId,
    baseURL,
    `${tuple.tokenId}`,
    tuple.tokenName.trim(),
  ].join("\u0000")
  const name = slugifyProviderName(
    `${tuple.siteName.trim()}-${tuple.tokenName.trim()}`,
  )
  return `${name}-${hashProviderIdentity(identity)}`
}

/** Compare model IDs using deterministic Unicode code-point order. */
function compareKiloCodeModelIds(left: string, right: string) {
  if (left === right) return 0
  const leftCodePoints = Array.from(
    left,
    (character) => character.codePointAt(0)!,
  )
  const rightCodePoints = Array.from(
    right,
    (character) => character.codePointAt(0)!,
  )
  const length = Math.min(leftCodePoints.length, rightCodePoints.length)
  for (let index = 0; index < length; index += 1) {
    const leftCodePoint = leftCodePoints[index]!
    const rightCodePoint = rightCodePoints[index]!
    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint < rightCodePoint ? -1 : 1
    }
  }
  return leftCodePoints.length < rightCodePoints.length ? -1 : 1
}

/** Trim, deduplicate, and sort discovered and manually entered model IDs. */
export function normalizeKiloCodeModelIds(modelIds: readonly unknown[]) {
  return Array.from(
    new Set(
      modelIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).sort(compareKiloCodeModelIds)
}

/** Normalize the complete discovered and manual catalog for one provider. */
function normalizeModelIds(selection: KiloCodeV7ProviderSelection) {
  return normalizeKiloCodeModelIds([
    ...selection.discoveredModelIds,
    selection.manualModelId,
  ])
}

/** Resolve a caller-provided provider name or the legacy site/token fallback. */
function getBaseProviderName(selection: KiloCodeV7ProviderSelection) {
  const preferredName = selection.providerName?.trim()
  if (preferredName) return preferredName

  const siteName = selection.siteName.trim() || selection.baseUrl.trim()
  const tokenLabel = selection.tokenName.trim() || `Token ${selection.tokenId}`
  return `${siteName} - ${tokenLabel}`
}

/** Extract a stable host label for duplicate-name disambiguation. */
function getDomainLabel(baseUrl: string) {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl.trim()
  }
}

/** Disambiguate duplicate provider display names by host and stable ordinal. */
export function buildUniqueKiloCodeProviderNames<
  TSelection extends KiloCodeRuntimeKeyExportInput,
>(selections: TSelection[], getBaseName: (selection: TSelection) => string) {
  const baseNames = selections.map((selection) => ({
    selection,
    baseName: getBaseName(selection),
    domain: getDomainLabel(selection.baseUrl),
  }))

  const byBaseName = new Map<string, typeof baseNames>()
  for (const item of baseNames) {
    const existing = byBaseName.get(item.baseName)
    if (existing) {
      existing.push(item)
    } else {
      byBaseName.set(item.baseName, [item])
    }
  }

  const withDomainNames = baseNames.map((item) => {
    const group = byBaseName.get(item.baseName) ?? []
    if (group.length <= 1) {
      return { ...item, name: item.baseName }
    }
    return { ...item, name: `${item.baseName} (${item.domain})` }
  })

  const byName = new Map<string, typeof withDomainNames>()
  for (const item of withDomainNames) {
    const existing = byName.get(item.name)
    if (existing) {
      existing.push(item)
    } else {
      byName.set(item.name, [item])
    }
  }

  const stableSortKey = (selection: TSelection) => {
    return [
      selection.siteName.trim(),
      selection.baseUrl.trim(),
      selection.tokenName.trim(),
      `${selection.tokenId}`,
      selection.accountId,
    ].join("\u0000")
  }

  return withDomainNames.map((item) => {
    const group = byName.get(item.name) ?? []
    if (group.length <= 1) {
      return { selection: item.selection, name: item.name }
    }

    const sorted = [...group].sort((left, right) =>
      stableSortKey(left.selection).localeCompare(
        stableSortKey(right.selection),
      ),
    )
    const index = sorted.findIndex(
      (candidate) => candidate.selection === item.selection,
    )
    return { selection: item.selection, name: `${item.name} #${index + 1}` }
  })
}

/** Validate and normalize one V7 provider selection. */
function normalizeSelection(
  selection: KiloCodeV7ProviderSelection,
): NormalizedKiloCodeV7Selection {
  if (!selection.tokenKey.trim()) throw new Error("Runtime key cannot be blank")

  const modelIds = normalizeModelIds(selection)
  if (!modelIds.length) {
    throw new Error("Select at least one model for each provider")
  }

  const baseURL = coerceBaseUrlToPathSuffix(selection.baseUrl, "/v1")
  let parsedUrl: URL
  try {
    parsedUrl = new URL(baseURL)
  } catch {
    throw new Error("Base URL must be a valid HTTP or HTTPS URL")
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Base URL must be a valid HTTP or HTTPS URL")
  }

  const protocol =
    selection.protocol ?? KILO_CODE_PROVIDER_PROTOCOLS.OpenAICompatible
  if (!Object.hasOwn(KILO_CODE_PROVIDER_PROTOCOL_NPM, protocol)) {
    throw new Error("Kilo Code provider protocol is unsupported")
  }

  return { tuple: selection, baseURL, protocol, modelIds }
}

/** Prepare normalized provider facts shared by Kilo Code V7 UI and export. */
export function prepareKiloCodeV7Catalog(
  selections: KiloCodeV7ProviderSelection[],
): PreparedKiloCodeV7Catalog {
  const selectionIds = selections.map((selection) => selection.selectionId)
  if (new Set(selectionIds).size !== selectionIds.length) {
    throw new Error("Kilo Code selection IDs must be unique")
  }

  const normalizedSelections = selections.map(normalizeSelection)
  const providerIds = normalizedSelections.map(defaultKiloCodeV7ProviderId)
  if (new Set(providerIds).size !== providerIds.length) {
    throw new Error("Kilo Code provider IDs must be unique")
  }
  if (providerIds.some((id) => !/^[a-z0-9][a-z0-9-]*$/.test(id))) {
    throw new Error("Kilo Code provider IDs must be settings-safe")
  }

  const providerNames = buildUniqueKiloCodeProviderNames(
    selections,
    getBaseProviderName,
  )
  const providers = normalizedSelections.map((normalized, index) => ({
    selectionId: normalized.tuple.selectionId,
    providerId: providerIds[index],
    providerName: providerNames[index].name,
    baseURL: normalized.baseURL,
    tokenKey: normalized.tuple.tokenKey,
    protocol: normalized.protocol,
    modelIds: normalized.modelIds,
  }))

  return {
    providers,
    providerCount: providers.length,
    modelCount: providers.reduce(
      (count, provider) => count + provider.modelIds.length,
      0,
    ),
  }
}
