import {
  buildKiloCodeApiConfigs,
  buildKiloCodeSettingsFile,
  buildKiloCodeV7SettingsFile,
  KILO_CODE_EXPORT_FILENAMES,
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeDefaultModelSelection,
  type KiloCodeExportFilename,
  type KiloCodeLegacySelection,
  type KiloCodeSettingsFile,
  type KiloCodeV7ProviderSelection,
  type KiloCodeV7SettingsFile,
} from "~/services/integrations/kiloCodeExport"
import { prepareKiloCodeV7Catalog } from "~/services/integrations/kiloCodeV7Catalog"

// Kilo MAX_IMPORT_SIZE source: https://github.com/Kilo-Org/kilocode/blob/3cb82a0907f888749435c1d208e56d8365747df2/packages/kilo-vscode/webview-ui/src/components/settings/settings-io.ts
const KILO_CODE_SETTINGS_MAX_IMPORT_BYTES = 1_048_576

/** Report whether a serialized settings file exceeds Kilo's import limit. */
export function isKiloCodeSettingsFileTooLarge(byteLength: number) {
  return byteLength > KILO_CODE_SETTINGS_MAX_IMPORT_BYTES
}

interface BuildKiloCodeV7ExportOutputOptions {
  target: typeof KILO_CODE_EXPORT_TARGETS.KiloV7
  selections: KiloCodeV7ProviderSelection[]
  defaultModel: KiloCodeDefaultModelSelection
  now?: () => Date
}

interface BuildKiloCodeLegacyExportOutputOptions {
  target: typeof KILO_CODE_EXPORT_TARGETS.Legacy
  selections: KiloCodeLegacySelection[]
  currentLegacyProfileName: string
}

type BuildKiloCodeExportOutputOptions =
  | BuildKiloCodeV7ExportOutputOptions
  | BuildKiloCodeLegacyExportOutputOptions

interface KiloCodeExportOutputBase {
  filename: KiloCodeExportFilename
  downloadJson: string
  downloadByteLength: number
  isDownloadTooLarge: boolean
  itemCount: number
  modelCount: number
}

interface KiloCodeV7ExportOutput extends KiloCodeExportOutputBase {
  target: typeof KILO_CODE_EXPORT_TARGETS.KiloV7
  copyPayload: Pick<KiloCodeV7SettingsFile, "provider" | "model">
  downloadPayload: KiloCodeV7SettingsFile
}

interface KiloCodeLegacyExportOutput extends KiloCodeExportOutputBase {
  target: typeof KILO_CODE_EXPORT_TARGETS.Legacy
  copyPayload: KiloCodeSettingsFile["providerProfiles"]["apiConfigs"]
  downloadPayload: KiloCodeSettingsFile
}

export type KiloCodeExportOutput =
  | KiloCodeV7ExportOutput
  | KiloCodeLegacyExportOutput

/** Fail at runtime while making unhandled export targets a compile-time error. */
function assertNeverTarget(target: never): never {
  throw new Error(`Unsupported Kilo Code export target: ${String(target)}`)
}

/** Describe the serialized settings file without re-serializing its payload. */
function buildDownloadMetadata(
  downloadPayload: KiloCodeV7SettingsFile | KiloCodeSettingsFile,
) {
  const downloadJson = JSON.stringify(downloadPayload, null, 2)
  const downloadByteLength = new TextEncoder().encode(downloadJson).byteLength

  return {
    downloadJson,
    downloadByteLength,
    isDownloadTooLarge: isKiloCodeSettingsFileTooLarge(downloadByteLength),
  }
}

export function buildKiloCodeExportOutput(
  options: BuildKiloCodeV7ExportOutputOptions,
): KiloCodeV7ExportOutput
export function buildKiloCodeExportOutput(
  options: BuildKiloCodeLegacyExportOutputOptions,
): KiloCodeLegacyExportOutput
/** Build the target-specific copy and download payloads for Kilo Code export. */
export function buildKiloCodeExportOutput(
  options: BuildKiloCodeExportOutputOptions,
): KiloCodeExportOutput {
  if (options.target === KILO_CODE_EXPORT_TARGETS.KiloV7) {
    const catalog = prepareKiloCodeV7Catalog(options.selections)
    const downloadPayload = buildKiloCodeV7SettingsFile({
      catalog,
      defaultModel: options.defaultModel,
      now: options.now,
    })

    return {
      target: KILO_CODE_EXPORT_TARGETS.KiloV7,
      filename: KILO_CODE_EXPORT_FILENAMES.KiloV7,
      copyPayload: {
        provider: downloadPayload.provider,
        model: downloadPayload.model,
      },
      downloadPayload,
      ...buildDownloadMetadata(downloadPayload),
      itemCount: catalog.providerCount,
      modelCount: catalog.modelCount,
    }
  }

  if (options.target === KILO_CODE_EXPORT_TARGETS.Legacy) {
    if (!options.currentLegacyProfileName.trim()) {
      throw new Error("Legacy current profile name cannot be blank")
    }

    const { apiConfigs } = buildKiloCodeApiConfigs({
      selections: options.selections,
    })
    const downloadPayload = buildKiloCodeSettingsFile({
      currentApiConfigName: options.currentLegacyProfileName,
      apiConfigs,
    })

    return {
      target: KILO_CODE_EXPORT_TARGETS.Legacy,
      filename: KILO_CODE_EXPORT_FILENAMES.Legacy,
      copyPayload: downloadPayload.providerProfiles.apiConfigs,
      downloadPayload,
      ...buildDownloadMetadata(downloadPayload),
      itemCount: Object.keys(apiConfigs).length,
      modelCount: Object.values(apiConfigs).filter(
        (apiConfig) => apiConfig.openAiModelId,
      ).length,
    }
  }

  return assertNeverTarget((options as unknown as { target: never }).target)
}
