import { describe, expect, it } from "vitest"

import {
  SETTINGS_SNAPSHOT_INTERVAL_MS,
  shouldSendSettingsSnapshot,
} from "~/services/productAnalytics/settingsSnapshot"

describe("settings snapshot analytics", () => {
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
