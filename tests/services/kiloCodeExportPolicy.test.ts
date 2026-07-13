import { describe, expect, it } from "vitest"

import {
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeExportTuple,
} from "~/services/integrations/kiloCodeExport"
import { buildKiloCodeExportOutput } from "~/services/integrations/kiloCodeExportPolicy"

const selection: KiloCodeExportTuple = {
  accountId: "account-example",
  siteName: "Example",
  baseUrl: "https://api.example.invalid",
  tokenId: 7,
  tokenName: "Default",
  tokenKey: "example-key",
  modelId: "example-model",
}

describe("buildKiloCodeExportOutput", () => {
  it("builds the Kilo Code 7.x download and provider copy payloads", () => {
    const output = buildKiloCodeExportOutput({
      target: KILO_CODE_EXPORT_TARGETS.KiloV7,
      selections: [selection],
      currentLegacyProfileName: "Example - Default",
      now: () => new Date("2026-07-13T00:00:00.000Z"),
    })

    expect(output.filename).toBe("kilo-settings.json")
    expect(output.downloadPayload).toMatchObject({
      provider: output.copyPayload,
    })
    expect(output.itemCount).toBe(1)
  })

  it("builds the legacy settings download around the API configs copy payload", () => {
    const output = buildKiloCodeExportOutput({
      target: KILO_CODE_EXPORT_TARGETS.Legacy,
      selections: [selection],
      currentLegacyProfileName: "Example - Default",
    })

    expect(output.filename).toBe("kilo-code-settings.json")
    expect(output.downloadPayload).toEqual({
      providerProfiles: {
        currentApiConfigName: "Example - Default",
        apiConfigs: output.copyPayload,
      },
    })
    expect(output.itemCount).toBe(1)
  })

  it.each(["", "   "])(
    "rejects an invalid legacy current profile name: %j",
    (currentLegacyProfileName) => {
      expect(() =>
        buildKiloCodeExportOutput({
          target: KILO_CODE_EXPORT_TARGETS.Legacy,
          selections: [selection],
          currentLegacyProfileName,
        }),
      ).toThrow("Legacy current profile name cannot be blank")
    },
  )
})
