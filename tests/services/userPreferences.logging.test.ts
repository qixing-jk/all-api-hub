import { describe, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"

/**
 * Validates that logging preferences are:
 * - merged in when missing from stored user preferences
 * - persisted when updated via the userPreferences service helpers
 */

describe("userPreferences logging preferences", () => {
  it("merges logging defaults and saves back when missing from storage", async () => {
    const storage = new Storage({ area: "local" })
    const storedWithoutLogging: any = { ...DEFAULT_PREFERENCES }
    delete storedWithoutLogging.logging

    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      storedWithoutLogging,
    )

    const prefs = await userPreferences.getPreferences()
    expect(prefs.logging).toEqual(DEFAULT_PREFERENCES.logging)

    const storedAfter = await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )
    expect((storedAfter as any)?.logging).toEqual(prefs.logging)
  })

  it("persists updates to logging preferences via updateLoggingPreferences", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      logging: { consoleEnabled: true, level: "info" },
    })

    const success = await userPreferences.updateLoggingPreferences({
      level: "error",
    })
    expect(success).toBe(true)

    const logging = await userPreferences.getLoggingPreferences()
    expect(logging.consoleEnabled).toBe(true)
    expect(logging.level).toBe("error")

    const storedAfter = await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )
    expect((storedAfter as any)?.logging).toEqual(logging)
  })
})
