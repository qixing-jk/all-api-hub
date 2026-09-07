import { describe, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"

/**
 * Validates that autoProvisionKeyOnAccountAdd is:
 * - treated as disabled when missing from stored preferences
 * - persisted when updated through the UserPreferencesService helper
 */
describe("userPreferences autoProvisionKeyOnAccountAdd", () => {
  it("keeps legacy preferences on default-key creation without writing a migration", async () => {
    const storage = new Storage({ area: "local" })
    const stored = { ...DEFAULT_PREFERENCES }
    delete (stored as Partial<typeof stored>).autoProvisionKeyOnAccountAddMode
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, stored)

    expect(
      (await userPreferences.getPreferences()).autoProvisionKeyOnAccountAddMode,
    ).toBe("default")
    expect(
      await storage.get(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES),
    ).not.toHaveProperty("autoProvisionKeyOnAccountAddMode")
  })

  it("persists the all-groups mode independently of the enable switch", async () => {
    await userPreferences.savePreferences({
      autoProvisionKeyOnAccountAdd: false,
    })

    const result =
      await userPreferences.updateAutoProvisionKeyOnAccountAddMode("all-groups")

    expect(result.ok).toBe(true)
    expect(await userPreferences.getPreferences()).toMatchObject({
      autoProvisionKeyOnAccountAdd: false,
      autoProvisionKeyOnAccountAddMode: "all-groups",
    })
  })

  it("normalizes unrecognized imported provisioning modes to default-key creation", async () => {
    const storage = new Storage({ area: "local" })
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAddMode: "unrecognized",
    })

    expect(
      (await userPreferences.getPreferences()).autoProvisionKeyOnAccountAddMode,
    ).toBe("default")
  })

  it("treats missing autoProvisionKeyOnAccountAdd as disabled without saving back", async () => {
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
    expect((storedAfter as any)?.autoProvisionKeyOnAccountAdd).toBeUndefined()
  })

  it("persists updates via updateAutoProvisionKeyOnAccountAdd", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: true,
    })

    const result =
      await userPreferences.updateAutoProvisionKeyOnAccountAdd(false)
    expect(result.ok).toBe(true)

    const prefs = await userPreferences.getPreferences()
    expect(prefs.autoProvisionKeyOnAccountAdd).toBe(false)
  })
})
