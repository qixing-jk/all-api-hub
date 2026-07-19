import { buildUniqueKiloCodeProviderNames } from "~/services/integrations/kiloCodeV7Catalog"
import type {
  KiloCodeDefaultModelSelection,
  KiloCodeLegacySelection,
  KiloCodeRuntimeKeyExportInput,
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
  PreparedKiloCodeV7Provider,
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

/**
 * Compatibility input for the current dialogs and legacy builder.
 * @deprecated Remove after Tasks 5 and 6 migrate both dialogs to the
 * target-specific V7 and legacy contracts.
 */
export interface KiloCodeExportTuple extends KiloCodeRuntimeKeyExportInput {
  /**
   * Upstream model id to export for this API key.
   */
  modelId?: string
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
  if (!options.catalog.providers.length) {
    throw new Error("Select at least one runtime key")
  }
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

/** Read the target-specific legacy model or the temporary shared-tuple field. */
function getLegacyModelId(selection: KiloCodeLegacySelection) {
  if (selection.legacyModelId !== undefined) {
    return selection.legacyModelId.trim() || undefined
  }

  // Remove with KiloCodeExportTuple after Tasks 5 and 6 migrate both dialogs.
  const compatibilitySelection = selection as KiloCodeLegacySelection & {
    modelId?: unknown
  }
  return typeof compatibilitySelection.modelId === "string"
    ? compatibilitySelection.modelId.trim()
    : undefined
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
