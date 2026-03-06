import { describe, expect, it } from "vitest"

import {
  filterWebdavBackupPayloadBySelection,
  mergeWebdavBackupPayloadBySelection,
} from "~/services/webdav/webdavSelectiveSync"

describe("filterWebdavBackupPayloadBySelection", () => {
  const baseBackup: any = {
    version: "2.0",
    timestamp: 123,
    accounts: {
      accounts: [{ id: "a1" }, { id: "a2" }],
      bookmarks: [{ id: "b1" }],
      pinnedAccountIds: ["b1", "a2"],
      orderedAccountIds: ["b1", "a1", "a2"],
      last_updated: 456,
    },
    tagStore: { version: 1, tagsById: {} },
    preferences: { lastUpdated: 1 },
    channelConfigs: { 1: { enabled: true } },
    apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
  }

  it("omits unselected sections and filters accounts-only payload", () => {
    const payload = filterWebdavBackupPayloadBySelection({
      backup: baseBackup,
      selection: {
        accounts: true,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
    })

    expect(payload.preferences).toBeUndefined()
    expect(payload.apiCredentialProfiles).toBeUndefined()
    expect(payload.tagStore).toBeDefined()

    expect(payload.accounts).toBeDefined()
    expect((payload.accounts as any).accounts).toEqual([
      { id: "a1" },
      { id: "a2" },
    ])
    expect((payload.accounts as any).bookmarks).toBeUndefined()
    expect((payload.accounts as any).pinnedAccountIds).toEqual(["a2"])
    expect((payload.accounts as any).orderedAccountIds).toEqual(["a1", "a2"])
  })

  it("omits unselected sections and filters bookmarks-only payload", () => {
    const payload = filterWebdavBackupPayloadBySelection({
      backup: baseBackup,
      selection: {
        accounts: false,
        bookmarks: true,
        apiCredentialProfiles: false,
        preferences: false,
      },
    })

    expect(payload.preferences).toBeUndefined()
    expect(payload.apiCredentialProfiles).toBeUndefined()
    expect(payload.tagStore).toBeDefined()

    expect(payload.accounts).toBeDefined()
    expect((payload.accounts as any).accounts).toBeUndefined()
    expect((payload.accounts as any).bookmarks).toEqual([{ id: "b1" }])
    expect((payload.accounts as any).pinnedAccountIds).toEqual(["b1"])
    expect((payload.accounts as any).orderedAccountIds).toEqual(["b1"])
  })

  it("omits taggable sections when only preferences are selected", () => {
    const payload = filterWebdavBackupPayloadBySelection({
      backup: baseBackup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
    })

    expect(payload.accounts).toBeUndefined()
    expect(payload.tagStore).toBeUndefined()
    expect(payload.apiCredentialProfiles).toBeUndefined()
    expect(payload.preferences).toEqual(baseBackup.preferences)
    expect(payload.channelConfigs).toEqual(baseBackup.channelConfigs)
  })
})

describe("mergeWebdavBackupPayloadBySelection", () => {
  it("preserves remote accounts when only preferences are selected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [{ id: "local-bookmark" }],
        pinnedAccountIds: ["local-account", "local-bookmark"],
        orderedAccountIds: ["local-bookmark", "local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: { local: { id: "local" } } },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      accounts: {
        accounts: [{ id: "remote-account" }],
        bookmarks: [{ id: "remote-bookmark" }],
        pinnedAccountIds: ["remote-bookmark"],
        orderedAccountIds: ["remote-bookmark", "remote-account"],
        last_updated: 123,
      },
      tagStore: { version: 1, tagsById: { remote: { id: "remote" } } },
      preferences: { lastUpdated: 123, themeMode: "light" },
      channelConfigs: { 1: { enabled: false } },
      apiCredentialProfiles: {
        version: 1,
        profiles: [{ id: "remote-profile" }],
        lastUpdated: 123,
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      remoteBackup,
    })

    expect((payload.accounts as any).accounts).toEqual([
      { id: "remote-account" },
    ])
    expect((payload.accounts as any).bookmarks).toEqual([
      { id: "remote-bookmark" },
    ])
    expect((payload.accounts as any).pinnedAccountIds).toEqual([
      "remote-bookmark",
    ])
    expect((payload.accounts as any).orderedAccountIds).toEqual([
      "remote-bookmark",
      "remote-account",
    ])
    expect(payload.preferences).toEqual(backup.preferences)
    expect(payload.tagStore).toEqual(remoteBackup.tagStore)
    expect(payload.apiCredentialProfiles).toEqual(
      remoteBackup.apiCredentialProfiles,
    )
  })

  it("preserves remote bookmarks and ordering metadata when only accounts are selected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [{ id: "local-bookmark" }],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      accounts: {
        accounts: [{ id: "remote-account" }],
        bookmarks: [{ id: "remote-bookmark" }],
        pinnedAccountIds: ["remote-bookmark", "remote-account"],
        orderedAccountIds: ["remote-bookmark", "remote-account"],
        last_updated: 123,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 123, themeMode: "light" },
      channelConfigs: { 1: { enabled: false } },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: true,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
      remoteBackup,
    })

    expect((payload.accounts as any).accounts).toEqual([
      { id: "local-account" },
    ])
    expect((payload.accounts as any).bookmarks).toEqual([
      { id: "remote-bookmark" },
    ])
    expect((payload.accounts as any).pinnedAccountIds).toEqual([
      "local-account",
      "remote-bookmark",
    ])
    expect((payload.accounts as any).orderedAccountIds).toEqual([
      "local-account",
      "remote-bookmark",
    ])
  })

  it("preserves legacy remote api credential profiles when they are unselected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
    }

    const remoteBackup: any = {
      version: "1.0",
      timestamp: 123,
      data: {
        apiCredentialProfiles: {
          version: 1,
          profiles: [{ id: "legacy-remote-profile" }],
          lastUpdated: 123,
        },
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      remoteBackup,
    })

    expect(payload.apiCredentialProfiles).toEqual(
      remoteBackup.data.apiCredentialProfiles,
    )
  })

  it("preserves remote api credential profiles when selected local backup omits them", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      apiCredentialProfiles: {
        version: 1,
        profiles: [{ id: "remote-profile" }],
        lastUpdated: 123,
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: true,
        preferences: false,
      },
      remoteBackup,
    })

    expect(payload.apiCredentialProfiles).toEqual(
      remoteBackup.apiCredentialProfiles,
    )
  })

  it("preserves legacy remote preferences when they are unselected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
    }

    const remoteBackup: any = {
      version: "1.0",
      timestamp: 123,
      data: {
        preferences: {
          lastUpdated: 123,
          themeMode: "legacy-remote",
        },
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
      remoteBackup,
    })

    expect(payload.preferences).toEqual(remoteBackup.data.preferences)
  })

  it("preserves legacy remote tagStore when taggable sections are unselected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: { local: { id: "local-tag" } } },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
    }

    const remoteBackup: any = {
      version: "1.0",
      timestamp: 123,
      data: {
        tagStore: {
          version: 1,
          tagsById: { legacy: { id: "legacy-tag" } },
        },
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      remoteBackup,
    })

    expect(payload.tagStore).toEqual(remoteBackup.data.tagStore)
  })

  it("preserves explicit null remote preferences when they are unselected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      preferences: null,
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
      remoteBackup,
    })

    expect(payload).toHaveProperty("preferences", null)
  })

  it("preserves explicit null remote tagStore when taggable sections are unselected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: { local: { id: "local-tag" } } },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      tagStore: null,
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      remoteBackup,
    })

    expect(payload).toHaveProperty("tagStore", null)
  })

  it("preserves remote accounts when only api credential profiles are selected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [{ id: "local-bookmark" }],
        pinnedAccountIds: ["local-account", "local-bookmark"],
        orderedAccountIds: ["local-bookmark", "local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: { local: { id: "local-tag" } } },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: {
        version: 1,
        profiles: [{ id: "local-profile" }],
        lastUpdated: 456,
      },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      accounts: {
        accounts: [{ id: "remote-account" }],
        bookmarks: [{ id: "remote-bookmark" }],
        pinnedAccountIds: ["remote-account", "remote-bookmark"],
        orderedAccountIds: ["remote-bookmark", "remote-account"],
        last_updated: 123,
      },
      tagStore: { version: 1, tagsById: { remote: { id: "remote-tag" } } },
      preferences: { lastUpdated: 123, themeMode: "light" },
      channelConfigs: { 1: { enabled: false } },
      apiCredentialProfiles: {
        version: 1,
        profiles: [{ id: "remote-profile" }],
        lastUpdated: 123,
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: true,
        preferences: false,
      },
      remoteBackup,
    })

    expect((payload.accounts as any).accounts).toEqual([
      { id: "remote-account" },
    ])
    expect((payload.accounts as any).bookmarks).toEqual([
      { id: "remote-bookmark" },
    ])
    expect(payload.preferences).toEqual(remoteBackup.preferences)
    expect(payload.apiCredentialProfiles).toEqual(backup.apiCredentialProfiles)
    expect(payload.tagStore).toEqual(backup.tagStore)
  })
})
