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
})
