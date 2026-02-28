import { describe, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/userPreferences"

/**
 * Validates that autoProvisionKeyOnAccountAdd is:
 * - treated as disabled when missing from stored preferences
 * - persisted when updated through the UserPreferencesService helper
 */
describe("userPreferences autoProvisionKeyOnAccountAdd", () => {
  it("treats missing autoProvisionKeyOnAccountAdd as disabled and saves back", async () => {
    const storage = new Storage({ area: "local" })
    const storedWithoutFlag: any = { ...DEFAULT_PREFERENCES }
    delete storedWithoutFlag.autoProvisionKeyOnAccountAdd

    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      storedWithoutFlag,
    )

    const prefs = await userPreferences.getPreferences()
    expect(prefs.autoProvisionKeyOnAccountAdd).toBe(false)

    const storedAfter = await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )
    expect((storedAfter as any)?.autoProvisionKeyOnAccountAdd).toBe(false)
  })

  it("persists updates via updateAutoProvisionKeyOnAccountAdd", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: true,
    })

    const success =
      await userPreferences.updateAutoProvisionKeyOnAccountAdd(false)
    expect(success).toBe(true)

    const prefs = await userPreferences.getPreferences()
    expect(prefs.autoProvisionKeyOnAccountAdd).toBe(false)
  })
})
