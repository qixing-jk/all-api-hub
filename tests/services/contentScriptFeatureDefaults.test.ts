import { describe, expect, it } from "vitest"

import {
  DEFAULT_CONTENT_FEATURE_PREFERENCES,
  resolveContentFeaturePreferences,
} from "~/services/preferences/contentScriptFeatureDefaults"

describe("resolveContentFeaturePreferences", () => {
  it("returns the content listener defaults when preferences are missing", () => {
    expect(resolveContentFeaturePreferences()).toEqual(
      DEFAULT_CONTENT_FEATURE_PREFERENCES,
    )
  })

  it("forces nested toggles off when a feature master switch is disabled", () => {
    expect(
      resolveContentFeaturePreferences({
        redemptionAssist: {
          enabled: false,
          contextMenu: { enabled: true },
        },
        webAiApiCheck: {
          enabled: false,
          contextMenu: { enabled: true },
          autoDetect: { enabled: true },
        },
      }),
    ).toEqual({
      redemptionAssistDetectionEnabled: false,
      redemptionAssistContextMenuEnabled: false,
      webAiApiCheckDetectionEnabled: false,
      webAiApiCheckContextMenuEnabled: false,
    })
  })

  it("keeps independent listener toggles when the feature stays enabled", () => {
    expect(
      resolveContentFeaturePreferences({
        redemptionAssist: {
          enabled: true,
          contextMenu: { enabled: false },
        },
        webAiApiCheck: {
          enabled: true,
          contextMenu: { enabled: false },
          autoDetect: { enabled: true },
        },
      }),
    ).toEqual({
      redemptionAssistDetectionEnabled: true,
      redemptionAssistContextMenuEnabled: false,
      webAiApiCheckDetectionEnabled: true,
      webAiApiCheckContextMenuEnabled: false,
    })
  })
})
