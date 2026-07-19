import { safeRandomUUID } from "~/utils/core/identifier"
import { coerceBaseUrlToPathSuffix } from "~/utils/core/url"

export const KILO_CODE_EXPORT_TARGETS = {
  KiloV7: "kilo-v7",
  Legacy: "legacy",
} as const

export type KiloCodeExportTarget =
  (typeof KILO_CODE_EXPORT_TARGETS)[keyof typeof KILO_CODE_EXPORT_TARGETS]

export const KILO_CODE_EXPORT_TARGET_OPTIONS = [
  KILO_CODE_EXPORT_TARGETS.KiloV7,
  KILO_CODE_EXPORT_TARGETS.Legacy,
] as const satisfies readonly KiloCodeExportTarget[]

export const KILO_CODE_EXPORT_FILENAMES = {
  KiloV7: "kilo-settings.json",
  Legacy: "kilo-code-settings.json",
} as const satisfies Record<keyof typeof KILO_CODE_EXPORT_TARGETS, string>

export type KiloCodeExportFilename =
  (typeof KILO_CODE_EXPORT_FILENAMES)[keyof typeof KILO_CODE_EXPORT_FILENAMES]

type KiloCodeApiProvider = "openai"

interface KiloCodeApiConfig {
  id: string
  apiProvider: KiloCodeApiProvider
  openAiBaseUrl: string
  openAiApiKey: string
  /**
   * Model id for OpenAI-compatible providers.
   *
   * Note: this field is optional in the settings schema, but Kilo Code typically
   * requires a model id at runtime (the UI should guide users to pick one).
   */
  openAiModelId?: string
}

interface KiloCodeProviderProfiles {
  currentApiConfigName: string
  apiConfigs: Record<string, KiloCodeApiConfig>
}

export interface KiloCodeSettingsFile {
  providerProfiles: KiloCodeProviderProfiles
}

interface KiloCodeV7Provider {
  npm: "@ai-sdk/openai-compatible"
  models: Record<string, { name: string }>
  options: {
    apiKey: string
    baseURL: string
  }
}

export interface KiloCodeV7SettingsFile {
  _meta: {
    version: 1
    exportedAt: string
  }
  provider: Record<string, KiloCodeV7Provider>
  model: string
}

export interface KiloCodeExportTuple {
  accountId: string
  siteName: string
  baseUrl: string
  tokenId: number
  tokenName: string
  tokenKey: string
  /**
   * Upstream model id to export for this API key.
   */
  modelId?: string
}

interface NormalizedKiloCodeV7Selection {
  tuple: KiloCodeExportTuple
  baseURL: string
  modelId: string
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

/** Validate and normalize one selection before settings construction. */
function normalizeKiloCodeV7Selection(
  tuple: KiloCodeExportTuple,
): NormalizedKiloCodeV7Selection {
  if (!tuple.tokenKey.trim()) throw new Error("Runtime key cannot be blank")

  const modelId = tuple.modelId?.trim()
  if (!modelId) throw new Error("Model ID cannot be blank")

  const baseURL = coerceBaseUrlToPathSuffix(tuple.baseUrl, "/v1")
  let parsedUrl: URL
  try {
    parsedUrl = new URL(baseURL)
  } catch {
    throw new Error("Base URL must be a valid HTTP or HTTPS URL")
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Base URL must be a valid HTTP or HTTPS URL")
  }

  return { tuple, baseURL, modelId }
}

/**
 * Build the Kilo Code 7.x settings format.
 *
 * Contract source: https://github.com/Kilo-Org/kilocode/tree/3cb82a0907f888749435c1d208e56d8365747df2
 * Custom providers use the AI SDK OpenAI-compatible package and select models
 * with a provider/model identifier.
 */
export function buildKiloCodeV7SettingsFile(options: {
  selections: KiloCodeExportTuple[]
  now?: () => Date
  generateProviderId?: (selection: KiloCodeExportTuple) => string
}): KiloCodeV7SettingsFile {
  if (!options.selections.length) {
    throw new Error("Select at least one runtime key")
  }

  const selections = options.selections.map(normalizeKiloCodeV7Selection)
  const providerIds = selections.map((selection) =>
    options.generateProviderId
      ? options.generateProviderId(selection.tuple)
      : defaultKiloCodeV7ProviderId(selection),
  )
  if (new Set(providerIds).size !== providerIds.length) {
    throw new Error("Kilo Code provider IDs must be unique")
  }
  if (providerIds.some((id) => !/^[a-z0-9][a-z0-9-]*$/.test(id))) {
    throw new Error("Kilo Code provider IDs must be settings-safe")
  }

  const provider: Record<string, KiloCodeV7Provider> = {}
  selections.forEach((selection, index) => {
    provider[providerIds[index]] = {
      npm: "@ai-sdk/openai-compatible",
      models: {
        [selection.modelId]: { name: selection.modelId },
      },
      options: {
        apiKey: selection.tuple.tokenKey,
        baseURL: selection.baseURL,
      },
    }
  })

  const firstSelection = selections[0]
  const firstProviderId = providerIds[0]

  return {
    _meta: {
      version: 1,
      exportedAt: (options.now ?? (() => new Date()))().toISOString(),
    },
    provider,
    model: `${firstProviderId}/${firstSelection.modelId}`,
  }
}

interface BuildKiloCodeApiConfigsOptions {
  selections: KiloCodeExportTuple[]
  generateId?: (profileName: string) => string
}

interface BuildKiloCodeApiConfigsResult {
  apiConfigs: Record<string, KiloCodeApiConfig>
  profileNames: string[]
}

/**
 * Build a base profile name for a single exported API key.
 *
 * Kilo Code/Roo Code profiles are ultimately keyed by a string name. In this
 * exporter we name profiles per API key so multiple keys can be exported from
 * the same site without collisions.
 */
function getBaseProfileName(tuple: KiloCodeExportTuple) {
  const siteName = tuple.siteName.trim() || tuple.baseUrl.trim()
  const tokenLabel = tuple.tokenName.trim() || `Token ${tuple.tokenId}`
  return `${siteName} - ${tokenLabel}`
}

/**
 * Extract a stable domain label for disambiguation.
 */
function getDomainLabel(baseUrl: string) {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl.trim()
  }
}

