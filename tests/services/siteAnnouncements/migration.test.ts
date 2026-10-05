import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { digestAnnouncementFingerprint } from "~/services/siteAnnouncements/identity"
import { siteAnnouncementStorage } from "~/services/siteAnnouncements/storage"

const key = "account:sub2api:a:https://example.com"
const oldKey = "sub2api:a:https://example.com"

/** Builds a legacy store containing both cached and evicted read identities. */
async function legacyStore(schemaVersion = 2) {
  const digest = await digestAnnouncementFingerprint("message-1")
  const evictedDigest = await digestAnnouncementFingerprint("evicted")
  const site = {
    siteKey: oldKey,
    siteName: "Example",
    siteType: "sub2api",
    accountId: "a",
    baseUrl: "https://example.com",
    providerId: "sub2api",
    status: "success",
    lastCheckedAt: 200,
    lastSuccessAt: 200,
    lastNotifiedFingerprint: "message-1",
  }
  const record = {
    ...site,
    id: "keep-record-id",
    upstreamId: "1",
    title: "Notice",
    content: "Body",
    fingerprint: "message-1",
    firstSeenAt: 100,
    lastSeenAt: 200,
    read: true,
    readAt: 150,
    notifiedAt: 160,
  }
  return {
    schemaVersion,
    sites: { [oldKey]: { ...site, records: [record] } },
    identityLedger: {
      [oldKey]: {
        [digest]: { firstSeenAt: 100, lastSeenAt: 200, readAt: 150 },
        [evictedDigest]: { firstSeenAt: 50, lastSeenAt: 180, readAt: 70 },
      },
    },
  }
}

