import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "wxt/browser"

import { Storage } from "@plasmohq/storage"

import { clearDevData } from "~/features/DevPanel/dataCleanup"
import { addDevFixtureAccounts } from "~/features/DevPanel/fixtureAccounts"
import { addDevFixtureApiCredentials } from "~/features/DevPanel/fixtureApiCredentials"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/storage/profiles"
import {
  I18NEXT_LANGUAGE_STORAGE_KEY,
  STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { THEME_BOOTSTRAP_CACHE_KEY } from "~/utils/ui/themePreferences"

describe("development data cleanup", () => {
  beforeEach(() => vi.stubEnv("MODE", "development"))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("clears settings while retaining saved accounts and unrelated data", async () => {
    await browser.storage.local.set({
      [STORAGE_KEYS.USER_PREFERENCES]: "saved settings",
      [STORAGE_KEYS.ACCOUNTS]: "saved accounts",
      unrelated: "keep",
    })

    await clearDevData(["settings"])

    expect(await browser.storage.local.get(null)).toEqual({
      [STORAGE_KEYS.ACCOUNTS]: "saved accounts",
      unrelated: "keep",
    })
  })

  it.each(["production", "test"])(
    "rejects cleanup in %s mode without deleting data",
    async (mode) => {
      vi.stubEnv("MODE", mode)
      await browser.storage.local.set({
        [STORAGE_KEYS.USER_PREFERENCES]: "keep",
      })

      await expect(clearDevData(["settings"])).rejects.toThrow("development")
      expect(
        await browser.storage.local.get(STORAGE_KEYS.USER_PREFERENCES),
      ).toEqual({ [STORAGE_KEYS.USER_PREFERENCES]: "keep" })
    },
  )

  it("clears histories and logs without removing accounts or preferences", async () => {
    await browser.storage.local.set({
      [STORAGE_KEYS.VERIFICATION_RESULT_HISTORY]: "verification",
      [STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE]: "balances",
      usageHistory_store: "usage",
      [STORAGE_KEYS.LOG_HISTORY]: "logs",
      [STORAGE_KEYS.ACCOUNTS]: "accounts",
      [STORAGE_KEYS.USER_PREFERENCES]: "preferences",
    })
    await clearDevData(["history"])
    const remaining = await browser.storage.local.get(null)
    expect(remaining[STORAGE_KEYS.VERIFICATION_RESULT_HISTORY]).toBeUndefined()
    expect(remaining[STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE]).toBeUndefined()
    expect(remaining.usageHistory_store).toBeUndefined()
    expect(JSON.stringify(remaining[STORAGE_KEYS.LOG_HISTORY])).not.toContain(
      "logs",
    )
    expect(remaining[STORAGE_KEYS.ACCOUNTS]).toBe("accounts")
    expect(remaining[STORAGE_KEYS.USER_PREFERENCES]).toBe("preferences")
  })

  it.each(["settings", "all"] as const)(
    "clears page storage according to the %s scope",
    async (scope) => {
      const local = new Map([
        [I18NEXT_LANGUAGE_STORAGE_KEY, "ja"],
        [THEME_BOOTSTRAP_CACHE_KEY, "dark"],
        ["unrelated", "keep"],
      ])
      const session = new Map([["pending", "keep"]])
      vi.stubGlobal("localStorage", {
        removeItem: (key: string) => local.delete(key),
        clear: () => local.clear(),
      })
      vi.stubGlobal("sessionStorage", { clear: () => session.clear() })

      await clearDevData([scope])

      expect([...local]).toEqual(scope === "all" ? [] : [["unrelated", "keep"]])
      expect([...session]).toEqual(scope === "all" ? [] : [["pending", "keep"]])
    },
  )

  it("stops when a cache cannot be deleted and permits a later retry", async () => {
    const saved = new Set(["community", "other"])
    const remove = vi
      .fn(async (name: string) => saved.delete(name))
      .mockResolvedValueOnce(false)
    vi.stubGlobal("caches", {
      keys: async () => [...saved],
      delete: remove,
    })

    await expect(clearDevData(["caches"])).rejects.toThrow(
      "Could not remove cache: community",
    )
    expect([...saved]).toEqual(["community", "other"])
    expect(remove).toHaveBeenCalledTimes(1)

    await clearDevData(["caches"])
    expect([...saved]).toEqual([])
  })

  it("clears persistent caches without deleting history or settings", async () => {
    await browser.storage.local.set({
      [STORAGE_KEYS.SITE_LIST_CACHE]: "site catalog",
      [STORAGE_KEYS.SPONSOR_CATALOG_CACHE]: "sponsors",
      [STORAGE_KEYS.SPONSOR_CATALOG_VERSIONED_CACHE]: "versioned sponsors",
      [STORAGE_KEYS.RELEASE_UPDATE_STATUS]: "update",
      [STORAGE_KEYS.VERIFICATION_RESULT_HISTORY]: "history",
      [STORAGE_KEYS.USER_PREFERENCES]: "settings",
    })
    await clearDevData(["caches"])
    expect(await browser.storage.local.get(null)).toEqual({
      [STORAGE_KEYS.VERIFICATION_RESULT_HISTORY]: "history",
      [STORAGE_KEYS.USER_PREFERENCES]: "settings",
    })
  })

  it("can clear all accounts and credentials independently of settings and history", async () => {
    await browser.storage.local.set({
      [STORAGE_KEYS.ACCOUNTS]:
        "manually added and imported accounts and bookmarks",
      [STORAGE_KEYS.API_CREDENTIAL_PROFILES]: "independent credentials",
      [STORAGE_KEYS.TAG_STORE]: "tags",
      [STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS]: "fixture account ids",
      [STORAGE_KEYS.DEV_FIXTURE_API_CREDENTIAL_IDS]: "fixture credential ids",
      [STORAGE_KEYS.EVIDENCE]: "login evidence",
      [STORAGE_KEYS.REPAIR_PROGRESS]: "repair progress",
      "accountDialogRecovery_draft_v1:test": "account draft",
      "sponsorWorkflow_draft_v1:test": "credential draft",
      [STORAGE_KEYS.USER_PREFERENCES]: "settings",
      [STORAGE_KEYS.VERIFICATION_RESULT_HISTORY]: "history",
    })
    await browser.storage.session.set({
      accountKeyRepair_createdRuntimeSecrets_v1: "created credential",
    })
    await clearDevData(["accounts"])
    expect(await browser.storage.local.get(null)).toEqual({
      [STORAGE_KEYS.USER_PREFERENCES]: "settings",
      [STORAGE_KEYS.VERIFICATION_RESULT_HISTORY]: "history",
    })
    expect(await browser.storage.session.get(null)).toEqual({})
  })

  it("deletes only registered fixture accounts and credentials", async () => {
    await addDevFixtureAccounts(2)
    await addDevFixtureApiCredentials(2)
    const storage = new Storage({ area: "local" })
    const accounts = await accountQueries.getAllAccountsOrThrow()
    const profiles = await apiCredentialProfilesStorage.listProfiles()
    await storage.set(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS, [accounts[0]!.id])
    await storage.set(STORAGE_KEYS.DEV_FIXTURE_API_CREDENTIAL_IDS, [
      profiles[0]!.id,
    ])

    await clearDevData(["fixtures"])

    expect(
      (await accountQueries.getAllAccountsOrThrow()).map((a) => a.id),
    ).toEqual([accounts[1]!.id])
    expect(
      (await apiCredentialProfilesStorage.listProfiles()).map((p) => p.id),
    ).toEqual([profiles[1]!.id])
  })

  it("retains fixture registration when account storage cannot be read", async () => {
    await addDevFixtureAccounts(1)
    const storage = new Storage({ area: "local" })
    const registered = await storage.get(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS)
    vi.spyOn(accountQueries, "getAllAccountsOrThrow").mockRejectedValueOnce(
      new Error("account read unavailable"),
    )
    await expect(clearDevData(["fixtures"])).rejects.toThrow(
      "account read unavailable",
    )
    expect(await storage.get(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS)).toEqual(
      registered,
    )
  })

  it("clears all saved extension storage, including keys outside the registry", async () => {
    await browser.storage.local.set({
      [STORAGE_KEYS.ACCOUNTS]: "accounts",
      unknownExtensionKey: "unknown",
    })
    await browser.storage.sync.set({ synced: "synced settings" })
    await browser.storage.session.set({ pending: "session state" })
    await browser.alarms.create("test-schedule", { delayInMinutes: 60 })
    await clearDevData(["all"])
    expect(await browser.storage.local.get(null)).toEqual({})
    expect(await browser.storage.sync.get(null)).toEqual({})
    expect(await browser.storage.session.get(null)).toEqual({})
    expect(await browser.alarms.getAll()).toEqual([])
  })

  it.each([{ selection: [] }, { selection: ["unknown"] }])(
    "rejects an invalid selection $selection before removing data",
    async ({ selection }) => {
      await browser.storage.local.set({
        [STORAGE_KEYS.USER_PREFERENCES]: "keep",
      })
      await expect(
        clearDevData(selection as Parameters<typeof clearDevData>[0]),
      ).rejects.toThrow("Select")
      expect(
        (await browser.storage.local.get(STORAGE_KEYS.USER_PREFERENCES))[
          STORAGE_KEYS.USER_PREFERENCES
        ],
      ).toBe("keep")
    },
  )

  it("reports a failed storage removal", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.USER_PREFERENCES]: "keep" })
    vi.spyOn(browser.storage.local, "remove").mockRejectedValueOnce(
      new Error("storage unavailable"),
    )
    await expect(clearDevData(["settings"])).rejects.toThrow(
      "storage unavailable",
    )
    expect(
      (await browser.storage.local.get(STORAGE_KEYS.USER_PREFERENCES))[
        STORAGE_KEYS.USER_PREFERENCES
      ],
    ).toBe("keep")
  })

  it("clears extension cache storage and propagates cache failures", async () => {
    const saved = new Map([["community", "response"]])
    vi.stubGlobal("caches", {
      keys: async () => [...saved.keys()],
      delete: async (name: string) => saved.delete(name),
    })
    await clearDevData(["caches"])
    expect(saved.size).toBe(0)
    vi.stubGlobal("caches", {
      keys: async () => {
        throw new Error("cache unavailable")
      },
    })
    await expect(clearDevData(["caches"])).rejects.toThrow("cache unavailable")
  })
})
