import { describe, expect, it } from "vitest"

import {
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeExportTarget,
  type KiloCodeLegacySelection,
  type KiloCodeV7ProviderSelection,
} from "~/services/integrations/kiloCodeExport"
import {
  buildKiloCodeExportOutput,
  isKiloCodeSettingsFileTooLarge,
} from "~/services/integrations/kiloCodeExportPolicy"

const v7DefaultModelId = "模型-b 🚀"

const v7Selection: KiloCodeV7ProviderSelection = {
  accountId: "account-example",
  siteName: "示例站 🚀",
  baseUrl: "https://api.example.invalid",
  tokenId: 7,
  tokenName: "Default",
  tokenKey: "example-key",
  selectionId: "account-example:7",
  discoveredModelIds: [v7DefaultModelId, "model-a"],
}

const legacySelection: KiloCodeLegacySelection = {
  accountId: "account-example",
  siteName: "Example",
  baseUrl: "https://api.example.invalid",
  tokenId: 7,
  tokenName: "Default",
  tokenKey: "example-key",
  legacyModelId: "example-model",
}

describe("buildKiloCodeExportOutput", () => {
  it("copies the complete V7 top-level fragment and reports normalized counts", () => {
    const output = buildKiloCodeExportOutput({
      target: KILO_CODE_EXPORT_TARGETS.KiloV7,
      selections: [v7Selection],
      defaultModel: {
        selectionId: v7Selection.selectionId,
        modelId: v7DefaultModelId,
      },
      now: () => new Date("2026-07-13T00:00:00.000Z"),
    })

    expect(output.target).toBe(KILO_CODE_EXPORT_TARGETS.KiloV7)
    expect(output.filename).toBe("kilo-settings.json")
    expect(output.copyPayload).toEqual({
      provider: output.downloadPayload.provider,
      model: output.downloadPayload.model,
    })
    expect(output.itemCount).toBe(1)
    expect(output.modelCount).toBe(2)
    expect(output.downloadJson).toBe(
      JSON.stringify(output.downloadPayload, null, 2),
    )
    expect(output.downloadByteLength).toBe(
      new TextEncoder().encode(output.downloadJson).byteLength,
    )
    expect(output.downloadByteLength).toBeGreaterThan(
      output.downloadJson.length,
    )
    expect(output.isDownloadTooLarge).toBe(false)
  })

  it("keeps the legacy copy payload and model count unchanged", () => {
    const output = buildKiloCodeExportOutput({
      target: KILO_CODE_EXPORT_TARGETS.Legacy,
      selections: [legacySelection],
      currentLegacyProfileName: "Example - Default",
    })

    expect(output.target).toBe(KILO_CODE_EXPORT_TARGETS.Legacy)
    expect(output.filename).toBe("kilo-code-settings.json")
    expect(output.downloadPayload).toEqual({
      providerProfiles: {
        currentApiConfigName: "Example - Default",
        apiConfigs: output.downloadPayload.providerProfiles.apiConfigs,
      },
    })
    expect(output.copyPayload).toEqual(
      output.downloadPayload.providerProfiles.apiConfigs,
    )
    expect(output.copyPayload).toMatchObject({
      "Example - Default": {
        openAiModelId: "example-model",
      },
    })
    expect(output.itemCount).toBe(1)
    expect(output.modelCount).toBe(1)
    expect(output.downloadJson).toBe(
      JSON.stringify(output.downloadPayload, null, 2),
    )
  })

  it("accepts exactly 1 MiB and rejects 1 MiB plus one byte", () => {
    expect(isKiloCodeSettingsFileTooLarge(1_048_576)).toBe(false)
    expect(isKiloCodeSettingsFileTooLarge(1_048_577)).toBe(true)
  })

  it.each(["", "   "])(
    "rejects an invalid legacy current profile name: %j",
    (currentLegacyProfileName) => {
      expect(() =>
        buildKiloCodeExportOutput({
          target: KILO_CODE_EXPORT_TARGETS.Legacy,
          selections: [legacySelection],
          currentLegacyProfileName,
        }),
      ).toThrow("Legacy current profile name cannot be blank")
    },
  )

  it("rejects an unsupported runtime export target", () => {
    const buildWithRuntimeTarget =
      buildKiloCodeExportOutput as unknown as (options: {
        target: KiloCodeExportTarget
        selections: KiloCodeLegacySelection[]
        currentLegacyProfileName: string
      }) => unknown

    expect(() =>
      buildWithRuntimeTarget({
        target: "unsupported" as KiloCodeExportTarget,
        selections: [legacySelection],
        currentLegacyProfileName: "Example - Default",
      }),
    ).toThrow("Unsupported Kilo Code export target: unsupported")
  })
})
