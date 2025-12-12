import { beforeEach, describe, expect, it, vi } from "vitest"

import { webdavAutoSyncService } from "~/services/webdav/webdavAutoSyncService"

// Basic getErrorMessage passthrough to avoid noisy output
vi.mock("~/utils/error", () => ({
  getErrorMessage: (e: unknown) => String(e),
}))

// Mock WebDAV network helpers so syncWithWebdav can be tested in isolation if needed
const mockTestConnection = vi.fn()
const mockDownloadBackup = vi.fn()
const mockUploadBackup = vi.fn()

vi.mock("~/services/webdav/webdavService", () => ({
  testWebdavConnection: (...args: any[]) => mockTestConnection(...args),
  downloadBackup: (...args: any[]) => mockDownloadBackup(...args),
  uploadBackup: (...args: any[]) => mockUploadBackup(...args),
}))

describe("WebdavAutoSyncService.mergeData", () => {
  const callMerge = (local: any, remote: any) =>
    (webdavAutoSyncService as any).mergeData(local, remote) as any
  const callMaxMerge = (local: any, remote: any) =>
    (webdavAutoSyncService as any).maxMergeData(local, remote) as any

  const basePrefsLocal: any = {
    themeMode: "light",
    preferencesVersion: 1,
  } as any

  const basePrefsRemote: any = {
    themeMode: "dark",
    preferencesVersion: 2,
  } as any

  const mkChannelConfig = (id: number, updatedAt: number) => ({
    channelId: id,
    modelFilterSettings: {},
    createdAt: 0,
    updatedAt,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("merges accounts by id choosing the most recently updated", () => {
    const localAccounts = [
      { id: "a1", site_name: "local-1", updated_at: 10 } as any,
      { id: "a2", site_name: "local-2", updated_at: 5 } as any,
    ]
    const remoteAccounts = [
      { id: "a2", site_name: "remote-2", updated_at: 20 } as any,
      { id: "a3", site_name: "remote-3", updated_at: 1 } as any,
    ]

    const local: any = {
      accounts: localAccounts,
      accountsTimestamp: 100,
      preferences: basePrefsLocal,
      preferencesTimestamp: 50,
      channelConfigs: {},
    }

    const remote: any = {
      accounts: remoteAccounts,
      accountsTimestamp: 200,
      preferences: basePrefsRemote,
      preferencesTimestamp: 60,
      channelConfigs: {},
    }

    const result = callMerge(local, remote)

    const ids = result.accounts.map((a: any) => a.id).sort()
    expect(ids).toEqual(["a1", "a2", "a3"])

    const a2 = result.accounts.find((a: any) => a.id === "a2")!
    expect(a2.site_name).toBe("remote-2")
  })

  it("chooses preferences from the side with newer preferencesTimestamp", () => {
    const local: any = {
      accounts: [],
      accountsTimestamp: 0,
      preferences: { ...basePrefsLocal, themeMode: "local" },
      preferencesTimestamp: 10,
      channelConfigs: {},
    }

    const remote: any = {
      accounts: [],
      accountsTimestamp: 0,
      preferences: { ...basePrefsRemote, themeMode: "remote" },
      preferencesTimestamp: 20,
      channelConfigs: {},
    }

    const result = callMerge(local, remote)
    expect(result.preferences.themeMode).toBe("remote")
  })

  it("merges channel configs by numeric id using latest updatedAt", () => {
    const localChannels = {
      1: mkChannelConfig(1, 10),
      2: mkChannelConfig(2, 5),
    }

    const remoteChannels = {
      2: mkChannelConfig(2, 20),
      3: mkChannelConfig(3, 1),
    }

    const local: any = {
      accounts: [],
      accountsTimestamp: 0,
      preferences: basePrefsLocal,
      preferencesTimestamp: 0,
      channelConfigs: localChannels,
    }

    const remote: any = {
      accounts: [],
      accountsTimestamp: 0,
      preferences: basePrefsRemote,
      preferencesTimestamp: 0,
      channelConfigs: remoteChannels,
    }

    const result = callMerge(local, remote)

    expect(
      Object.keys(result.channelConfigs)
        .map((k: any) => Number(k))
        .sort(),
    ).toEqual([1, 2, 3])

    // id 2 should come from remote because of newer updatedAt
    expect(result.channelConfigs[2].updatedAt).toBe(20)
  })

  it("maximum merge preserves missing fields and unions arrays", () => {
    const localAccounts = [
      {
        id: "a1",
        site_name: "local-1",
        updated_at: 10,
        notes: "local-note",
        tags: ["t1"],
      } as any,
    ]
    const remoteAccounts = [
      {
        id: "a1",
        site_name: "remote-1",
        updated_at: 20,
        tags: ["t2"],
      } as any,
    ]

    const local: any = {
      accounts: localAccounts,
      accountsTimestamp: 100,
      preferences: { ...basePrefsLocal, language: "en" },
      preferencesTimestamp: 100,
      channelConfigs: {},
    }

    const remote: any = {
      accounts: remoteAccounts,
      accountsTimestamp: 200,
      preferences: { ...basePrefsRemote, themeMode: "dark" },
      preferencesTimestamp: 200,
      channelConfigs: {},
    }

    const result = callMaxMerge(local, remote)

    const a1 = result.accounts.find((a: any) => a.id === "a1")!
    expect(a1.site_name).toBe("remote-1")
    expect(a1.notes).toBe("local-note")
    expect((a1.tags || []).sort()).toEqual(["t1", "t2"])

    expect(result.preferences.themeMode).toBe("dark")
    expect(result.preferences.language).toBe("en")
  })

  it("maximum merge unions channel filter rules by id", () => {
    const localChannels = {
      1: {
        channelId: 1,
        modelFilterSettings: {
          rules: [{ id: "r1", name: "local", updatedAt: 10 }],
          updatedAt: 10,
        },
        createdAt: 0,
        updatedAt: 10,
      },
    }

    const remoteChannels = {
      1: {
        channelId: 1,
        modelFilterSettings: {
          rules: [
            { id: "r1", name: "remote", updatedAt: 20 },
            { id: "r2", name: "remote-2", updatedAt: 5 },
          ],
          updatedAt: 20,
        },
        createdAt: 0,
        updatedAt: 20,
      },
    }

    const local: any = {
      accounts: [],
      accountsTimestamp: 0,
      preferences: basePrefsLocal,
      preferencesTimestamp: 0,
      channelConfigs: localChannels,
    }

    const remote: any = {
      accounts: [],
      accountsTimestamp: 0,
      preferences: basePrefsRemote,
      preferencesTimestamp: 0,
      channelConfigs: remoteChannels,
    }

    const result = callMaxMerge(local, remote)
    const rules = result.channelConfigs[1].modelFilterSettings.rules
    const ids = rules.map((r: any) => r.id).sort()
    expect(ids).toEqual(["r1", "r2"])
    expect(rules.find((r: any) => r.id === "r1")!.name).toBe("remote")
  })
})
