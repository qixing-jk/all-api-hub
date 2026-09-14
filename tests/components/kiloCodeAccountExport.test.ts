import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  resolveKiloCodeAccountExportOutput,
  type KiloCodeAccountLegacySelection,
} from "~/components/kiloCodeAccountExport"
import {
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeV7ProviderSelection,
} from "~/services/integrations/kiloCodeExport"

const buildKiloCodeExportOutputMock = vi.hoisted(() => vi.fn())

vi.mock("~/services/integrations/kiloCodeExportPolicy", () => ({
  buildKiloCodeExportOutput: (...args: unknown[]) =>
    buildKiloCodeExportOutputMock(...args),
}))

const source = {
  id: "account-a:7",
  providerId: "account-a",
  providerName: "Account",
  credentialName: "Key",
  baseUrl: "https://api.example.invalid",
  cacheKey: "cache",
}

describe("resolveKiloCodeAccountExportOutput", () => {
  beforeEach(() => {
    buildKiloCodeExportOutputMock.mockReset()
    buildKiloCodeExportOutputMock.mockReturnValue({ target: "test-output" })
  })

  it("preserves canonical V7 selection facts verbatim while replacing only tokenKey", async () => {
    const discoveredModelIds = ["z-model", " model/already-canonical "]
    const selection: KiloCodeV7ProviderSelection = {
      accountId: "account-a",
      siteName: "Prepared site",
      baseUrl: "https://api.example.invalid",
      tokenId: 7,
      tokenName: "Prepared token",
      tokenKey: "masked-key",
      selectionId: "opaque-selection-id",
      providerName: "Prepared provider (disambiguated)",
      discoveredModelIds,
      manualModelId: " manual/already-canonical ",
    }
    const resolveApiKey = vi.fn().mockResolvedValue("resolved-secret")

    await resolveKiloCodeAccountExportOutput({
      target: KILO_CODE_EXPORT_TARGETS.KiloV7,
      selections: [selection],
      secretSourcesBySelectionId: new Map([
        [selection.selectionId, { ...source, resolveApiKey }],
      ]),
      defaultModel: {
        selectionId: selection.selectionId,
        modelId: "model/already-canonical",
      },
    })

    expect(resolveApiKey).toHaveBeenCalledTimes(1)
    expect(resolveApiKey).toHaveBeenCalledWith()
    expect(buildKiloCodeExportOutputMock).toHaveBeenCalledWith({
      target: KILO_CODE_EXPORT_TARGETS.KiloV7,
      selections: [{ ...selection, tokenKey: "resolved-secret" }],
      defaultModel: {
        selectionId: selection.selectionId,
        modelId: "model/already-canonical",
      },
    })
    const resolvedSelection = buildKiloCodeExportOutputMock.mock.calls[0]?.[0]
      ?.selections[0] as KiloCodeV7ProviderSelection
    expect(resolvedSelection.discoveredModelIds).toBe(discoveredModelIds)
    expect(resolvedSelection.manualModelId).toBe(selection.manualModelId)
  })

  it("preserves canonical legacy facts while resolving each selection exactly once", async () => {
    const selection: KiloCodeAccountLegacySelection = {
      accountId: "account-a",
      siteName: "Prepared site",
      baseUrl: "https://api.example.invalid",
      tokenId: 7,
      tokenName: "Prepared token",
      tokenKey: "masked-key",
      selectionId: "opaque-selection-id",
      legacyModelId: " legacy/already-canonical ",
    }
    const resolveApiKey = vi.fn().mockResolvedValue("resolved-secret")

    await resolveKiloCodeAccountExportOutput({
      target: KILO_CODE_EXPORT_TARGETS.Legacy,
      selections: [selection],
      secretSourcesBySelectionId: new Map([
        [selection.selectionId, { ...source, resolveApiKey }],
      ]),
      currentLegacyProfileName: "Prepared site - Prepared token",
    })

    expect(resolveApiKey).toHaveBeenCalledTimes(1)
    expect(buildKiloCodeExportOutputMock).toHaveBeenCalledWith({
      target: KILO_CODE_EXPORT_TARGETS.Legacy,
      selections: [{ ...selection, tokenKey: "resolved-secret" }],
      currentLegacyProfileName: "Prepared site - Prepared token",
    })
  })

  it("rejects an export when its transient secret source is unavailable", async () => {
    const selection: KiloCodeV7ProviderSelection = {
      accountId: "account-a",
      siteName: "Example",
      baseUrl: "https://api.example.invalid",
      tokenId: 7,
      tokenName: "Default",
      tokenKey: "masked-key",
      selectionId: "missing-source",
      providerName: "Example - Default",
      discoveredModelIds: ["example-model"],
    }

    await expect(
      resolveKiloCodeAccountExportOutput({
        target: KILO_CODE_EXPORT_TARGETS.KiloV7,
        selections: [selection],
        secretSourcesBySelectionId: new Map(),
        defaultModel: {
          selectionId: selection.selectionId,
          modelId: "example-model",
        },
      }),
    ).rejects.toThrow("Kilo Code export selection source is unavailable")
    expect(buildKiloCodeExportOutputMock).not.toHaveBeenCalled()
  })
})
