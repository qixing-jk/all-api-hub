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
})
