import { describe, expect, it, vi } from "vitest"

import {
  createDeeplinkExportMenuActions,
  createProfileDeeplinkExportRequest,
  DEEPLINK_EXPORT_TARGETS,
} from "~/components/DeeplinkExportDialog"
import type { CredentialExportSource } from "~/services/integrations/credentialExport"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

const exportSource: CredentialExportSource = {
  id: "key-1",
  providerId: "acc-1",
  providerName: "Example",
  credentialName: "Default",
  baseUrl: "https://x.test",
  cacheKey: "cache-1",
  resolveApiKey: async () => "sk-test",
}

const baseContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
  surfaceId:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

describe("createProfileDeeplinkExportRequest", () => {
  it("tags every destination with its own profile-export action id", () => {
    const ccSwitch = createProfileDeeplinkExportRequest({
      target: DEEPLINK_EXPORT_TARGETS.CCSwitch,
      source: exportSource,
      baseContext,
    })
    const aiToolbox = createProfileDeeplinkExportRequest({
      target: DEEPLINK_EXPORT_TARGETS.AiToolbox,
      source: exportSource,
      baseContext,
    })

    expect(ccSwitch).toEqual({
      target: DEEPLINK_EXPORT_TARGETS.CCSwitch,
      source: exportSource,
      analyticsContext: {
        ...baseContext,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToCCSwitch,
      },
    })
    expect(aiToolbox).toEqual({
      target: DEEPLINK_EXPORT_TARGETS.AiToolbox,
      source: exportSource,
      analyticsContext: {
        ...baseContext,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToAiToolbox,
      },
    })
    expect(aiToolbox.analyticsContext?.actionId).not.toBe(
      ccSwitch.analyticsContext?.actionId,
    )
  })
})

describe("createDeeplinkExportMenuActions", () => {
  it("creates a menu entry for every deeplink destination", () => {
    const onSelect = vi.fn()
    const actions = createDeeplinkExportMenuActions({
      testIds: {
        [DEEPLINK_EXPORT_TARGETS.CCSwitch]: "cc-switch-test-id",
        [DEEPLINK_EXPORT_TARGETS.AiToolbox]: "ai-toolbox-test-id",
      },
      onSelect,
    })

    expect(actions[DEEPLINK_EXPORT_TARGETS.CCSwitch]?.testId).toBe(
      "cc-switch-test-id",
    )
    expect(actions[DEEPLINK_EXPORT_TARGETS.AiToolbox]?.testId).toBe(
      "ai-toolbox-test-id",
    )

    actions[DEEPLINK_EXPORT_TARGETS.AiToolbox]?.onSelect()
    expect(onSelect).toHaveBeenCalledWith(DEEPLINK_EXPORT_TARGETS.AiToolbox)

    actions[DEEPLINK_EXPORT_TARGETS.CCSwitch]?.onSelect()
    expect(onSelect).toHaveBeenCalledWith(DEEPLINK_EXPORT_TARGETS.CCSwitch)
    expect(onSelect).toHaveBeenCalledTimes(2)
  })
})
