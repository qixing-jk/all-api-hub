import {
  buildKiloCodeApiConfigs,
  buildKiloCodeSettingsFile,
  buildKiloCodeV7SettingsFile,
  KILO_CODE_EXPORT_FILENAMES,
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeExportFilename,
  type KiloCodeExportTarget,
  type KiloCodeExportTuple,
  type KiloCodeSettingsFile,
  type KiloCodeV7SettingsFile,
} from "~/services/integrations/kiloCodeExport"

export interface BuildKiloCodeExportOutputOptions {
  target: KiloCodeExportTarget
  selections: KiloCodeExportTuple[]
  currentLegacyProfileName: string
  now?: () => Date
}

export interface KiloCodeExportOutput {
  filename: KiloCodeExportFilename
  copyPayload: Record<string, unknown>
  downloadPayload: KiloCodeV7SettingsFile | KiloCodeSettingsFile
  itemCount: number
}

/** Fail at runtime while making unhandled export targets a compile-time error. */
function assertNeverTarget(target: never): never {
  throw new Error(`Unsupported Kilo Code export target: ${String(target)}`)
}

/** Build the target-specific copy and download payloads for Kilo Code export. */
export function buildKiloCodeExportOutput(
  options: BuildKiloCodeExportOutputOptions,
): KiloCodeExportOutput {
  if (options.target === KILO_CODE_EXPORT_TARGETS.KiloV7) {
    const downloadPayload = buildKiloCodeV7SettingsFile({
      selections: options.selections,
      now: options.now,
    })

    return {
      filename: KILO_CODE_EXPORT_FILENAMES.KiloV7,
      copyPayload: downloadPayload.provider,
      downloadPayload,
      itemCount: Object.keys(downloadPayload.provider).length,
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
      filename: KILO_CODE_EXPORT_FILENAMES.Legacy,
      copyPayload: apiConfigs,
      downloadPayload,
      itemCount: Object.keys(apiConfigs).length,
    }
  }

  return assertNeverTarget(options.target)
}