/**
 * Build stable, collision-resistant profile names.
 *
 * Rules:
 * - Start with a human-readable `${site} - ${token}` base.
 * - If duplicates exist, append the domain.
 * - If duplicates still exist, append deterministic numbering.
 */
function buildUniqueProfileNames(selections: KiloCodeExportTuple[]) {
  const baseNames = selections.map((tuple) => ({
    tuple,
    baseName: getBaseProfileName(tuple),
    domain: getDomainLabel(tuple.baseUrl),
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

  const stableSortKey = (tuple: KiloCodeExportTuple) => {
    return [
      tuple.siteName.trim(),
      tuple.baseUrl.trim(),
      tuple.tokenName.trim(),
      `${tuple.tokenId}`,
      tuple.accountId,
    ].join("\u0000")
  }

  const finalNames = withDomainNames.map((item) => {
    const group = byName.get(item.name) ?? []
    if (group.length <= 1) {
      return { tuple: item.tuple, name: item.name }
    }

    const sorted = [...group].sort((a, b) =>
      stableSortKey(a.tuple).localeCompare(stableSortKey(b.tuple)),
    )
    const index = sorted.findIndex(
      (candidate) => candidate.tuple === item.tuple,
    )
    return { tuple: item.tuple, name: `${item.name} #${index + 1}` }
  })

  return finalNames
}

/**
 * Build `providerProfiles.apiConfigs` entries for Kilo Code / Roo Code settings.
 *
 * Notes:
 * - This function is intentionally pure: it has no side effects and does not log.
 * - Caller is responsible for UI warnings about plaintext API keys.
 */
export function buildKiloCodeApiConfigs(
  options: BuildKiloCodeApiConfigsOptions,
): BuildKiloCodeApiConfigsResult {
  const { selections, generateId } = options
  if (!selections.length) return { apiConfigs: {}, profileNames: [] }

  const idFactory = generateId ?? (() => safeRandomUUID("kilocode-api-config"))
  const names = buildUniqueProfileNames(selections)

  const apiConfigs: Record<string, KiloCodeApiConfig> = {}
  for (const { tuple, name } of names) {
    const normalizedModelId = tuple.modelId?.trim()
    apiConfigs[name] = {
      id: idFactory(name),
      apiProvider: "openai",
      openAiBaseUrl: coerceBaseUrlToPathSuffix(tuple.baseUrl, "/v1"),
      openAiApiKey: tuple.tokenKey,
      ...(normalizedModelId ? { openAiModelId: normalizedModelId } : {}),
    }
  }

  const profileNames = Object.keys(apiConfigs).sort((a, b) =>
    a.localeCompare(b),
  )
  return { apiConfigs, profileNames }
}

/**
 * Build a minimal Kilo Code / Roo Code settings file payload.
 */
export function buildKiloCodeSettingsFile(options: {
  currentApiConfigName: string
  apiConfigs: Record<string, KiloCodeApiConfig>
}): KiloCodeSettingsFile {
  return {
    providerProfiles: {
      currentApiConfigName: options.currentApiConfigName,
      apiConfigs: options.apiConfigs,
    },
  }
}