describe("announcement source storage migration", () => {
  const storage = new Storage({ area: "local" })
  beforeEach(async () => {
    vi.restoreAllMocks()
    await storage.remove(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE)
  })

  it.each([1, 2])(
    "migrates schema %s into scope identities preserving record and read state",
    async (version) => {
      await storage.set(
        STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE,
        await legacyStore(version),
      )
      const result = await siteAnnouncementStorage.getStore()
      expect(result.schemaVersion).toBe(3)
      expect(result.sites[oldKey]).toBeUndefined()
      expect(result.sites[key]).toMatchObject({
        sourceScope: "account",
        lastCheckedAt: 200,
        lastSuccessAt: 200,
      })
      expect(result.sites[key]!.records).toEqual([
        expect.objectContaining({
          id: "keep-record-id",
          siteKey: key,
          sourceScope: "account",
          read: true,
          readAt: 150,
          notifiedAt: 160,
        }),
      ])
      expect(result.sites[key]).not.toHaveProperty("providerId")
      expect(result.sites[key]!.records[0]).not.toHaveProperty("providerId")
      expect(result.identityLedger[oldKey]).toBeUndefined()
      if (version === 2)
        expect(Object.keys(result.identityLedger[key]!)).toHaveLength(2)
    },
  )

  it("does not rediscover migrated cached or evicted messages and persists only the new schema", async () => {
    await storage.set(
      STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE,
      await legacyStore(),
    )
    const result = await siteAnnouncementStorage.getStore()
    const { records, ...site } = result.sites[key]!
    const input = {
      ...records[0]!,
      sourceScope: "account" as const,
      read: false,
      readAt: undefined,
    }
    expect(
      await siteAnnouncementStorage.upsertDiscoveredRecords({
        site,
        records: [input, { ...input, fingerprint: "evicted", upstreamId: "2" }],
        now: 300,
      }),
    ).toEqual([])
    const persisted = await storage.get<any>(
      STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE,
    )
    expect(persisted.schemaVersion).toBe(3)
    expect(Object.keys(persisted.sites)).toEqual([key])
    expect(persisted.sites[key].records).toHaveLength(2)
    expect(persisted.sites[key].records.every((item: any) => item.read)).toBe(
      true,
    )
    expect(JSON.stringify(persisted)).not.toContain('"providerId"')
  })

  it.each([false, true])(
    "merges colliding source identities preserving legacy record ids (reversed: %s)",
    async (reversed) => {
      const legacy = await legacyStore()
      const digest = await digestAnnouncementFingerprint("message-1")
      const old = legacy.sites[oldKey]!
      const newSite = {
        ...old,
        siteKey: key,
        sourceScope: "account",
        lastCheckedAt: 250,
        records: [
          {
            ...old.records[0]!,
            id: "duplicate-record-id",
            siteKey: key,
            read: false,
            readAt: undefined,
            lastSeenAt: 250,
          },
        ],
      }
      await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
        ...legacy,
        sites: reversed
          ? { [key]: newSite, ...legacy.sites }
          : { ...legacy.sites, [key]: newSite },
        identityLedger: {
          ...legacy.identityLedger,
          [key]: {
            [digest]: { firstSeenAt: 120, lastSeenAt: 250 },
          },
        },
      })
      const result = await siteAnnouncementStorage.getStore()
      expect(result.sites[key]!.records).toHaveLength(1)
      expect(result.sites[key]!.lastCheckedAt).toBe(250)
      expect(result.sites[key]!.records[0]).toMatchObject({
        id: "keep-record-id",
        read: true,
        readAt: 150,
        firstSeenAt: 100,
        lastSeenAt: 250,
      })
      expect(result.identityLedger[key]![digest]).toMatchObject({
        firstSeenAt: 100,
        lastSeenAt: 250,
        readAt: 150,
      })
      expect(Object.keys(result.identityLedger[key]!)).toHaveLength(2)
    },
  )

  it("migrates public keys and ledger-only Sub2API sources without changing account isolation", async () => {
    const marker = { firstSeenAt: 100, lastSeenAt: 200, readAt: 150 }
    const digest = await digestAnnouncementFingerprint("evicted")
    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 2,
      sites: {
        "notice:new-api:https://example.com": {
          records: [],
          providerId: "common",
        },
      },
      identityLedger: {
        "notice:new-api:https://example.com": { [digest]: marker },
        [oldKey]: { [digest]: marker },
        "sub2api:b:https://example.com": {
          [digest]: { ...marker, readAt: 180 },
        },
      },
    })
    const result = await siteAnnouncementStorage.getStore()
    expect(result.sites["site:new-api:https://example.com"]).toMatchObject({
      sourceScope: "site",
    })
    expect(result.identityLedger[key]![digest]).toEqual(marker)
    expect(
      result.identityLedger["account:sub2api:b:https://example.com"]![digest]!
        .readAt,
    ).toBe(180)
  })

  it("retains the newest legacy status and content when colliding current data is older", async () => {
    const legacy = await legacyStore()
    const original = legacy.sites[oldKey]!
    const newer = {
      ...original,
      lastCheckedAt: 400,
      records: [
        {
          ...original.records[0]!,
          lastSeenAt: 400,
          content: "Newer legacy content",
        },
      ],
    }
    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      ...legacy,
      sites: {
        "notice:new-api:https://other.example.com": {
          ...original,
          siteKey: "notice:new-api:https://other.example.com",
          baseUrl: "https://other.example.com",
          siteType: "new-api",
          providerId: "common",
          records: [],
        },
        [key]: {
          ...original,
          siteKey: key,
          sourceScope: "account",
          lastCheckedAt: 250,
          records: [
            {
              ...original.records[0]!,
              id: "current-id",
              siteKey: key,
              lastSeenAt: 250,
            },
          ],
        },
        [oldKey]: newer,
      },
    })
    const result = await siteAnnouncementStorage.getStore()
    expect(result.sites[key]).toMatchObject({
      lastCheckedAt: 400,
      records: [
        expect.objectContaining({
          id: "keep-record-id",
          content: "Newer legacy content",
          lastSeenAt: 400,
        }),
      ],
    })
    expect(
      result.sites["site:new-api:https://other.example.com"],
    ).toMatchObject({ sourceScope: "site" })
  })

  it("keeps reads side-effect free and commits an otherwise no-op migration once", async () => {
    const legacy = await legacyStore()
    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, legacy)
    const backend = (siteAnnouncementStorage as any).storage as Storage
    const set = vi.spyOn(backend, "set")
    await siteAnnouncementStorage.getStore()
    expect(set).not.toHaveBeenCalled()
    await siteAnnouncementStorage.removeSites(["missing"])
    expect(set).toHaveBeenCalledTimes(1)
    set.mockClear()
    await siteAnnouncementStorage.removeSites(["missing"])
    expect(set).not.toHaveBeenCalled()
  })

  it("leaves legacy bytes untouched when migration cannot persist", async () => {
    const legacy = await legacyStore()
    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, legacy)
    vi.spyOn(
      (siteAnnouncementStorage as any).storage,
      "set",
    ).mockRejectedValueOnce(new Error("write failed"))
    await expect(
      siteAnnouncementStorage.removeSites(["missing"]),
    ).rejects.toThrow("Failed to persist")
    expect(await storage.get(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE)).toEqual(
      legacy,
    )
  })
})
