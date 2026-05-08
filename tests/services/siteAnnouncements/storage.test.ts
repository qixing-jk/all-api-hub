import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { siteAnnouncementStorage } from "~/services/siteAnnouncements/storage"
import {
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
  SITE_ANNOUNCEMENT_STATUS,
} from "~/types/siteAnnouncements"

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

  it("keeps only the latest ten records per site and marks read state", async () => {
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
      records: Array.from({ length: 11 }, (_, index) => ({
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

    expect(created).toHaveLength(11)
    const records = await siteAnnouncementStorage.listRecords()
    expect(records).toHaveLength(10)
    expect(
      records.some((record) => record.fingerprint === "fingerprint-0"),
    ).toBe(false)

    await expect(
      siteAnnouncementStorage.markRead(records[0]!.id),
    ).resolves.toBe(true)
    await expect(siteAnnouncementStorage.markAllRead()).resolves.toBe(9)

    const afterRead = await siteAnnouncementStorage.listRecords()
    expect(afterRead.every((record) => record.read)).toBe(true)
  })

  it("preserves the read invariant when imported records already include readAt", async () => {
    const [created] = await siteAnnouncementStorage.upsertDiscoveredRecords({
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

    expect(created).toMatchObject({
      read: true,
      readAt: 1234,
    })
  })

  it("surfaces persistence failures instead of returning a successful in-memory update", async () => {
    vi.spyOn(
      (siteAnnouncementStorage as any).storage,
      "set",
    ).mockRejectedValueOnce(new Error("disk full"))

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

  it("returns empty state when persisted storage cannot be read", async () => {
    vi.spyOn((siteAnnouncementStorage as any).storage, "get").mockRejectedValue(
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
