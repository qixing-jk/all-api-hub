import {
  buildUniqueKiloCodeProviderNames,
  normalizeKiloCodeModelIds,
} from "~/services/integrations/kiloCodeV7Catalog"
import type {
  KiloCodeDefaultModelSelection,
  KiloCodeLegacySelection,
  PreparedKiloCodeV7Catalog,
} from "~/services/integrations/kiloCodeV7Catalog"
import { safeRandomUUID } from "~/utils/core/identifier"
import { coerceBaseUrlToPathSuffix } from "~/utils/core/url"

export type {
  KiloCodeDefaultModelSelection,
  KiloCodeLegacySelection,
  KiloCodeRuntimeKeyExportInput,
  KiloCodeV7ProviderSelection,
  PreparedKiloCodeV7Catalog,
} from "~/services/integrations/kiloCodeV7Catalog"

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
  name: string
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

interface BuildPreparedKiloCodeV7SettingsOptions {
  catalog: PreparedKiloCodeV7Catalog
  defaultModel: KiloCodeDefaultModelSelection
  now?: () => Date
}

/** Reject malformed prepared catalogs at the public schema boundary. */
function validatePreparedKiloCodeV7Catalog(catalog: PreparedKiloCodeV7Catalog) {
  if (!catalog.providers.length) {
    throw new Error("Select at least one runtime key")
  }
  if (catalog.providerCount !== catalog.providers.length) {
    throw new Error("Kilo Code catalog provider count is inconsistent")
  }

  const providerIds = new Set<string>()
  const providerNames = new Set<string>()
  const selectionIds = new Set<string>()
  let modelCount = 0
  for (const provider of catalog.providers) {
    if (!provider.selectionId.trim()) {
      throw new Error("Kilo Code provider selection ID cannot be blank")
    }
    if (selectionIds.has(provider.selectionId)) {
      throw new Error("Kilo Code provider selection IDs must be unique")
    }
    selectionIds.add(provider.selectionId)
    if (!provider.providerId.trim()) {
      throw new Error("Kilo Code provider ID cannot be blank")
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(provider.providerId)) {
      throw new Error("Kilo Code provider IDs must be settings-safe")
    }
    if (providerIds.has(provider.providerId)) {
      throw new Error("Kilo Code provider IDs must be unique")
    }
    providerIds.add(provider.providerId)
    if (!provider.providerName.trim()) {
      throw new Error("Kilo Code provider name cannot be blank")
    }
    const providerName = provider.providerName.trim()
    if (providerNames.has(providerName)) {
      throw new Error("Kilo Code provider names must be unique")
    }
    providerNames.add(providerName)
    if (!provider.tokenKey.trim()) {
      throw new Error("Kilo Code provider token key cannot be blank")
    }
    let parsedBaseURL: URL
    try {
      parsedBaseURL = new URL(provider.baseURL)
    } catch {
      throw new Error(
        "Kilo Code provider base URL must be a valid HTTP or HTTPS URL",
      )
    }
    if (
      parsedBaseURL.protocol !== "http:" &&
      parsedBaseURL.protocol !== "https:"
    ) {
      throw new Error(
        "Kilo Code provider base URL must be a valid HTTP or HTTPS URL",
      )
    }
    if (!provider.modelIds.length) {
      throw new Error("Kilo Code provider model catalog cannot be empty")
    }
    const modelIds = new Set<string>()
    for (const modelId of provider.modelIds) {
      if (!modelId.trim() || modelId !== modelId.trim()) {
        throw new Error("Kilo Code provider model IDs must be normalized")
      }
      if (modelIds.has(modelId)) {
        throw new Error("Kilo Code provider model IDs must be unique")
      }
      modelIds.add(modelId)
    }
    const normalizedModelIds = normalizeKiloCodeModelIds(provider.modelIds)
    if (
      provider.modelIds.some(
        (modelId, index) => modelId !== normalizedModelIds[index],
      )
    ) {
      throw new Error("Kilo Code provider model IDs must use canonical order")
    }
    modelCount += provider.modelIds.length
  }
  if (catalog.modelCount !== modelCount) {
    throw new Error("Kilo Code catalog model count is inconsistent")
  }
}

