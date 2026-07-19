import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { digestAnnouncementFingerprint } from "~/services/siteAnnouncements/identity"
import { siteAnnouncementStorage } from "~/services/siteAnnouncements/storage"
import {
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
  SITE_ANNOUNCEMENT_STATUS,
} from "~/types/siteAnnouncements"
import type { SiteAnnouncementStoreState } from "~/types/siteAnnouncements"

function getSiteAnnouncementStorageBackend() {
  return (siteAnnouncementStorage as unknown as { storage: Storage }).storage
}

function createOversizedIdentityLedger(
  readAtOffset?: number,
): SiteAnnouncementStoreState["identityLedger"] {
  const identityLedger: SiteAnnouncementStoreState["identityLedger"] = {}
  for (let siteIndex = 0; siteIndex < 11; siteIndex += 1) {
    const siteKey = `site-${siteIndex}`
    const markers: SiteAnnouncementStoreState["identityLedger"][string] = {}
    const markerCount = siteIndex === 10 ? 1001 : 1000
    for (let markerIndex = 0; markerIndex < markerCount; markerIndex += 1) {
      const value = siteIndex * 1000 + markerIndex
      markers[value.toString(16).padStart(64, "0")] = {
        firstSeenAt: value,
        lastSeenAt: value,
        ...(readAtOffset === undefined ? {} : { readAt: value + readAtOffset }),
      }
    }
    identityLedger[siteKey] = markers
  }
  return identityLedger
}

function countIdentityMarkers(
  identityLedger: SiteAnnouncementStoreState["identityLedger"],
) {
  return Object.values(identityLedger).reduce(
    (count, markers) => count + Object.keys(markers).length,
    0,
  )
}

