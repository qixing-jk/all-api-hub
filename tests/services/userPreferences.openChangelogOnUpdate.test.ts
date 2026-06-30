import { describe, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { CURRENT_PREFERENCES_VERSION } from "~/services/preferences/migrations/preferencesMigration"
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
  it("treats missing openChangelogOnUpdate as enabled without saving back", async () => {
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
    expect((storedAfter as any)?.openChangelogOnUpdate).toBeUndefined()
  })

  it("re-enables openChangelogOnUpdate during migration without saving back", async () => {
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
    expect((storedAfter as any)?.openChangelogOnUpdate).toBe(false)
  })

  it("keeps an explicit disabled value for current-version preferences", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      openChangelogOnUpdate: false,
      preferencesVersion: CURRENT_PREFERENCES_VERSION,
    })

    const prefs = await userPreferences.getPreferences()
    expect(prefs.openChangelogOnUpdate).toBe(false)
  })

  it("persists updates via updateOpenChangelogOnUpdate", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      openChangelogOnUpdate: true,
    })

    const writeResult = await userPreferences.updateOpenChangelogOnUpdate(false)
    expect(writeResult.ok).toBe(true)

    const prefs = await userPreferences.getPreferences()
    expect(prefs.openChangelogOnUpdate).toBe(false)
  })

  it("creates stored preferences when updating openChangelogOnUpdate with no existing preferences", async () => {
    const storage = new Storage({ area: "local" })
    await storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)

    const writeResult = await userPreferences.updateOpenChangelogOnUpdate(false)
    expect(writeResult.ok).toBe(true)

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter?.openChangelogOnUpdate).toBe(false)
    expect(storedAfter?.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
    expect(typeof storedAfter?.lastUpdated).toBe("number")
  })
})