/**
 * Build the Kilo Code 7.x settings format.
 *
 * Contract source: https://github.com/Kilo-Org/kilocode/tree/3cb82a0907f888749435c1d208e56d8365747df2
 * Custom providers require a display `name`, use the AI SDK OpenAI-compatible
 * package, expose a multi-model `models` map, and select the top-level default
 * `model` with a provider/model identifier.
 */
function buildPreparedKiloCodeV7SettingsFile(
  options: BuildPreparedKiloCodeV7SettingsOptions,
): KiloCodeV7SettingsFile {
  validatePreparedKiloCodeV7Catalog(options.catalog)
  if (!options.defaultModel) {
    throw new Error("Kilo Code default model is required")
  }

  const defaultProvider = options.catalog.providers.find(
    (provider) => provider.selectionId === options.defaultModel.selectionId,
  )
  if (!defaultProvider) {
    throw new Error("Kilo Code default provider must be exported")
  }
  if (!defaultProvider.modelIds.includes(options.defaultModel.modelId)) {
    throw new Error(
      "Kilo Code default model must exist in its provider catalog",
    )
  }

  const provider: Record<string, KiloCodeV7Provider> = {}
  for (const preparedProvider of options.catalog.providers) {
    provider[preparedProvider.providerId] = {
      name: preparedProvider.providerName,
      npm: "@ai-sdk/openai-compatible",
      models: Object.fromEntries(
        preparedProvider.modelIds.map((modelId) => [
          modelId,
          { name: modelId },
        ]),
      ),
      options: {
        apiKey: preparedProvider.tokenKey,
        baseURL: preparedProvider.baseURL,
      },
    }
  }

  return {
    _meta: {
      version: 1,
      exportedAt: (options.now ?? (() => new Date()))().toISOString(),
    },
    provider,
    model: `${defaultProvider.providerId}/${options.defaultModel.modelId}`,
  }
}

/** Build a Kilo Code V7 settings file from a prepared provider catalog. */
export function buildKiloCodeV7SettingsFile(
  options: BuildPreparedKiloCodeV7SettingsOptions,
): KiloCodeV7SettingsFile {
  return buildPreparedKiloCodeV7SettingsFile(options)
}

interface BuildKiloCodeApiConfigsOptions {
  selections: KiloCodeLegacySelection[]
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
function getBaseProfileName(tuple: KiloCodeLegacySelection) {
  const siteName = tuple.siteName.trim() || tuple.baseUrl.trim()
  const tokenLabel = tuple.tokenName.trim() || `Token ${tuple.tokenId}`
  return `${siteName} - ${tokenLabel}`
}

/** Read the target-specific legacy model. */
function getLegacyModelId(selection: KiloCodeLegacySelection) {
  return selection.legacyModelId?.trim() || undefined
}

/** Derive deterministic legacy profile names without materializing API keys. */
export function getKiloCodeApiConfigProfileNames(
  options: Pick<BuildKiloCodeApiConfigsOptions, "selections">,
) {
  const names = buildUniqueKiloCodeProviderNames(
    options.selections,
    getBaseProfileName,
  ).map(({ name }) => name)
  return names.sort((left, right) => left.localeCompare(right))
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
  const names = buildUniqueKiloCodeProviderNames(selections, getBaseProfileName)

  const apiConfigs: Record<string, KiloCodeApiConfig> = {}
  for (const { selection, name } of names) {
    const normalizedModelId = getLegacyModelId(selection)
    apiConfigs[name] = {
      id: idFactory(name),
      apiProvider: "openai",
      openAiBaseUrl: coerceBaseUrlToPathSuffix(selection.baseUrl, "/v1"),
      openAiApiKey: selection.tokenKey,
      ...(normalizedModelId ? { openAiModelId: normalizedModelId } : {}),
    }
  }

  const profileNames = getKiloCodeApiConfigProfileNames({ selections })
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
