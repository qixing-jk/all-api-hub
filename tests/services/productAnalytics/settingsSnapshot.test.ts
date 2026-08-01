import { describe, expect, it } from "vitest"

import {
  DEFAULT_PREFERENCES,
  type TempWindowFallbackPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import {
  SETTINGS_SNAPSHOT_INTERVAL_MS,
  shouldSendSettingsSnapshot,
} from "~/services/productAnalytics/settingsSnapshot"

describe("settings snapshot analytics", () => {
  it("names the master setting as automatic protection-bypass enablement", async () => {
    const source = await import("~/services/productAnalytics/settings")
    const snapshot = source.buildAggregateSettingsSnapshotEvent(
      {
        ...DEFAULT_PREFERENCES,
        tempWindowFallback: {
          ...(DEFAULT_PREFERENCES.tempWindowFallback as TempWindowFallbackPreferences),
          enabled: false,
        },
      } as UserPreferences,
      "background",
    )

    expect(snapshot).toEqual(
      expect.objectContaining({
        temp_window_fallback_automatic_bypass_enabled: false,
      }),
    )
    expect(snapshot).not.toHaveProperty("temp_window_fallback_enabled")
  })

  it("decides whether the three-day settings snapshot interval has elapsed", () => {
    const now = Date.parse("2026-05-12T00:00:00.000Z")

    expect(shouldSendSettingsSnapshot(undefined, now)).toBe(true)
    expect(shouldSendSettingsSnapshot(now, now)).toBe(false)
    expect(
      shouldSendSettingsSnapshot(now - SETTINGS_SNAPSHOT_INTERVAL_MS + 1, now),
    ).toBe(false)
    expect(
      shouldSendSettingsSnapshot(now - SETTINGS_SNAPSHOT_INTERVAL_MS, now),
    ).toBe(true)
    expect(shouldSendSettingsSnapshot(now - 3 * 24 * 60 * 60 * 1000, now)).toBe(
      true,
    )
  })
})
