import { describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { DATA_TYPE_BALANCE, DATA_TYPE_CASHFLOW } from "~/constants"
import {
  TEMP_CONTEXT_MODES,
  TEMP_CONTEXT_PREFERENCE_MODES,
} from "~/constants/tempContextMode"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { normalizeTempWindowFallbackPreferences } from "~/services/preferences/tempWindowFallbackPreferences"
import {
  createDefaultPreferences,
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import { DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES } from "~/types/siteAnnouncements"

describe("userPreferences", () => {
  describe("DEFAULT_PREFERENCES", () => {
    it("has correct default values", () => {
      expect(DEFAULT_PREFERENCES.currencyType).toBe("USD")
      expect(DEFAULT_PREFERENCES.activeTab).toBe(DATA_TYPE_CASHFLOW)
      expect(DEFAULT_PREFERENCES.sortField).toBe(DATA_TYPE_BALANCE)
      expect(DEFAULT_PREFERENCES.sortOrder).toBe("desc")
      expect(DEFAULT_PREFERENCES.showTodayCashflow).toBe(true)
      expect(DEFAULT_PREFERENCES.showHealthStatus).toBe(true)
      expect(DEFAULT_PREFERENCES.themeMode).toBe("system")
      expect(DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd).toBe(false)
      expect(DEFAULT_PREFERENCES.autoFillCurrentSiteUrlOnAccountAdd).toBe(true)
      expect(DEFAULT_PREFERENCES.autoCheckin?.pretriggerDailyOnUiOpen).toBe(
        true,
      )
      expect(DEFAULT_PREFERENCES.autoCheckin?.retryStrategy).toEqual({
        enabled: true,
        intervalMinutes: 30,
        maxAttemptsPerDay: 3,
      })
      expect(DEFAULT_PREFERENCES.balanceHistory?.enabled).toBe(true)
      expect(
        DEFAULT_PREFERENCES.balanceHistory?.estimatedTodayIncome.enabled,
      ).toBe(false)
      expect(DEFAULT_PREFERENCES.balanceHistory?.endOfDayCapture.enabled).toBe(
        false,
      )
      expect(DEFAULT_PREFERENCES.balanceHistory?.retentionDays).toBe(365)
      expect(DEFAULT_PREFERENCES.redemptionAssist?.enabled).toBe(true)
      expect(DEFAULT_PREFERENCES.redemptionAssist?.contextMenu.enabled).toBe(
        true,
      )
      expect(DEFAULT_PREFERENCES.redemptionAssist?.relaxedCodeValidation).toBe(
        true,
      )
      expect(DEFAULT_PREFERENCES.redemptionAssist?.urlWhitelist).toBeDefined()
      expect(DEFAULT_PREFERENCES.redemptionAssist?.urlWhitelist.enabled).toBe(
        true,
      )
      expect(
        DEFAULT_PREFERENCES.redemptionAssist?.urlWhitelist
          .includeAccountSiteUrls,
      ).toBe(true)
      expect(
        DEFAULT_PREFERENCES.redemptionAssist?.urlWhitelist
          .includeCheckInAndRedeemUrls,
      ).toBe(true)
      expect(
        DEFAULT_PREFERENCES.redemptionAssist?.urlWhitelist.patterns,
      ).toEqual(["cdk.linux.do"])
      expect(DEFAULT_PREFERENCES.webAiApiCheck?.enabled).toBe(true)
      expect(DEFAULT_PREFERENCES.webAiApiCheck?.contextMenu.enabled).toBe(true)
      expect(DEFAULT_PREFERENCES.tempWindowFallbackReminder?.dismissed).toBe(
        false,
      )
      expect(DEFAULT_PREFERENCES.tempWindowFallback?.tempContextMode).toBe(
        TEMP_CONTEXT_PREFERENCE_MODES.Auto,
      )
    })

    it("creates new preference snapshots with the automatic context-mode preference", () => {
      expect(
        createDefaultPreferences(1).tempWindowFallback?.tempContextMode,
      ).toBe(TEMP_CONTEXT_PREFERENCE_MODES.Auto)
    })

    it("has valid accountAutoRefresh config", () => {
      expect(DEFAULT_PREFERENCES.accountAutoRefresh).toBeDefined()
      expect(DEFAULT_PREFERENCES.accountAutoRefresh).toEqual(
        DEFAULT_ACCOUNT_AUTO_REFRESH,
      )
      expect(DEFAULT_PREFERENCES.accountAutoRefresh.interval).toBeGreaterThan(0)
    })

    it("defaults Web AI API Check automatic and enhanced detection to enabled", () => {
      expect(DEFAULT_PREFERENCES.webAiApiCheck?.autoDetect.enabled).toBe(true)
      expect(
        DEFAULT_PREFERENCES.webAiApiCheck?.autoDetect.enhanced.enabled,
      ).toBe(true)
    })

    it("has valid webdav config", () => {
      expect(DEFAULT_PREFERENCES.webdav).toBeDefined()
      expect(DEFAULT_PREFERENCES.webdav.autoSync).toBe(false)
      expect(DEFAULT_PREFERENCES.sharedPreferencesLastUpdated).toBe(
        DEFAULT_PREFERENCES.lastUpdated,
      )
    })

    it("has valid managedSite config", () => {
      expect(DEFAULT_PREFERENCES.newApi).toBeDefined()
      expect(DEFAULT_PREFERENCES.newApi.baseUrl).toBe("")
      expect(DEFAULT_PREFERENCES.claudeCodeHub).toBeDefined()
      expect(DEFAULT_PREFERENCES.claudeCodeHub!.baseUrl).toBe("")
      expect(DEFAULT_PREFERENCES.claudeCodeHub!.adminToken).toBe("")
    })

    it("creates fresh timestamps for new default snapshots", () => {
      vi.useFakeTimers()

      try {
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
        const firstDefaults = createDefaultPreferences()

        vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"))
        const secondDefaults = createDefaultPreferences()

        expect(firstDefaults.lastUpdated).toBe(
          firstDefaults.sharedPreferencesLastUpdated,
        )
        expect(secondDefaults.lastUpdated).toBe(
          secondDefaults.sharedPreferencesLastUpdated,
        )
        expect(secondDefaults.lastUpdated).toBeGreaterThan(
          firstDefaults.lastUpdated,
        )
      } finally {
        vi.useRealTimers()
      }
    })
  })

  it.each([undefined, false])(
    "backfills convenience defaults while preserving stored %s through unrelated writes",
    async (enabled) => {
      const storage = new Storage({ area: "local" })
      const stored = {
        ...createDefaultPreferences(1),
        autoFillCurrentSiteUrlOnAccountAdd: enabled,
        autoCheckin: {
          ...DEFAULT_PREFERENCES.autoCheckin!,
          pretriggerDailyOnUiOpen: enabled,
          retryStrategy: {
            ...DEFAULT_PREFERENCES.autoCheckin!.retryStrategy,
            enabled,
            intervalMinutes: 45,
            maxAttemptsPerDay: 2,
          },
        },
        balanceHistory: {
          ...DEFAULT_PREFERENCES.balanceHistory!,
          enabled,
          retentionDays: 90,
        },
      }
      await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, stored)

      const expected = {
        autoFillCurrentSiteUrlOnAccountAdd: enabled ?? true,
        autoCheckin: {
          pretriggerDailyOnUiOpen: enabled ?? true,
          retryStrategy: {
            enabled: enabled ?? true,
            intervalMinutes: 45,
            maxAttemptsPerDay: 2,
          },
        },
        balanceHistory: {
          enabled: enabled ?? true,
          retentionDays: 90,
          endOfDayCapture: { enabled: false },
          estimatedTodayIncome: { enabled: false },
        },
      }
      await expect(userPreferences.getPreferences()).resolves.toMatchObject(
        expected,
      )
      expect(
        await storage.get(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES),
      ).toEqual(stored)

      await expect(
        userPreferences.savePreferences({ themeMode: "dark" }),
      ).resolves.toMatchObject({ ok: true })
      await expect(userPreferences.getPreferences()).resolves.toMatchObject(
        expected,
      )
    },
  )

  describe("temporary window fallback preferences", () => {
    it("uses taller defaults for existing preferences and preserves custom dimensions", () => {
      expect(normalizeTempWindowFallbackPreferences({})).toMatchObject({
        windowWidth: 600,
        windowHeight: 720,
      })
      expect(
        normalizeTempWindowFallbackPreferences({
          windowWidth: 800,
          windowHeight: 1000,
        }),
      ).toMatchObject({ windowWidth: 800, windowHeight: 1000 })
    })
    it.each([null, "900", 0, -1, 319, 4097, 800.5, NaN, Infinity])(
      "replaces invalid stored dimensions %s with defaults",
      (value) => {
        expect(
          normalizeTempWindowFallbackPreferences({
            windowWidth: value,
            windowHeight: value,
          }),
        ).toMatchObject({ windowWidth: 600, windowHeight: 720 })
      },
    )
    it.each(Object.values(TEMP_CONTEXT_MODES))(
      "preserves stored concrete mode %s",
      (tempContextMode) => {
        expect(
          normalizeTempWindowFallbackPreferences({ tempContextMode }),
        ).toMatchObject({ tempContextMode })
      },
    )

    it.each([undefined, "unsupported", 1])(
      "normalizes invalid stored mode %s to the automatic default",
      (tempContextMode) => {
        expect(
          normalizeTempWindowFallbackPreferences({ tempContextMode }),
        ).toMatchObject({
          tempContextMode: TEMP_CONTEXT_PREFERENCE_MODES.Auto,
        })
      },
    )

    it("accepts the automatic context-mode preference", () => {
      expect(
        normalizeTempWindowFallbackPreferences({
          tempContextMode: TEMP_CONTEXT_PREFERENCE_MODES.Auto,
        }),
      ).toMatchObject({
        tempContextMode: TEMP_CONTEXT_PREFERENCE_MODES.Auto,
      })
    })

    it("normalizes a missing stored mode without writing it back", async () => {
      const storage = (
        userPreferences as unknown as {
          storage: {
            get: (key: string) => Promise<unknown>
            set: (key: string, value: unknown) => Promise<void>
          }
        }
      ).storage
      const storedPreferences = {
        ...createDefaultPreferences(1),
        tempWindowFallback: {
          enabled: true,
          automaticFeatureBypass:
            DEFAULT_PREFERENCES.tempWindowFallback!.automaticFeatureBypass,
        },
      }
      const getSpy = vi
        .spyOn(storage, "get")
        .mockResolvedValueOnce(storedPreferences)
      const setSpy = vi.spyOn(storage, "set").mockResolvedValue(undefined)

      try {
        await expect(userPreferences.getPreferences()).resolves.toMatchObject({
          tempWindowFallback: {
            tempContextMode: TEMP_CONTEXT_PREFERENCE_MODES.Auto,
          },
        })
        expect(setSpy).not.toHaveBeenCalled()
      } finally {
        getSpy.mockRestore()
        setSpy.mockRestore()
      }
    })
  })

  describe("updateWebAiApiCheck", () => {
    it("persists nested enhanced auto-detect updates without a React provider", async () => {
      await userPreferences.resetToDefaults()
      await userPreferences.updateWebAiApiCheck({
        autoDetect: {
          urlWhitelist: {
            patterns: ["^https://stored\\.example"],
          },
        },
      })

      await expect(
        userPreferences.updateWebAiApiCheck({
          autoDetect: {
            enhanced: { enabled: false },
          },
        }),
      ).resolves.toMatchObject({ ok: true })

      const preferences = await userPreferences.getPreferences()

      expect(preferences.webAiApiCheck?.autoDetect.enhanced.enabled).toBe(false)
      expect(preferences.webAiApiCheck?.autoDetect.enabled).toBe(true)
      expect(
        preferences.webAiApiCheck?.autoDetect.urlWhitelist.patterns,
      ).toEqual(["^https://stored\\.example"])
      expect(preferences.webAiApiCheck?.enabled).toBe(true)
    })
  })

  describe("write failures", () => {
    it("returns a storage-error result when a guarded write cannot read the current snapshot", async () => {
      const storage = (userPreferences as any).storage as {
        get: ReturnType<typeof vi.fn>
        set: ReturnType<typeof vi.fn>
      }
      const readError = new Error("read failed")

      vi.spyOn(storage, "get").mockRejectedValueOnce(readError)
      const setSpy = vi.spyOn(storage, "set")

      const result = await userPreferences.savePreferencesWithResult({
        currencyType: "CNY",
      })

      expect(result).toEqual({
        ok: false,
        reason: {
          type: "storage-error",
          error: readError,
        },
      })
      expect(setSpy).not.toHaveBeenCalled()
    })

    it("returns storage-error results for direct reset, clear, and import write failures", async () => {
      const storage = (userPreferences as any).storage as {
        set: ReturnType<typeof vi.fn>
        remove: ReturnType<typeof vi.fn>
      }
      const setError = new Error("set failed")
      const removeError = new Error("remove failed")

      vi.spyOn(storage, "set").mockRejectedValueOnce(setError)
      await expect(userPreferences.resetToDefaults()).resolves.toEqual({
        ok: false,
        reason: {
          type: "storage-error",
          error: setError,
        },
      })

      vi.spyOn(storage, "remove").mockRejectedValueOnce(removeError)
      await expect(userPreferences.clearPreferences()).resolves.toEqual({
        ok: false,
        reason: {
          type: "storage-error",
          error: removeError,
        },
      })

      vi.spyOn(storage, "set").mockRejectedValueOnce(setError)
      await expect(
        userPreferences.importPreferences({
          ...DEFAULT_PREFERENCES,
          themeMode: "dark",
        }),
      ).resolves.toEqual({
        ok: false,
        reason: {
          type: "storage-error",
          error: setError,
        },
      })
    })

    it("uses the shared write path for site announcement notification updates", async () => {
      const storage = (userPreferences as any).storage as {
        set: ReturnType<typeof vi.fn>
      }
      const setSpy = vi.spyOn(storage, "set")

      await expect(
        userPreferences.updateSiteAnnouncementNotifications({
          intervalMinutes:
            DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES.intervalMinutes + 60,
        }),
      ).resolves.toMatchObject({
        ok: true,
        preferences: {
          siteAnnouncementNotifications: {
            ...DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
            intervalMinutes:
              DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES.intervalMinutes + 60,
          },
        },
      })

      expect(setSpy).toHaveBeenCalled()
    })
  })

  describe("backup export", () => {
    it("keeps legacy WebDAV export behavior while removing Gist credentials", async () => {
      await userPreferences.resetToDefaults()
      await userPreferences.updateWebdavSettings({
        provider: "webdav",
        url: "https://dav.example/backup.json",
        username: "dav-user",
        password: "dav-password",
        backupEncryptionPassword: "encryption-password",
        githubGist: {
          token: "ghp-secret",
          gistId: "gist-secret",
          gistUrl: "https://gist.github.com/example/gist-secret",
        },
      })

      const exported = await userPreferences.exportPreferencesForBackup()

      expect(exported.webdav).toMatchObject({
        provider: "webdav",
        url: "https://dav.example/backup.json",
        username: "dav-user",
        password: "dav-password",
        backupEncryptionPassword: "encryption-password",
        githubGist: {
          token: "",
          gistId: "",
          gistUrl: "",
        },
      })
    })

    it("removes all cloud credentials when GitHub Gist is active", async () => {
      await userPreferences.resetToDefaults()
      await userPreferences.updateWebdavSettings({
        provider: "github_gist",
        url: "https://dav.example/backup.json",
        username: "dav-user",
        password: "dav-password",
        backupEncryptionPassword: "encryption-password",
        githubGist: {
          token: "ghp-secret",
          gistId: "gist-secret",
          gistUrl: "https://gist.github.com/example/gist-secret",
        },
      })

      const exported = await userPreferences.exportPreferencesForBackup()

      expect(exported.webdav).toMatchObject({
        provider: "github_gist",
        url: "",
        username: "",
        password: "",
        backupEncryptionPassword: "",
        githubGist: {
          token: "",
          gistId: "",
          gistUrl: "",
        },
      })
    })
  })
})
