import { beforeEach, describe, expect, it, vi } from "vitest"

import { createDefaultTagStore } from "~/services/tags/tagStoreUtils"
import { mergeWebdavSyncData } from "~/services/webdav/webdavSyncMerge"

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: {
    // mergeData only needs this pure helper; tests not concerned with tag semantics.
    mergeTagStoresForSync: (input: any) => ({
      tagStore: input.localTagStore,
      localAccounts: input.localAccounts,
      remoteAccounts: input.remoteAccounts,
      localBookmarks: input.localBookmarks ?? [],
      remoteBookmarks: input.remoteBookmarks ?? [],
      localTaggables: input.localTaggables ?? [],
      remoteTaggables: input.remoteTaggables ?? [],
    }),
  },
}))

describe("mergeWebdavSyncData", () => {
  const callMerge = (local: any, remote: any) =>
    mergeWebdavSyncData(local, remote) as any

  const emptyApiCredentialProfiles: any = {
    version: 2,
    profiles: [],
    lastUpdated: 0,
  }

  const basePrefsLocal: any = {
    themeMode: "light",
    preferencesVersion: 1,
  } as any

  const basePrefsRemote: any = {
    themeMode: "dark",
    preferencesVersion: 2,
  } as any

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
      bookmarks: [],
      accountsTimestamp: 100,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsLocal,
      preferencesTimestamp: 50,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: remoteAccounts,
      bookmarks: [],
      accountsTimestamp: 200,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsRemote,
      preferencesTimestamp: 60,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)

    const ids = result.accounts.map((a: any) => a.id).sort()
    expect(ids).toEqual(["a1", "a2", "a3"])

    const a2 = result.accounts.find((a: any) => a.id === "a2")!
    expect(a2.site_name).toBe("remote-2")
  })

  it("keeps deleted local accounts from being restored by older remote backups", () => {
    const local: any = {
      accounts: [{ id: "kept", site_name: "local-kept", updated_at: 300 }],
      bookmarks: [],
      deletedEntryRecords: {
        deleted: {
          kind: "account",
          deletedAt: 200,
          entryUpdatedAt: 100,
        },
      },
      accountsTimestamp: 200,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsLocal,
      preferencesTimestamp: 50,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: [
        { id: "deleted", site_name: "remote-deleted", updated_at: 100 },
        { id: "newer", site_name: "remote-newer", updated_at: 250 },
      ],
      bookmarks: [],
      deletedEntryRecords: {},
      accountsTimestamp: 150,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsRemote,
      preferencesTimestamp: 60,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)

    expect(result.accounts.map((account: any) => account.id).sort()).toEqual([
      "kept",
      "newer",
    ])
    expect(result.deletedEntryRecords).toEqual({
      deleted: {
        kind: "account",
        deletedAt: 200,
        entryUpdatedAt: 100,
      },
    })
  })

  it("keeps deleted accounts suppressed when only automation updated the remote account", () => {
    const local: any = {
      accounts: [],
      bookmarks: [],
      deletedEntryRecords: {
        deleted: {
          kind: "account",
          deletedAt: 200,
          entryUpdatedAt: 100,
        },
      },
      accountsTimestamp: 200,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsLocal,
      preferencesTimestamp: 50,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: [
        {
          id: "deleted",
          site_name: "remote-deleted",
          updated_at: 250,
          user_updated_at: 100,
        },
      ],
      bookmarks: [],
      deletedEntryRecords: {},
      accountsTimestamp: 250,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsRemote,
      preferencesTimestamp: 60,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)

    expect(result.accounts).toEqual([])
    expect(result.deletedEntryRecords).toEqual({
      deleted: {
        kind: "account",
        deletedAt: 200,
        entryUpdatedAt: 100,
      },
    })
  })

  it("restores deleted accounts when the remote account has newer user edits", () => {
    const local: any = {
      accounts: [],
      bookmarks: [],
      deletedEntryRecords: {
        deleted: {
          kind: "account",
          deletedAt: 200,
          entryUpdatedAt: 100,
        },
      },
      accountsTimestamp: 200,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsLocal,
      preferencesTimestamp: 50,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remoteAccount = {
      id: "deleted",
      site_name: "remote-edited",
      updated_at: 250,
      user_updated_at: 250,
    }
    const remote: any = {
      accounts: [remoteAccount],
      bookmarks: [],
      deletedEntryRecords: {},
      accountsTimestamp: 250,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsRemote,
      preferencesTimestamp: 60,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)

    expect(result.accounts).toEqual([remoteAccount])
    expect(result.deletedEntryRecords).toEqual({})
  })

  it("applies remote account deletion markers to stale local accounts", () => {
    const local: any = {
      accounts: [
        { id: "deleted", site_name: "local-deleted", updated_at: 100 },
        { id: "kept", site_name: "local-kept", updated_at: 300 },
      ],
      bookmarks: [],
      deletedEntryRecords: {},
      accountsTimestamp: 100,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsLocal,
      preferencesTimestamp: 50,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: [],
      bookmarks: [],
      deletedEntryRecords: {
        deleted: {
          kind: "account",
          deletedAt: 200,
          entryUpdatedAt: 100,
        },
      },
      accountsTimestamp: 200,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsRemote,
      preferencesTimestamp: 60,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)

    expect(result.accounts.map((account: any) => account.id)).toEqual(["kept"])
    expect(result.deletedEntryRecords).toEqual({
      deleted: {
        kind: "account",
        deletedAt: 200,
        entryUpdatedAt: 100,
      },
    })
  })

  it("applies bookmark deletion markers to stale local and remote bookmarks", () => {
    const keptBookmark = {
      id: "kept-bookmark",
      name: "Kept",
      url: "https://kept.example.com",
      tagIds: [],
      notes: "",
      created_at: 1,
      updated_at: 300,
    }
    const local: any = {
      accounts: [],
      bookmarks: [
        {
          id: "local-deleted-bookmark",
          name: "Local Deleted",
          url: "https://local-deleted.example.com",
          tagIds: [],
          notes: "",
          created_at: 1,
          updated_at: 100,
        },
        keptBookmark,
      ],
      deletedEntryRecords: {},
      accountsTimestamp: 100,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsLocal,
      preferencesTimestamp: 50,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: [],
      bookmarks: [
        {
          id: "remote-deleted-bookmark",
          name: "Remote Deleted",
          url: "https://remote-deleted.example.com",
          tagIds: [],
          notes: "",
          created_at: 1,
          updated_at: 100,
        },
      ],
      deletedEntryRecords: {
        "local-deleted-bookmark": {
          kind: "bookmark",
          deletedAt: 200,
          entryUpdatedAt: 100,
        },
        "remote-deleted-bookmark": {
          kind: "bookmark",
          deletedAt: 200,
          entryUpdatedAt: 100,
        },
      },
      accountsTimestamp: 200,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsRemote,
      preferencesTimestamp: 60,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)

    expect(result.bookmarks).toEqual([keptBookmark])
    expect(result.deletedEntryRecords).toEqual({
      "local-deleted-bookmark": {
        kind: "bookmark",
        deletedAt: 200,
        entryUpdatedAt: 100,
      },
      "remote-deleted-bookmark": {
        kind: "bookmark",
        deletedAt: 200,
        entryUpdatedAt: 100,
      },
    })
  })

  it("does not apply remote account deletion markers when accounts are unselected", () => {
    const localAccount = {
      id: "local-account",
      site_name: "local-account",
      updated_at: 100,
    }
    const local: any = {
      accounts: [localAccount],
      bookmarks: [],
      deletedEntryRecords: {},
      accountsTimestamp: 100,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsLocal,
      preferencesTimestamp: 50,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: [],
      bookmarks: [],
      deletedEntryRecords: {
        "local-account": {
          kind: "account",
          deletedAt: 200,
          entryUpdatedAt: 100,
        },
      },
      accountsTimestamp: 200,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsRemote,
      preferencesTimestamp: 60,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = mergeWebdavSyncData(local, remote, {
      accounts: false,
      bookmarks: true,
      apiCredentialProfiles: false,
      preferences: false,
    })

    expect(result.accounts).toEqual([localAccount])
    expect(result.deletedEntryRecords).toEqual({})
  })

  it("keeps newest local deletion markers and prunes markers for restored entries", () => {
    const restoredAccount = {
      id: "restored-account",
      site_name: "restored-account",
      updated_at: 300,
      user_updated_at: 300,
    }
    const kindMismatchAccount = {
      id: "bookmark-marker-only",
      site_name: "kind-mismatch",
      updated_at: 10,
    }
    const restoredBookmark = {
      id: "restored-bookmark",
      name: "Restored",
      url: "https://restored.example.com",
      tagIds: [],
      notes: "",
      created_at: 1,
      updated_at: 300,
    }
    const local: any = {
      accounts: [restoredAccount, kindMismatchAccount],
      bookmarks: [restoredBookmark],
      deletedEntryRecords: {
        "local-newer": {
          kind: "account",
          deletedAt: 300,
          entryUpdatedAt: 250,
        },
        "bookmark-marker-only": {
          kind: "bookmark",
          deletedAt: 200,
          entryUpdatedAt: 10,
        },
        "restored-account": {
          kind: "account",
          deletedAt: 100,
          entryUpdatedAt: 100,
        },
        "restored-bookmark": {
          kind: "bookmark",
          deletedAt: 100,
          entryUpdatedAt: 100,
        },
        "missing-timestamps": {
          kind: "account",
          deletedAt: 200,
          entryUpdatedAt: 50,
        },
      },
      accountsTimestamp: 300,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsLocal,
      preferencesTimestamp: 50,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: [
        { id: "missing-timestamps", site_name: "stale-remote" },
        {
          id: "remote-restored",
          site_name: "remote-restored",
          updated_at: 400,
          user_updated_at: 400,
        },
      ],
      bookmarks: [],
      deletedEntryRecords: {
        "local-newer": {
          kind: "account",
          deletedAt: 200,
          entryUpdatedAt: 150,
        },
        "remote-restored": {
          kind: "account",
          deletedAt: 100,
          entryUpdatedAt: 100,
        },
      },
      accountsTimestamp: 400,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsRemote,
      preferencesTimestamp: 60,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)

    expect(result.accounts.map((account: any) => account.id).sort()).toEqual([
      "bookmark-marker-only",
      "remote-restored",
      "restored-account",
    ])
    expect(result.bookmarks).toEqual([restoredBookmark])
    expect(result.deletedEntryRecords).toEqual({
      "local-newer": {
        kind: "account",
        deletedAt: 300,
        entryUpdatedAt: 250,
      },
      "missing-timestamps": {
        kind: "account",
        deletedAt: 200,
        entryUpdatedAt: 50,
      },
    })
  })

  it("merges bookmarks by id choosing the most recently updated", () => {
    const local: any = {
      accounts: [],
      bookmarks: [
        {
          id: "b1",
          name: "local-1",
          url: "https://local.example.com",
          tagIds: [],
          notes: "",
          created_at: 1,
          updated_at: 10,
        },
        {
          id: "b2",
          name: "local-2",
          url: "https://local2.example.com",
          tagIds: [],
          notes: "",
          created_at: 2,
          updated_at: 5,
        },
      ],
      accountsTimestamp: 0,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsLocal,
      preferencesTimestamp: 0,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: [],
      bookmarks: [
        {
          id: "b1",
          name: "remote-1",
          url: "https://remote.example.com",
          tagIds: [],
          notes: "",
          created_at: 1,
          updated_at: 20,
        },
        {
          id: "b3",
          name: "remote-3",
          url: "https://remote3.example.com",
          tagIds: [],
          notes: "",
          created_at: 3,
          updated_at: 1,
        },
      ],
      accountsTimestamp: 0,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsRemote,
      preferencesTimestamp: 0,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)
    const ids = result.bookmarks.map((b: any) => b.id).sort()
    expect(ids).toEqual(["b1", "b2", "b3"])

    const b1 = result.bookmarks.find((b: any) => b.id === "b1")!
    expect(b1.name).toBe("remote-1")
  })

  it("chooses preferences from the side with newer preferencesTimestamp", () => {
    const local: any = {
      accounts: [],
      bookmarks: [],
      accountsTimestamp: 0,
      tagStore: { version: 1, tagsById: {} },
      preferences: { ...basePrefsLocal, themeMode: "local" },
      preferencesTimestamp: 10,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: [],
      bookmarks: [],
      accountsTimestamp: 0,
      tagStore: { version: 1, tagsById: {} },
      preferences: { ...basePrefsRemote, themeMode: "remote" },
      preferencesTimestamp: 20,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)
    expect(result.preferences.themeMode).toBe("remote")
  })

  it("keeps local-only selections for the data domains owned by mergeData", () => {
    const local: any = {
      accounts: [{ id: "a1", site_name: "local-1" }],
      bookmarks: [
        {
          id: "b1",
          name: "local-bookmark",
          url: "https://local.example.com",
        },
      ],
      accountsTimestamp: 0,
      tagStore: undefined,
      preferences: { ...basePrefsLocal, themeMode: "local-only" },
      preferencesTimestamp: 10,
      apiCredentialProfiles: {
        version: 2,
        profiles: [{ id: "local-profile" }],
        lastUpdated: 10,
      },
    }

    const remote: any = {
      accounts: [
        { id: "a1", site_name: "remote-1", updated_at: 999 },
        { id: "a2", site_name: "remote-2", updated_at: 999 },
      ],
      bookmarks: [
        {
          id: "b1",
          name: "remote-bookmark",
          url: "https://remote.example.com",
          updated_at: 999,
        },
        {
          id: "b2",
          name: "remote-bookmark-2",
          url: "https://remote2.example.com",
          updated_at: 999,
        },
      ],
      accountsTimestamp: 20,
      tagStore: undefined,
      preferences: { ...basePrefsRemote, themeMode: "remote-should-not-win" },
      preferencesTimestamp: 20,
      apiCredentialProfiles: {
        version: 2,
        profiles: [{ id: "remote-profile" }],
        lastUpdated: 20,
      },
    }

    const result = mergeWebdavSyncData(local, remote, {
      accounts: false,
      bookmarks: false,
      apiCredentialProfiles: false,
      preferences: false,
    })

    expect(result.accounts).toEqual(local.accounts)
    expect(result.bookmarks).toEqual(local.bookmarks)
    expect(result.preferences).toEqual(local.preferences)
    expect(result.tagStore).toEqual(createDefaultTagStore())
    expect(result.apiCredentialProfiles).toEqual(local.apiCredentialProfiles)
  })
})
