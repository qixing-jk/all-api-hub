import { describe, expect, it } from "vitest"

import {
  DEFAULT_CONTENT_FEATURE_PREFERENCES,
  DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
  resolveContentFeaturePreferences,
} from "~/services/preferences/contentScriptFeatureDefaults"

describe("resolveContentFeaturePreferences", () => {
  it("returns the content listener defaults when preferences are missing", () => {
    expect(resolveContentFeaturePreferences()).toEqual(
      DEFAULT_CONTENT_FEATURE_PREFERENCES,
    )
  })

  it("defaults Web AI API Check automatic and enhanced automatic detection to enabled", () => {
    expect(DEFAULT_WEB_AI_API_CHECK_PREFERENCES.autoDetect.enabled).toBe(true)
    expect(
      DEFAULT_WEB_AI_API_CHECK_PREFERENCES.autoDetect.enhanced.enabled,
    ).toBe(true)
    expect(
      DEFAULT_CONTENT_FEATURE_PREFERENCES.webAiApiCheckDetectionEnabled,
    ).toBe(true)
    expect(
      DEFAULT_CONTENT_FEATURE_PREFERENCES.webAiApiCheckEnhancedDetectionEnabled,
    ).toBe(true)
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
          autoDetect: {
            enabled: true,
            enhanced: { enabled: true },
          },
        },
      }),
    ).toEqual({
      redemptionAssistDetectionEnabled: false,
      redemptionAssistContextMenuEnabled: false,
      webAiApiCheckDetectionEnabled: false,
      webAiApiCheckEnhancedDetectionEnabled: false,
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
          autoDetect: {
            enabled: true,
            enhanced: { enabled: true },
          },
        },
      }),
    ).toEqual({
      redemptionAssistDetectionEnabled: true,
      redemptionAssistContextMenuEnabled: false,
      webAiApiCheckDetectionEnabled: true,
      webAiApiCheckEnhancedDetectionEnabled: true,
      webAiApiCheckContextMenuEnabled: false,
    })
  })

  it("resolves enhanced detection as disabled when automatic detection is disabled", () => {
    expect(
      resolveContentFeaturePreferences({
        webAiApiCheck: {
          enabled: true,
          autoDetect: {
            enabled: false,
            enhanced: { enabled: true },
          },
        },
      }),
    ).toMatchObject({
      webAiApiCheckDetectionEnabled: false,
      webAiApiCheckEnhancedDetectionEnabled: false,
    })
  })

  it("resolves enhanced detection as disabled when the enhanced toggle is off", () => {
    expect(
      resolveContentFeaturePreferences({
        webAiApiCheck: {
          enabled: true,
          autoDetect: {
            enabled: true,
            enhanced: { enabled: false },
          },
        },
      }),
    ).toMatchObject({
      webAiApiCheckDetectionEnabled: true,
      webAiApiCheckEnhancedDetectionEnabled: false,
    })
  })
})