describe("siteAnnouncementStorage", () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    const storage = new Storage({ area: "local" })
    await storage.remove(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE)
  })

  it("creates new unread records and dedupes by fingerprint", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000)

    const created = await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        siteKey: "notice:new-api:https://example.com",
        siteName: "Example",
        siteType: "new-api",
        baseUrl: "https://example.com",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
        lastCheckedAt: 1000,
        lastSuccessAt: 1000,
      },
      records: [
        {
          siteKey: "notice:new-api:https://example.com",
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.com",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: "Notice",
          content: "Hello",
          createdAt: 900,
          updatedAt: 950,
          fingerprint: "same",
        },
      ],
    })

    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      read: false,
      firstSeenAt: 1000,
      lastSeenAt: 1000,
      createdAt: 900,
      updatedAt: 950,
      fingerprint: "same",
    })

    vi.spyOn(Date, "now").mockReturnValue(2000)
    const repeated = await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        siteKey: "notice:new-api:https://example.com",
        siteName: "Example",
        siteType: "new-api",
        baseUrl: "https://example.com",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
        lastCheckedAt: 2000,
        lastSuccessAt: 2000,
      },
      records: [
        {
          siteKey: "notice:new-api:https://example.com",
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.com",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: "Notice",
          content: "Hello",
          fingerprint: "same",
        },
      ],
    })

    expect(repeated).toHaveLength(0)
    const records = await siteAnnouncementStorage.listRecords()
    expect(records).toHaveLength(1)
    expect(records[0].lastSeenAt).toBe(2000)
  })

  it.each([
    [undefined, 1234],
    [1234, undefined],
  ])(
    "coalesces duplicate fingerprints independent of provider read ordering (%s, %s)",
    async (firstReadAt, secondReadAt) => {
      const siteKey = "notice:new-api:https://example.invalid"
      const site = {
        siteKey,
        siteName: "Example",
        siteType: "new-api" as const,
        baseUrl: "https://example.invalid",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
      }
      const baseRecord = {
        siteKey: site.siteKey,
        siteName: site.siteName,
        siteType: site.siteType,
        baseUrl: site.baseUrl,
        accountId: site.accountId,
        providerId: site.providerId,
        fingerprint: "duplicate-order",
      }

      const created = await siteAnnouncementStorage.upsertDiscoveredRecords({
        site,
        records: [
          {
            ...baseRecord,
            title: "B representative",
            content: "B body",
            readAt: firstReadAt ?? undefined,
          },
          {
            ...baseRecord,
            title: "A representative",
            content: "A body",
            readAt: secondReadAt ?? undefined,
          },
        ],
        now: 100,
      })

      expect(created).toEqual([])
      await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual([
        expect.objectContaining({
          title: "A representative",
          content: "A body",
          read: true,
          readAt: 1234,
        }),
      ])
    },
  )

  it("retains identities beyond the content cache when polling in reverse order", async () => {
    vi.spyOn(Date, "now").mockReturnValue(3000)

    const created = await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        siteKey: "notice:new-api:https://example.com",
        siteName: "Example",
        siteType: "new-api",
        baseUrl: "https://example.com",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
        lastCheckedAt: 3000,
        lastSuccessAt: 3000,
      },
      records: Array.from({ length: 101 }, (_, index) => ({
        siteKey: "notice:new-api:https://example.com",
        siteName: "Example",
        siteType: "new-api",
        baseUrl: "https://example.com",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        title: `Notice ${index}`,
        content: `Hello ${index}`,
        fingerprint: `fingerprint-${index}`,
      })),
    })

    expect(created).toHaveLength(101)
    const records = await siteAnnouncementStorage.listRecords()
    expect(records).toHaveLength(100)

    const secondCreated = await siteAnnouncementStorage.upsertDiscoveredRecords(
      {
        site: {
          siteKey: "notice:new-api:https://example.com",
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.com",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          status: SITE_ANNOUNCEMENT_STATUS.Success,
          lastCheckedAt: 3000,
          lastSuccessAt: 3000,
        },
        records: Array.from({ length: 101 }, (_, index) => {
          const reversedIndex = 100 - index
          return {
            siteKey: "notice:new-api:https://example.com",
            siteName: "Example",
            siteType: "new-api" as const,
            baseUrl: "https://example.com",
            accountId: "account-1",
            providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
            title: `Notice ${reversedIndex}`,
            content: `Hello ${reversedIndex}`,
            fingerprint: `fingerprint-${reversedIndex}`,
          }
        }),
      },
    )

    expect(secondCreated).toHaveLength(0)
    const siteKey = "notice:new-api:https://example.com"
    expect(
      Object.keys(
        (await siteAnnouncementStorage.getStore()).identityLedger[siteKey]!,
      ),
    ).toHaveLength(101)

    await expect(
      siteAnnouncementStorage.markRead(records[0]!.id),
    ).resolves.toBe(true)
    await expect(siteAnnouncementStorage.markAllRead()).resolves.toBe(100)

    const afterRead = await siteAnnouncementStorage.listRecords()
    expect(afterRead.every((record) => record.read)).toBe(true)
  })

  it("marks every ledger identity read beyond the content cache", async () => {
    const siteKey = "notice:new-api:https://example.invalid"
    const site = {
      siteKey,
      siteName: "Example",
      siteType: "new-api" as const,
      baseUrl: "https://example.invalid",
      accountId: "account-1",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: SITE_ANNOUNCEMENT_STATUS.Success,
    }
    const records = Array.from({ length: 101 }, (_, index) => ({
      siteKey,
      siteName: "Example",
      siteType: "new-api" as const,
      baseUrl: "https://example.invalid",
      accountId: "account-1",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      title: `Notice ${index}`,
      content: `Body ${index}`,
      fingerprint: `mark-all-${index}`,
    }))

    await expect(
      siteAnnouncementStorage.upsertDiscoveredRecords({
        site,
        records,
        now: 100,
      }),
    ).resolves.toHaveLength(101)
    await expect(siteAnnouncementStorage.markAllRead(siteKey)).resolves.toBe(
      101,
    )
    await expect(
      siteAnnouncementStorage.upsertDiscoveredRecords({
        site,
        records,
        now: 200,
      }),
    ).resolves.toHaveLength(0)
  })

  it("preserves the read invariant without creating a notification candidate for read imports", async () => {
    const created = await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        siteKey: "notice:new-api:https://example.com",
        siteName: "Example",
        siteType: "new-api",
        baseUrl: "https://example.com",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
      },
      records: [
        {
          siteKey: "notice:new-api:https://example.com",
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.com",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: "Imported",
          content: "Body",
          fingerprint: "imported-read-at",
          readAt: 1234,
        },
      ],
    })

    expect(created).toHaveLength(0)
    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual([
      expect.objectContaining({
        read: true,
        readAt: 1234,
      }),
    ])
  })

  it("keeps an older supplied timestamp from moving marker state backward", async () => {
    const site = {
      siteKey: "notice:new-api:https://example.invalid",
      siteName: "Example",
      siteType: "new-api" as const,
      baseUrl: "https://example.invalid",
      accountId: "account-1",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: SITE_ANNOUNCEMENT_STATUS.Success,
    }
    const record = {
      siteKey: site.siteKey,
      siteName: site.siteName,
      siteType: site.siteType,
      baseUrl: site.baseUrl,
      accountId: site.accountId,
      providerId: site.providerId,
      title: "Notice",
      content: "Body",
      fingerprint: "monotonic-last-seen",
    }

    await siteAnnouncementStorage.upsertDiscoveredRecords({
      site,
      records: [record],
      now: 200,
    })
    await siteAnnouncementStorage.upsertDiscoveredRecords({
      site,
      records: [record],
      now: 100,
    })

    await expect(siteAnnouncementStorage.getStore()).resolves.toEqual(
      expect.objectContaining({
        identityLedger: expect.objectContaining({
          [site.siteKey]: expect.objectContaining({
            [await digestAnnouncementFingerprint(record.fingerprint)]:
              expect.objectContaining({ lastSeenAt: 200 }),
          }),
        }),
      }),
    )
    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual([
      expect.objectContaining({ lastSeenAt: 200 }),
    ])
  })

  it("rejects non-finite supplied timestamps", async () => {
    await expect(
      siteAnnouncementStorage.upsertDiscoveredRecords({
        site: {
          siteKey: "notice:new-api:https://example.invalid",
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.invalid",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          status: SITE_ANNOUNCEMENT_STATUS.Success,
        },
        records: [],
        now: Number.NaN,
      }),
    ).rejects.toThrow("Invalid site announcement timestamp")
  })

  it("projects a durable marker firstSeenAt onto an existing cached record", async () => {
    const storage = new Storage({ area: "local" })
    const siteKey = "notice:new-api:https://example.invalid"
    const fingerprint = "marker-projection"
    const digest = await digestAnnouncementFingerprint(fingerprint)

    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 2,
      sites: {
        [siteKey]: {
          siteKey,
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.invalid",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          status: SITE_ANNOUNCEMENT_STATUS.Success,
          records: [
            {
              id: "cached-record",
              siteKey,
              siteName: "Example",
              siteType: "new-api",
              baseUrl: "https://example.invalid",
              accountId: "account-1",
              providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
              title: "Cached",
              content: "Cached content",
              fingerprint,
              firstSeenAt: 200,
              lastSeenAt: 250,
              read: false,
            },
          ],
        },
      },
      identityLedger: {
        [siteKey]: {
          [digest]: { firstSeenAt: 100, lastSeenAt: 250 },
        },
      },
    })

    await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        siteKey,
        siteName: "Example",
        siteType: "new-api",
        baseUrl: "https://example.invalid",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
      },
      records: [
        {
          siteKey,
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.invalid",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: "Updated",
          content: "Updated content",
          fingerprint,
        },
      ],
      now: 300,
    })

    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual([
      expect.objectContaining({
        id: "cached-record",
        firstSeenAt: 100,
        lastSeenAt: 300,
        title: "Updated",
      }),
    ])
  })

  it("does not persist an exact repeated upsert", async () => {
    const site = {
      siteKey: "notice:new-api:https://example.invalid",
      siteName: "Example",
      siteType: "new-api" as const,
      baseUrl: "https://example.invalid",
      accountId: "account-1",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: SITE_ANNOUNCEMENT_STATUS.Success,
    }
    const records = [
      {
        siteKey: site.siteKey,
        siteName: site.siteName,
        siteType: site.siteType,
        baseUrl: site.baseUrl,
        accountId: site.accountId,
        providerId: site.providerId,
        title: "Notice",
        content: "Body",
        fingerprint: "exact-repeat",
      },
    ]
    const setSpy = vi.spyOn(getSiteAnnouncementStorageBackend(), "set")

    vi.spyOn(Date, "now").mockReturnValue(100)
    await siteAnnouncementStorage.upsertDiscoveredRecords({ site, records })
    setSpy.mockClear()

    await expect(
      siteAnnouncementStorage.upsertDiscoveredRecords({ site, records }),
    ).resolves.toHaveLength(0)
    expect(setSpy).not.toHaveBeenCalled()
  })

  it("surfaces persistence failures instead of returning a successful in-memory update", async () => {
    vi.spyOn(getSiteAnnouncementStorageBackend(), "set").mockRejectedValueOnce(
      new Error("disk full"),
    )

    await expect(
      siteAnnouncementStorage.upsertDiscoveredRecords({
        site: {
          siteKey: "notice:new-api:https://example.com",
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.com",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          status: SITE_ANNOUNCEMENT_STATUS.Success,
        },
        records: [
          {
            siteKey: "notice:new-api:https://example.com",
            siteName: "Example",
            siteType: "new-api",
            baseUrl: "https://example.com",
            accountId: "account-1",
            providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
            title: "Notice",
            content: "Hello",
            fingerprint: "persist-failure",
          },
        ],
      }),
    ).rejects.toThrow("Failed to persist site announcement store")

    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual([])
  })

  it("sanitizes persisted records, status values, provider ids, and schema mismatches", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 999,
      sites: {
        ignored: {
          siteKey: "ignored",
        },
      },
    })
    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual([])

    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 1,
      sites: {
        invalid: null,
        "notice:new-api:https://example.com": {
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.com",
          accountId: "account-1",
          providerId: "unknown",
          status: "mystery",
          lastCheckedAt: 200,
          lastSuccessAt: "bad",
          lastError: 123,
          lastNotifiedFingerprint: 456,
          records: [
            null,
            {
              id: "valid-record",
              siteKey: "notice:new-api:https://example.com",
              siteName: "Example",
              siteType: "new-api",
              baseUrl: "https://example.com",
              accountId: "account-1",
              providerId: "unknown",
              title: "Notice",
              content: "Hello",
              fingerprint: "valid-fingerprint",
              firstSeenAt: 123,
            },
            {
              id: "",
              siteKey: "",
              fingerprint: "",
            },
          ],
        },
      },
    })

    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual([
      expect.objectContaining({
        id: "valid-record",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        lastSeenAt: 123,
        read: false,
      }),
    ])
    await expect(siteAnnouncementStorage.getStatus()).resolves.toEqual([
      expect.objectContaining({
        siteKey: "notice:new-api:https://example.com",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Never,
        lastSuccessAt: undefined,
        lastError: undefined,
        lastNotifiedFingerprint: undefined,
      }),
    ])
  })

  it("migrates schema-v1 records into identity markers and preserves read timestamps", async () => {
    const storage = new Storage({ area: "local" })
    const siteKey = "notice:new-api:https://example.invalid"
    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 1,
      sites: {
        [siteKey]: {
          siteKey,
          records: [
            {
              id: "unread-record",
              siteKey: "wrong-site-key",
              fingerprint: "unread-fingerprint",
              firstSeenAt: 100,
              lastSeenAt: 200,
              read: false,
            },
            {
              id: "read-record",
              siteKey,
              fingerprint: "read-fingerprint",
              firstSeenAt: 300,
              lastSeenAt: 400,
              read: true,
              readAt: 350,
            },
          ],
        },
      },
    })

    const store = await siteAnnouncementStorage.getStore()
    const unreadDigest =
      await digestAnnouncementFingerprint("unread-fingerprint")
    const readDigest = await digestAnnouncementFingerprint("read-fingerprint")

    expect(store.schemaVersion).toBe(2)
    expect(store.sites[siteKey]?.records).toHaveLength(2)
    expect(store.sites[siteKey]?.records[0]?.siteKey).toBe(siteKey)
    expect(store.identityLedger[siteKey]).toEqual({
      [unreadDigest]: {
        firstSeenAt: 100,
        lastSeenAt: 200,
      },
      [readDigest]: {
        firstSeenAt: 300,
        lastSeenAt: 400,
        readAt: 350,
      },
    })
    expect(
      store.sites[siteKey]?.records.find(
        (record) => record.id === "read-record",
      ),
    ).toMatchObject({
      read: true,
      readAt: 350,
    })
  })

  it("creates identity markers before truncating an oversized schema-v1 cache", async () => {
    const storage = new Storage({ area: "local" })
    const siteKey = "notice:new-api:https://example.invalid"
    const records = Array.from({ length: 101 }, (_, index) => {
      const suffix = index.toString().padStart(3, "0")
      return {
        id: `record-${suffix}`,
        siteKey,
        fingerprint: `fingerprint-${suffix}`,
        firstSeenAt: 1,
        lastSeenAt: 1,
        read: false,
      }
    })

    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 1,
      sites: {
        [siteKey]: {
          siteKey,
          records,
        },
      },
    })

    const store = await siteAnnouncementStorage.getStore()
    const evictedDigest = await digestAnnouncementFingerprint("fingerprint-100")

    expect(store.sites[siteKey]?.records).toHaveLength(100)
    expect(store.sites[siteKey]?.records).not.toContainEqual(
      expect.objectContaining({ fingerprint: "fingerprint-100" }),
    )
    expect(Object.keys(store.identityLedger[siteKey] ?? {})).toHaveLength(101)
    expect(store.identityLedger[siteKey]?.[evictedDigest]).toEqual({
      firstSeenAt: 1,
      lastSeenAt: 1,
    })
  })

  it("normalizes non-finite site timestamps while preserving valid sibling data", async () => {
    vi.spyOn(getSiteAnnouncementStorageBackend(), "get").mockResolvedValueOnce({
      schemaVersion: 2,
      sites: {
        malformed: {
          lastCheckedAt: Number.NaN,
          lastSuccessAt: Number.POSITIVE_INFINITY,
          records: [],
        },
        valid: {
          lastCheckedAt: 200,
          lastSuccessAt: 150,
          records: [],
        },
      },
      identityLedger: {},
    })

    const store = await siteAnnouncementStorage.getStore()

    expect(store.sites.malformed).toMatchObject({
      lastCheckedAt: undefined,
      lastSuccessAt: undefined,
    })
    expect(store.sites.valid).toMatchObject({
      lastCheckedAt: 200,
      lastSuccessAt: 150,
    })
  })

  it("self-heals schema-v2 ledger and cached record read state", async () => {
    const storage = new Storage({ area: "local" })
    const siteKey = "notice:new-api:https://example.invalid"
    const forcedReadDigest = await digestAnnouncementFingerprint("forced-read")
    const missingMarkerDigest =
      await digestAnnouncementFingerprint("missing-marker")
    const enrichedReadDigest =
      await digestAnnouncementFingerprint("enriched-read")

    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 2,
      sites: {
        [siteKey]: {
          siteKey,
          records: [
            {
              id: "forced-read-record",
              siteKey,
              fingerprint: "forced-read",
              firstSeenAt: 10,
              lastSeenAt: 20,
              read: false,
            },
            {
              id: "missing-marker-record",
              siteKey,
              fingerprint: "missing-marker",
              firstSeenAt: 30,
              lastSeenAt: 40,
              read: false,
            },
            {
              id: "enriched-read-record",
              siteKey,
              fingerprint: "enriched-read",
              firstSeenAt: 50,
              lastSeenAt: 60,
              read: true,
            },
          ],
        },
      },
      identityLedger: {
        [siteKey]: {
          [forcedReadDigest]: {
            firstSeenAt: 5,
            lastSeenAt: 15,
            readAt: 12,
          },
          [enrichedReadDigest]: {
            firstSeenAt: 45,
            lastSeenAt: 55,
          },
          invalid: {
            firstSeenAt: 1,
            lastSeenAt: Number.POSITIVE_INFINITY,
          },
        },
        malformed: null,
      },
    })

    const store = await siteAnnouncementStorage.getStore()

    expect(store.sites[siteKey]?.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "forced-read-record",
          read: true,
          readAt: 12,
        }),
        expect.objectContaining({
          id: "missing-marker-record",
          read: false,
        }),
        expect.objectContaining({
          id: "enriched-read-record",
          read: true,
          readAt: 60,
        }),
      ]),
    )
    expect(store.identityLedger[siteKey]).toEqual({
      [forcedReadDigest]: {
        firstSeenAt: 5,
        lastSeenAt: 20,
        readAt: 12,
      },
      [missingMarkerDigest]: {
        firstSeenAt: 30,
        lastSeenAt: 40,
      },
      [enrichedReadDigest]: {
        firstSeenAt: 45,
        lastSeenAt: 60,
        readAt: 60,
      },
    })
  })

  it("drops malformed identity keys while retaining valid sibling entries", async () => {
    const storage = new Storage({ area: "local" })
    const validDigest = await digestAnnouncementFingerprint("valid")
    const siblingDigest = await digestAnnouncementFingerprint("sibling")
    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 2,
      sites: {
        site: { records: [] },
        sibling: { records: [] },
      },
      identityLedger: {
        "": {
          [validDigest]: { firstSeenAt: 1, lastSeenAt: 2 },
        },
        site: {
          [validDigest]: { firstSeenAt: 3, lastSeenAt: 4 },
          ["A".repeat(64)]: { firstSeenAt: 5, lastSeenAt: 6 },
          short: { firstSeenAt: 7, lastSeenAt: 8 },
        },
        sibling: {
          [siblingDigest]: { firstSeenAt: 9, lastSeenAt: 10 },
        },
      },
    })

    const store = await siteAnnouncementStorage.getStore()

    expect(store.identityLedger).toEqual({
      site: {
        [validDigest]: { firstSeenAt: 3, lastSeenAt: 4 },
      },
      sibling: {
        [siblingDigest]: { firstSeenAt: 9, lastSeenAt: 10 },
      },
    })
  })

  it("keeps non-finite record timestamps out of the sanitized store", async () => {
    const storage = new Storage({ area: "local" })
    vi.spyOn(Date, "now").mockReturnValue(500)
    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 1,
      sites: {
        site: {
          records: [
            {
              id: "record",
              siteKey: "site",
              fingerprint: "fingerprint",
              firstSeenAt: Number.NaN,
              lastSeenAt: Number.POSITIVE_INFINITY,
              createdAt: Number.NaN,
              updatedAt: Number.NEGATIVE_INFINITY,
              notifiedAt: Number.POSITIVE_INFINITY,
              readAt: Number.NaN,
            },
          ],
        },
      },
    })

    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual([
      expect.objectContaining({
        firstSeenAt: 500,
        lastSeenAt: 500,
        createdAt: undefined,
        updatedAt: undefined,
        notifiedAt: undefined,
        readAt: undefined,
      }),
    ])
  })

  it.each([
    {
      name: "storage get rejection",
      stored: new Error("read failed"),
      rejects: true,
      message: "read failed",
    },
    {
      name: "unsupported schema",
      stored: { schemaVersion: 999, sites: {} },
      rejects: false,
      message: "Unsupported site announcement store schema",
    },
    {
      name: "malformed root data",
      stored: "malformed",
      rejects: false,
      message: "Malformed site announcement store",
    },
    {
      name: "missing sites container",
      stored: { schemaVersion: 2, identityLedger: {} },
      rejects: false,
      message: "Malformed site announcement store",
    },
    {
      name: "malformed sites container",
      stored: { schemaVersion: 1, sites: "malformed" },
      rejects: false,
      message: "Malformed site announcement store",
    },
  ])("rejects mutations without writes after $name", async (scenario) => {
    const storageApi = getSiteAnnouncementStorageBackend()
    const setSpy = vi.spyOn(storageApi, "set")
    const getSpy = vi.spyOn(storageApi, "get")
    if (scenario.rejects) {
      getSpy.mockRejectedValueOnce(scenario.stored)
    } else {
      getSpy.mockResolvedValueOnce(scenario.stored)
    }

    await expect(siteAnnouncementStorage.markAllRead()).rejects.toThrow(
      scenario.message,
    )
    expect(setSpy).not.toHaveBeenCalled()
  })

  it("rejects empty notification updates without writes after an invalid source", async () => {
    const storageApi = getSiteAnnouncementStorageBackend()
    const setSpy = vi.spyOn(storageApi, "set")
    vi.spyOn(storageApi, "get").mockResolvedValueOnce({
      schemaVersion: 999,
      sites: {},
    })

    await expect(
      siteAnnouncementStorage.updateNotificationState("site", [], {
        notifiedAt: 3,
      }),
    ).rejects.toThrow("Unsupported site announcement store schema")
    expect(setSpy).not.toHaveBeenCalled()
  })

  it("rejects mutations without writes when identity digesting fails", async () => {
    const storageApi = getSiteAnnouncementStorageBackend()
    await storageApi.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 1,
      sites: {
        site: {
          records: [
            {
              id: "record",
              siteKey: "site",
              fingerprint: "fingerprint",
              firstSeenAt: 1,
              lastSeenAt: 2,
            },
          ],
        },
      },
    })
    const setSpy = vi.spyOn(storageApi, "set")
    vi.spyOn(crypto.subtle, "digest").mockRejectedValueOnce(
      new Error("digest failed"),
    )

    await expect(siteAnnouncementStorage.markAllRead()).rejects.toThrow(
      "digest failed",
    )
    expect(setSpy).not.toHaveBeenCalled()
  })

  it("returns an empty schema-v2 store when the storage key is missing", async () => {
    await expect(siteAnnouncementStorage.getStore()).resolves.toEqual({
      schemaVersion: 2,
      sites: {},
      identityLedger: {},
    })
  })

  it("does not persist mutation no-ops", async () => {
    const storageApi = getSiteAnnouncementStorageBackend()
    const siteKey = "notice:new-api:https://example.invalid"
    const digest = await digestAnnouncementFingerprint("already-read")
    await storageApi.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 2,
      sites: {
        [siteKey]: {
          siteKey,
          records: [
            {
              id: "already-read-record",
              siteKey,
              fingerprint: "already-read",
              firstSeenAt: 1,
              lastSeenAt: 2,
              read: true,
              readAt: 2,
            },
          ],
        },
      },
      identityLedger: {
        [siteKey]: {
          [digest]: { firstSeenAt: 1, lastSeenAt: 2, readAt: 2 },
        },
      },
    })
    const setSpy = vi.spyOn(storageApi, "set")

    await expect(siteAnnouncementStorage.markRead("missing")).resolves.toBe(
      false,
    )
    await expect(
      siteAnnouncementStorage.markRead("already-read-record"),
    ).resolves.toBe(false)
    await expect(
      siteAnnouncementStorage.markAllRead("missing-site"),
    ).resolves.toBe(0)
    await expect(siteAnnouncementStorage.markAllRead(siteKey)).resolves.toBe(0)
    await siteAnnouncementStorage.updateNotificationState(siteKey, [], {
      notifiedAt: 3,
    })
    await siteAnnouncementStorage.updateNotificationState(
      siteKey,
      ["missing"],
      { notifiedAt: 3 },
    )

    expect(setSpy).not.toHaveBeenCalled()
  })

  it("returns empty state when persisted storage cannot be read", async () => {
    vi.spyOn(getSiteAnnouncementStorageBackend(), "get").mockRejectedValue(
      new Error("read failed"),
    )

    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual([])
    await expect(siteAnnouncementStorage.getStatus()).resolves.toEqual([])
  })

  it("updates notification state only for matching records and stores the last notified fingerprint", async () => {
    await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        siteKey: "notice:new-api:https://example.com",
        siteName: "Example",
        siteType: "new-api",
        baseUrl: "https://example.com",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
      },
      records: [
        {
          siteKey: "notice:new-api:https://example.com",
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.com",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: "First",
          content: "One",
          fingerprint: "fp-1",
        },
        {
          siteKey: "notice:new-api:https://example.com",
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.com",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: "Second",
          content: "Two",
          fingerprint: "fp-2",
        },
      ],
      now: 100,
    })

    const [latest, older] = await siteAnnouncementStorage.listRecords()
    await siteAnnouncementStorage.updateNotificationState(
      "notice:new-api:https://example.com",
      [latest!.id],
      {
        notifiedAt: 555,
        notificationError: "blocked",
      },
    )
    await siteAnnouncementStorage.updateNotificationState(
      "missing-site",
      [latest!.id],
      {
        notifiedAt: 999,
      },
    )
    await siteAnnouncementStorage.updateNotificationState(
      "notice:new-api:https://example.com",
      [],
      {
        notifiedAt: 999,
      },
    )

    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual([
      expect.objectContaining({
        id: latest!.id,
        notifiedAt: 555,
        notificationError: "blocked",
      }),
      expect.objectContaining({
        id: older!.id,
        notifiedAt: undefined,
      }),
    ])
    await expect(siteAnnouncementStorage.getStatus()).resolves.toEqual([
      expect.objectContaining({
        lastNotifiedFingerprint: latest!.fingerprint,
      }),
    ])
  })

  it("returns false for unknown records and scopes mark-all-read to the requested site", async () => {
    await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        siteKey: "site-a",
        siteName: "Site A",
        siteType: "new-api",
        baseUrl: "https://a.example.com",
        accountId: "account-a",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
      },
      records: [
        {
          siteKey: "site-a",
          siteName: "Site A",
          siteType: "new-api",
          baseUrl: "https://a.example.com",
          accountId: "account-a",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: "A",
          content: "Body A",
          fingerprint: "site-a-record",
        },
      ],
    })
    await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        siteKey: "site-b",
        siteName: "Site B",
        siteType: "new-api",
        baseUrl: "https://b.example.com",
        accountId: "account-b",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
      },
      records: [
        {
          siteKey: "site-b",
          siteName: "Site B",
          siteType: "new-api",
          baseUrl: "https://b.example.com",
          accountId: "account-b",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: "B",
          content: "Body B",
          fingerprint: "site-b-record",
        },
      ],
    })

    await expect(siteAnnouncementStorage.markRead("missing")).resolves.toBe(
      false,
    )
    await expect(
      siteAnnouncementStorage.markAllRead("missing-site"),
    ).resolves.toBe(0)
    await expect(siteAnnouncementStorage.markAllRead("site-a")).resolves.toBe(1)

    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          siteKey: "site-a",
          read: true,
        }),
        expect.objectContaining({
          siteKey: "site-b",
          read: false,
        }),
      ]),
    )
  })

  it("bounds an oversized ledger when a status mutation changes the store", async () => {
    const storage = new Storage({ area: "local" })
    const identityLedger = createOversizedIdentityLedger()

    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 2,
      sites: {},
      identityLedger,
    })
    await siteAnnouncementStorage.upsertSiteStatus({
      siteKey: "site-0",
      siteName: "Site 0",
      siteType: "new-api",
      baseUrl: "https://example.invalid",
      accountId: "account-0",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: SITE_ANNOUNCEMENT_STATUS.Success,
    })

    const store = await siteAnnouncementStorage.getStore()
    const total = countIdentityMarkers(store.identityLedger)
    expect(total).toBe(10_000)
    expect(Object.keys(store.identityLedger["site-0"] ?? {})).toHaveLength(0)
    expect(Object.keys(store.identityLedger["site-1"] ?? {})).toHaveLength(1000)
    expect(Object.keys(store.identityLedger["site-10"] ?? {})).toHaveLength(
      1000,
    )
    expect(
      store.identityLedger["site-10"]?.[
        (10_000).toString(16).padStart(64, "0")
      ],
    ).toBeUndefined()
    expect(
      store.identityLedger["site-10"]?.[
        (10_001).toString(16).padStart(64, "0")
      ],
    ).toBeDefined()
  })

  it("prunes an oversized all-read ledger during a no-op mark-all mutation", async () => {
    const storage = new Storage({ area: "local" })
    const identityLedger = createOversizedIdentityLedger(1)

    await storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, {
      schemaVersion: 2,
      sites: {},
      identityLedger,
    })
    const setSpy = vi.spyOn(getSiteAnnouncementStorageBackend(), "set")

    await expect(siteAnnouncementStorage.markAllRead()).resolves.toBe(0)
    expect(setSpy).toHaveBeenCalledTimes(1)
    const firstPersistedStore = setSpy.mock.calls[0]?.[1] as
      | SiteAnnouncementStoreState
      | undefined
    expect(firstPersistedStore).toBeDefined()
    const firstPersistedTotal = countIdentityMarkers(
      firstPersistedStore!.identityLedger,
    )
    expect(firstPersistedTotal).toBe(10_000)
    expect(
      Object.keys(firstPersistedStore!.identityLedger["site-10"] ?? {}),
    ).toHaveLength(1000)

    setSpy.mockClear()
    await expect(siteAnnouncementStorage.markAllRead()).resolves.toBe(0)
    expect(setSpy).not.toHaveBeenCalled()
  })

  it("preserves discovered records when updating status", async () => {
    const siteKey = "notice:new-api:https://example.invalid"
    await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        siteKey,
        siteName: "Example",
        siteType: "new-api",
        baseUrl: "https://example.invalid",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
      },
      records: [
        {
          siteKey,
          siteName: "Example",
          siteType: "new-api",
          baseUrl: "https://example.invalid",
          accountId: "account-1",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: "Notice",
          content: "Body",
          fingerprint: "status-preserves-record",
        },
      ],
    })

    await siteAnnouncementStorage.upsertSiteStatus({
      siteKey,
      siteName: "Example",
      siteType: "new-api",
      baseUrl: "https://example.invalid",
      accountId: "account-1",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: SITE_ANNOUNCEMENT_STATUS.Error,
    })

    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual([
      expect.objectContaining({ fingerprint: "status-preserves-record" }),
    ])
  })

  it("swallows record-failure persistence errors after logging the warning path", async () => {
    vi.spyOn(siteAnnouncementStorage, "upsertSiteStatus").mockRejectedValueOnce(
      new Error("write failed"),
    )

    await expect(
      siteAnnouncementStorage.recordFailure({
        siteKey: "notice:new-api:https://example.com",
        siteName: "Example",
        siteType: "new-api",
        baseUrl: "https://example.com",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Error,
        error: "boom",
      }),
    ).resolves.toBeUndefined()
  })
})
