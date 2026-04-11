import { describe, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"

describe("userPreferences autoFillCurrentSiteUrlOnAccountAdd", () => {
  it("treats missing autoFillCurrentSiteUrlOnAccountAdd as disabled without saving back", async () => {
    const storage = new Storage({ area: "local" })
    const storedWithoutFlag: any = { ...DEFAULT_PREFERENCES }
    delete storedWithoutFlag.autoFillCurrentSiteUrlOnAccountAdd

    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      storedWithoutFlag,
    )

    const prefs = await userPreferences.getPreferences()
    expect(prefs.autoFillCurrentSiteUrlOnAccountAdd).toBe(false)

    const storedAfter = await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )
    expect((storedAfter as any)?.autoFillCurrentSiteUrlOnAccountAdd).toBe(
      undefined,
    )
  })

  it("persists updates via updateAutoFillCurrentSiteUrlOnAccountAdd", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      autoFillCurrentSiteUrlOnAccountAdd: false,
    })

    const success =
      await userPreferences.updateAutoFillCurrentSiteUrlOnAccountAdd(true)
    expect(success).toBe(true)

    const prefs = await userPreferences.getPreferences()
    expect(prefs.autoFillCurrentSiteUrlOnAccountAdd).toBe(true)
  })
})
