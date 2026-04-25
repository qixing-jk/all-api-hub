import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { DATA_TYPE_BALANCE, DATA_TYPE_CASHFLOW } from "~/constants"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { CURRENT_PREFERENCES_VERSION } from "~/services/preferences/migrations/preferencesMigration"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"

describe("userPreferences shared preference timestamps", () => {
  const storage = new Storage({ area: "local" })

  beforeEach(async () => {
    vi.useFakeTimers()
    await storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)
  })

  it("backfills missing sharedPreferencesLastUpdated from lastUpdated without mutating storage", async () => {
    const legacyTimestamp = 123456
    const storedPreferences: any = {
      ...DEFAULT_PREFERENCES,
      lastUpdated: legacyTimestamp,
      preferencesVersion: CURRENT_PREFERENCES_VERSION,
    }
    delete storedPreferences.sharedPreferencesLastUpdated

    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      storedPreferences,
    )

    const preferences = await userPreferences.getPreferences()
    expect(preferences.sharedPreferencesLastUpdated).toBe(legacyTimestamp)

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.sharedPreferencesLastUpdated).toBeUndefined()
  })

  it("returns neutral timestamps when preferences are missing", async () => {
    vi.setSystemTime(13000)

    const preferences = await userPreferences.getPreferences()

    expect(preferences.lastUpdated).toBe(0)
    expect(preferences.sharedPreferencesLastUpdated).toBe(0)

    const storedAfter = await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )
    expect(storedAfter).toBeUndefined()
  })

  it("keeps sharedPreferencesLastUpdated unchanged for local-only preference updates", async () => {
    const initialTimestamp = 1000
    const localOnlyUpdateTimestamp = 2000

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      lastUpdated: initialTimestamp,
      sharedPreferencesLastUpdated: initialTimestamp,
    })

    vi.setSystemTime(localOnlyUpdateTimestamp)

    const success = await userPreferences.savePreferences({
      accountAutoRefresh: {
        interval: DEFAULT_PREFERENCES.accountAutoRefresh.interval + 60,
      },
    })

    expect(success).toBe(true)

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.lastUpdated).toBe(localOnlyUpdateTimestamp)
    expect(storedAfter.sharedPreferencesLastUpdated).toBe(initialTimestamp)
  })

  it("persists backfilled sharedPreferencesLastUpdated through the locked save path", async () => {
    const legacyTimestamp = 14000
    const localOnlyUpdateTimestamp = 15000
    const storedPreferences: any = {
      ...DEFAULT_PREFERENCES,
      lastUpdated: legacyTimestamp,
      preferencesVersion: CURRENT_PREFERENCES_VERSION,
    }
    delete storedPreferences.sharedPreferencesLastUpdated

    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      storedPreferences,
    )

    vi.setSystemTime(localOnlyUpdateTimestamp)

    const success = await userPreferences.savePreferences({
      accountAutoRefresh: {
        enabled: false,
      },
    })

    expect(success).toBe(true)

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.lastUpdated).toBe(localOnlyUpdateTimestamp)
    expect(storedAfter.sharedPreferencesLastUpdated).toBe(legacyTimestamp)
  })

  it("updates sharedPreferencesLastUpdated for shared preference updates", async () => {
    const initialTimestamp = 3000
    const sharedUpdateTimestamp = 4000

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      lastUpdated: initialTimestamp,
      sharedPreferencesLastUpdated: initialTimestamp,
    })

    vi.setSystemTime(sharedUpdateTimestamp)

    const success = await userPreferences.savePreferences({
      themeMode: "dark",
    })

    expect(success).toBe(true)

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.lastUpdated).toBe(sharedUpdateTimestamp)
    expect(storedAfter.sharedPreferencesLastUpdated).toBe(sharedUpdateTimestamp)
  })

  it("updates sharedPreferencesLastUpdated for mixed shared and local-only updates", async () => {
    const initialTimestamp = 5000
    const mixedUpdateTimestamp = 6000

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      lastUpdated: initialTimestamp,
      sharedPreferencesLastUpdated: initialTimestamp,
    })

    vi.setSystemTime(mixedUpdateTimestamp)

    const success = await userPreferences.savePreferences({
      themeMode: "dark",
      accountAutoRefresh: {
        enabled: false,
      },
    })

    expect(success).toBe(true)

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.lastUpdated).toBe(mixedUpdateTimestamp)
    expect(storedAfter.sharedPreferencesLastUpdated).toBe(mixedUpdateTimestamp)
  })

  it("skips stale guarded saves after a newer write wins", async () => {
    const initialTimestamp = 6100
    const newerUpdateTimestamp = 6200
    const staleAttemptTimestamp = 6300

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      activeTab: DATA_TYPE_BALANCE,
      lastUpdated: initialTimestamp,
      sharedPreferencesLastUpdated: initialTimestamp,
    })

    vi.setSystemTime(newerUpdateTimestamp)
    const newerWriteSuccess = await userPreferences.savePreferences({
      activeTab: DATA_TYPE_CASHFLOW,
    })

    expect(newerWriteSuccess).toBe(true)

    vi.setSystemTime(staleAttemptTimestamp)
    const staleWriteSuccess = await userPreferences.savePreferences(
      {
        activeTab: DATA_TYPE_BALANCE,
      },
      {
        expectedLastUpdated: initialTimestamp,
      },
    )

    expect(staleWriteSuccess).toBe(false)

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.lastUpdated).toBe(newerUpdateTimestamp)
    expect(storedAfter.activeTab).toBe(DATA_TYPE_CASHFLOW)
  })

  it("rethrows storage failures from savePreferencesWithResult and keeps savePreferences as a safe boolean wrapper", async () => {
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      themeMode: "system",
      lastUpdated: 7100,
      sharedPreferencesLastUpdated: 7100,
    })

    const storageSetSpy = vi
      .spyOn((userPreferences as any).storage, "set")
      .mockRejectedValue(new Error("save failed"))

    try {
      await expect(
        userPreferences.savePreferencesWithResult({
          themeMode: "dark",
        }),
      ).rejects.toThrow("save failed")

      await expect(
        userPreferences.savePreferences({
          themeMode: "dark",
        }),
      ).resolves.toBe(false)

      const storedAfter = (await storage.get(
        USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      )) as any
      expect(storedAfter.themeMode).toBe("system")
      expect(storedAfter.lastUpdated).toBe(7100)
    } finally {
      storageSetSpy.mockRestore()
    }
  })

  it("refreshes sharedPreferencesLastUpdated for manual imports", async () => {
    const backupTimestamp = 7000
    const importedAt = 8000

    vi.setSystemTime(importedAt)

    const success = await userPreferences.importPreferences({
      ...DEFAULT_PREFERENCES,
      themeMode: "dark",
      lastUpdated: backupTimestamp,
      sharedPreferencesLastUpdated: backupTimestamp,
    })

    expect(success).toBe(true)

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.themeMode).toBe("dark")
    expect(storedAfter.lastUpdated).toBe(importedAt)
    expect(storedAfter.sharedPreferencesLastUpdated).toBe(importedAt)
  })

  it("preserves imported shared timestamp for WebDAV-originated imports", async () => {
    const localTimestamp = 9000
    const importedAt = 10000
    const remoteSharedTimestamp = 9500

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      lastUpdated: localTimestamp,
      sharedPreferencesLastUpdated: localTimestamp,
      accountAutoRefresh: {
        ...DEFAULT_PREFERENCES.accountAutoRefresh,
        interval: DEFAULT_PREFERENCES.accountAutoRefresh.interval + 60,
      },
      webdav: {
        ...DEFAULT_PREFERENCES.webdav,
        syncData: {
          ...DEFAULT_PREFERENCES.webdav.syncData,
          accounts: false,
        },
      },
    })

    vi.setSystemTime(importedAt)

    const success = await userPreferences.importPreferences(
      {
        ...DEFAULT_PREFERENCES,
        themeMode: "dark",
        lastUpdated: remoteSharedTimestamp,
        sharedPreferencesLastUpdated: remoteSharedTimestamp,
        accountAutoRefresh: {
          ...DEFAULT_PREFERENCES.accountAutoRefresh,
          interval: DEFAULT_PREFERENCES.accountAutoRefresh.interval + 300,
        },
        webdav: {
          ...DEFAULT_PREFERENCES.webdav,
          syncData: {
            ...DEFAULT_PREFERENCES.webdav.syncData,
            accounts: true,
          },
        },
      },
      {
        preserveWebdav: true,
      },
    )

    expect(success).toBe(true)

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.themeMode).toBe("dark")
    expect(storedAfter.lastUpdated).toBe(importedAt)
    expect(storedAfter.sharedPreferencesLastUpdated).toBe(remoteSharedTimestamp)
    expect(storedAfter.accountAutoRefresh.interval).toBe(
      DEFAULT_PREFERENCES.accountAutoRefresh.interval + 60,
    )
    expect(storedAfter.webdav.syncData.accounts).toBe(false)
  })

  it("falls back to import time for legacy WebDAV imports without timestamps", async () => {
    const localTimestamp = 11000
    const importedAt = 12000

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      lastUpdated: localTimestamp,
      sharedPreferencesLastUpdated: localTimestamp,
    })

    vi.setSystemTime(importedAt)

    const legacyImportedPreferences: any = {
      ...DEFAULT_PREFERENCES,
      themeMode: "dark",
    }
    delete legacyImportedPreferences.lastUpdated
    delete legacyImportedPreferences.sharedPreferencesLastUpdated

    const success = await userPreferences.importPreferences(
      legacyImportedPreferences,
      {
        preserveWebdav: true,
      },
    )

    expect(success).toBe(true)

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.themeMode).toBe("dark")
    expect(storedAfter.lastUpdated).toBe(importedAt)
    expect(storedAfter.sharedPreferencesLastUpdated).toBe(importedAt)
  })
})
