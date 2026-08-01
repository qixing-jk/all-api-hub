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

  it("keeps stored v26 preferences unchanged until a normal save writes v27", async () => {
    const legacyTimestamp = 123457
    const storedPreferences = {
      ...DEFAULT_PREFERENCES,
      preferencesVersion: 26,
      lastUpdated: legacyTimestamp,
      sharedPreferencesLastUpdated: legacyTimestamp,
      tempWindowFallback: {
        enabled: true,
        useInPopup: true,
        useInSidePanel: true,
        useInOptions: true,
        useForAutoRefresh: false,
        useForManualRefresh: true,
        tempContextMode: "composite",
      },
    } as any
    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      storedPreferences,
    )

    const preferences = await userPreferences.getPreferencesStrict()
    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any

    expect(preferences.preferencesVersion).toBe(27)
    expect(preferences.lastUpdated).toBe(legacyTimestamp)
    expect(preferences.sharedPreferencesLastUpdated).toBe(legacyTimestamp)
    expect(preferences.tempWindowFallback).not.toHaveProperty(
      "useForAutoRefresh",
    )
    expect(preferences.tempWindowFallback).toMatchObject({
      automaticFeatureBypass: {
        account_refresh: false,
      },
    })
    expect(storedAfter).toEqual(storedPreferences)

    vi.setSystemTime(legacyTimestamp + 1)
    const saveResult = await userPreferences.savePreferences({
      themeMode: "dark",
    })
    const storedAfterSave = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any

    expect(saveResult).toMatchObject({ ok: true })
    expect(storedAfterSave.preferencesVersion).toBe(27)
    expect(storedAfterSave.lastUpdated).toBe(legacyTimestamp + 1)
    expect(storedAfterSave.tempWindowFallback).not.toHaveProperty(
      "useForAutoRefresh",
    )
    expect(
      storedAfterSave.tempWindowFallback.automaticFeatureBypass.account_refresh,
    ).toBe(false)
  })

  it("does not acquire the write lock or write storage during public reads", async () => {
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      preferencesVersion: 26,
    } as any)
    const storageSetSpy = vi.spyOn((userPreferences as any).storage, "set")
    const storageWriteLockSpy = vi.spyOn(
      userPreferences as any,
      "withStorageWriteLock",
    )
    storageSetSpy.mockClear()

    try {
      await expect(userPreferences.getPreferences()).resolves.toMatchObject({
        preferencesVersion: CURRENT_PREFERENCES_VERSION,
      })
      await expect(
        userPreferences.getPreferencesStrict(),
      ).resolves.toMatchObject({
        preferencesVersion: CURRENT_PREFERENCES_VERSION,
      })
      expect(storageWriteLockSpy).not.toHaveBeenCalled()
      expect(storageSetSpy).not.toHaveBeenCalled()
    } finally {
      storageWriteLockSpy.mockRestore()
      storageSetSpy.mockRestore()
    }
  })

  it("writes only the final canonical import when preserving WebDAV from local v26 preferences", async () => {
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      preferencesVersion: 26,
      lastUpdated: 100,
      sharedPreferencesLastUpdated: 100,
      tempWindowFallback: {
        enabled: true,
        useForAutoRefresh: false,
        tempContextMode: "composite",
      },
    } as any)
    const storageSetSpy = vi.spyOn((userPreferences as any).storage, "set")
    storageSetSpy.mockClear()

    try {
      const result = await userPreferences.importPreferences(
        {
          ...DEFAULT_PREFERENCES,
          preferencesVersion: 26,
          tempWindowFallback: {
            enabled: false,
            useForAutoRefresh: true,
            tempContextMode: "tab",
          },
        } as any,
        { preserveWebdav: true },
      )

      expect(result).toMatchObject({ ok: true })
      expect(storageSetSpy).toHaveBeenCalledTimes(1)
      const storedAfter = (await storage.get(
        USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      )) as any
      expect(storedAfter.preferencesVersion).toBe(27)
      expect(storedAfter.tempWindowFallback).toEqual({
        enabled: false,
        automaticFeatureBypass: {
          account_refresh: true,
          balance_history: true,
          checkin: true,
          redemption_assist: true,
          ldoh_site_lookup: true,
          key_management: true,
          managed_site_channels: true,
          managed_site_model_sync: true,
        },
        tempContextMode: "tab",
      })
    } finally {
      storageSetSpy.mockRestore()
    }
  })

  it("canonicalizes malformed current-version manual imports in one final write", async () => {
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      lastUpdated: 100,
      sharedPreferencesLastUpdated: 100,
    })
    const storageSetSpy = vi.spyOn((userPreferences as any).storage, "set")
    storageSetSpy.mockClear()

    try {
      const result = await userPreferences.importPreferences({
        ...DEFAULT_PREFERENCES,
        preferencesVersion: CURRENT_PREFERENCES_VERSION,
        tempWindowFallback: {
          enabled: false,
          automaticFeatureBypass: {
            account_refresh: true,
            balance_history: "invalid",
            checkin: false,
          },
          useForAutoRefresh: false,
          useInPopup: true,
          tempContextMode: "tab",
        },
      } as any)

      expect(result).toMatchObject({ ok: true })
      expect(storageSetSpy).toHaveBeenCalledTimes(1)
      const storedAfter = (await storage.get(
        USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      )) as any
      const exported = await userPreferences.exportPreferences()
      expect(storageSetSpy).toHaveBeenCalledTimes(1)
      expect(storedAfter.tempWindowFallback).toEqual({
        enabled: false,
        automaticFeatureBypass: {
          account_refresh: true,
          balance_history: true,
          checkin: false,
          redemption_assist: true,
          ldoh_site_lookup: true,
          key_management: true,
          managed_site_channels: true,
          managed_site_model_sync: true,
        },
        tempContextMode: "tab",
      })
      expect(exported.tempWindowFallback).toEqual(
        storedAfter.tempWindowFallback,
      )
      expect(storedAfter.tempWindowFallback).not.toHaveProperty(
        "useForAutoRefresh",
      )
      expect(storedAfter.tempWindowFallback).not.toHaveProperty("useInPopup")
    } finally {
      storageSetSpy.mockRestore()
    }
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

    const result = await userPreferences.savePreferences({
      accountAutoRefresh: {
        interval: DEFAULT_PREFERENCES.accountAutoRefresh.interval + 60,
      },
    })

    expect(result).toMatchObject({ ok: true })

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

    const result = await userPreferences.savePreferences({
      accountAutoRefresh: {
        enabled: false,
      },
    })

    expect(result).toMatchObject({ ok: true })

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

    const result = await userPreferences.savePreferences({
      themeMode: "dark",
    })

    expect(result).toMatchObject({ ok: true })

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

    const result = await userPreferences.savePreferences({
      themeMode: "dark",
      accountAutoRefresh: {
        enabled: false,
      },
    })

    expect(result).toMatchObject({ ok: true })

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.lastUpdated).toBe(mixedUpdateTimestamp)
    expect(storedAfter.sharedPreferencesLastUpdated).toBe(mixedUpdateTimestamp)
  })

  it("returns a typed stale result for guarded saves after a newer write wins", async () => {
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
    const newerWriteResult = await userPreferences.savePreferences({
      activeTab: DATA_TYPE_CASHFLOW,
    })

    expect(newerWriteResult).toMatchObject({
      ok: true,
      preferences: {
        activeTab: DATA_TYPE_CASHFLOW,
        lastUpdated: newerUpdateTimestamp,
      },
    })

    vi.setSystemTime(staleAttemptTimestamp)
    const staleWriteResult = await userPreferences.savePreferences(
      {
        activeTab: DATA_TYPE_BALANCE,
      },
      {
        expectedLastUpdated: initialTimestamp,
      },
    )

    expect(staleWriteResult).toEqual({
      ok: false,
      reason: {
        type: "stale",
        expectedLastUpdated: initialTimestamp,
        actualLastUpdated: newerUpdateTimestamp,
      },
    })

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.lastUpdated).toBe(newerUpdateTimestamp)
    expect(storedAfter.activeTab).toBe(DATA_TYPE_CASHFLOW)
  })

  it("returns typed storage failures from preference writes", async () => {
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
      const writeResult = await userPreferences.savePreferences({
        themeMode: "dark",
      })

      expect(writeResult).toMatchObject({
        ok: false,
        reason: {
          type: "storage-error",
          error: expect.any(Error),
        },
      })

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

    const result = await userPreferences.importPreferences({
      ...DEFAULT_PREFERENCES,
      themeMode: "dark",
      lastUpdated: backupTimestamp,
      sharedPreferencesLastUpdated: backupTimestamp,
    })

    expect(result).toMatchObject({ ok: true })

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

    const result = await userPreferences.importPreferences(
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

    expect(result).toMatchObject({ ok: true })

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

    const result = await userPreferences.importPreferences(
      legacyImportedPreferences,
      {
        preserveWebdav: true,
      },
    )

    expect(result).toMatchObject({ ok: true })

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.themeMode).toBe("dark")
    expect(storedAfter.lastUpdated).toBe(importedAt)
    expect(storedAfter.sharedPreferencesLastUpdated).toBe(importedAt)
  })
})
