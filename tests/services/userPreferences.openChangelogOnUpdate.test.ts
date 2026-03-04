import { describe, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"

/**
 * Validates that openChangelogOnUpdate is:
 * - treated as enabled when missing from stored preferences
 * - persisted when updated through the UserPreferencesService helper
 */
describe("userPreferences openChangelogOnUpdate", () => {
  it("treats missing openChangelogOnUpdate as enabled and saves back", async () => {
    const storage = new Storage({ area: "local" })
    const storedWithoutFlag: any = { ...DEFAULT_PREFERENCES }
    delete storedWithoutFlag.openChangelogOnUpdate

    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      storedWithoutFlag,
    )

    const prefs = await userPreferences.getPreferences()
    expect(prefs.openChangelogOnUpdate).toBe(true)

    const storedAfter = await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )
    expect((storedAfter as any)?.openChangelogOnUpdate).toBe(true)
  })

  it("re-enables openChangelogOnUpdate during migration and saves back", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      openChangelogOnUpdate: false,
      preferencesVersion: 13,
    })

    const prefs = await userPreferences.getPreferences()
    expect(prefs.openChangelogOnUpdate).toBe(true)

    const storedAfter = await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )
    expect((storedAfter as any)?.openChangelogOnUpdate).toBe(true)
  })

  it("persists updates via updateOpenChangelogOnUpdate", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      openChangelogOnUpdate: true,
    })

    const success = await userPreferences.updateOpenChangelogOnUpdate(false)
    expect(success).toBe(true)

    const prefs = await userPreferences.getPreferences()
    expect(prefs.openChangelogOnUpdate).toBe(false)
  })
})
