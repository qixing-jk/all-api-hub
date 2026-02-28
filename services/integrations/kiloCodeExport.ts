import { safeRandomUUID } from "~/utils/identifier"
import { coerceBaseUrlToPathSuffix } from "~/utils/url"

export type KiloCodeApiProvider = "openai"

export interface KiloCodeApiConfig {
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

export interface KiloCodeProviderProfiles {
  currentApiConfigName: string
  apiConfigs: Record<string, KiloCodeApiConfig>
}

export interface KiloCodeSettingsFile {
  providerProfiles: KiloCodeProviderProfiles
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

export interface BuildKiloCodeApiConfigsOptions {
  selections: KiloCodeExportTuple[]
  generateId?: (profileName: string) => string
}

export interface BuildKiloCodeApiConfigsResult {
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
