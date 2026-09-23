import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { SITE_TYPES } from "~/constants/siteType"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  clearDevSiteAnnouncementFixtures,
  resolveSiteAnnouncementsDebugClearFixturesMessage,
  resolveSiteAnnouncementsDebugSeedFixturesMessage,
  seedDevSiteAnnouncementFixtures,
} from "~/services/siteAnnouncements/devFixtures"
import { siteAnnouncementStorage } from "~/services/siteAnnouncements/storage"
import {
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
  SITE_ANNOUNCEMENT_STATUS,
} from "~/types/siteAnnouncements"

const REAL_SITE_KEY = "notice:new-api:https://example.invalid"
const REAL_RECORD_FINGERPRINT = "real-record"

/** Seeds one non-fixture site so fixture cleanup can be checked against it. */
async function seedRealAnnouncement() {
  await siteAnnouncementStorage.upsertDiscoveredRecords({
    site: {
      siteKey: REAL_SITE_KEY,
      siteName: "Example",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://example.invalid",
      accountId: "account-1",
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
      status: SITE_ANNOUNCEMENT_STATUS.Success,
    },
    records: [
      {
        siteKey: REAL_SITE_KEY,
        siteName: "Example",
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://example.invalid",
        accountId: "account-1",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        title: "Real notice",
        content: "Body",
        fingerprint: REAL_RECORD_FINGERPRINT,
      },
    ],
  })
}

describe("site announcement dev fixtures", () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    await new Storage({ area: "local" }).remove(
      STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE,
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("seeds the requested number of announcements as fixture sites", async () => {
    const seeded = await seedDevSiteAnnouncementFixtures({
      announcementCount: 25,
    })

    expect(seeded.records).toBe(25)
    expect(seeded.sites).toBe(3)

    const sites = await siteAnnouncementStorage.getStatus()
    expect(sites).toHaveLength(3)
    expect(sites.every((site) => site.records.length > 0)).toBe(true)
  })

  it("keeps re-seeding idempotent instead of duplicating fixtures", async () => {
    await seedDevSiteAnnouncementFixtures({ announcementCount: 25 })
    const reseeded = await seedDevSiteAnnouncementFixtures({
      announcementCount: 25,
    })

    expect(reseeded.records).toBe(25)
    expect(await siteAnnouncementStorage.listRecords()).toHaveLength(25)
  })

  it("bounds a fixture seed to what the store retains", async () => {
    const seeded = await seedDevSiteAnnouncementFixtures({
      announcementCount: 5_000,
    })

    expect(seeded.records).toBe(300)
    expect(seeded.records).toBe(
      (await siteAnnouncementStorage.listRecords()).length,
    )
  })

  it("seeds failing and unsupported fixture sites without announcements", async () => {
    const seeded = await seedDevSiteAnnouncementFixtures({
      announcementCount: 0,
      failedSiteCount: 20,
      unsupportedSiteCount: 2,
    })

    expect(seeded).toEqual({ sites: 22, records: 0 })

    const sites = await siteAnnouncementStorage.getStatus()
    expect(
      sites.filter((site) => site.status === SITE_ANNOUNCEMENT_STATUS.Error),
    ).toHaveLength(20)
    expect(
      sites.filter(
        (site) => site.status === SITE_ANNOUNCEMENT_STATUS.Unsupported,
      ),
    ).toHaveLength(2)
    expect(
      sites
        .filter((site) => site.status === SITE_ANNOUNCEMENT_STATUS.Error)
        .every((site) => Boolean(site.lastError)),
    ).toBe(true)
  })

  it("clears fixture sites and keeps real announcements cached", async () => {
    await seedRealAnnouncement()
    await seedDevSiteAnnouncementFixtures({
      announcementCount: 25,
      failedSiteCount: 2,
      unsupportedSiteCount: 1,
    })

    const cleared = await clearDevSiteAnnouncementFixtures()

    expect(cleared).toEqual({ sites: 6, records: 25 })
    await expect(siteAnnouncementStorage.getStatus()).resolves.toEqual([
      expect.objectContaining({ siteKey: REAL_SITE_KEY }),
    ])
    await expect(siteAnnouncementStorage.listRecords()).resolves.toEqual([
      expect.objectContaining({ fingerprint: REAL_RECORD_FINGERPRINT }),
    ])
  })

  it("routes the seed request through the typed message in development mode", async () => {
    vi.stubEnv("MODE", "development")

    const response = await resolveSiteAnnouncementsDebugSeedFixturesMessage({
      announcementCount: 30,
      failedSiteCount: 4,
      unsupportedSiteCount: 2,
    })

    expect(response).toEqual({
      success: true,
      data: { sites: 9, records: 30 },
    })
  })

  it("rejects debug messages outside development mode", async () => {
    vi.stubEnv("MODE", "production")

    await expect(
      resolveSiteAnnouncementsDebugSeedFixturesMessage({
        announcementCount: 5,
      }),
    ).resolves.toEqual({
      success: false,
      error: "Debug action unavailable",
    })
    await expect(
      resolveSiteAnnouncementsDebugClearFixturesMessage(),
    ).resolves.toEqual({
      success: false,
      error: "Debug action unavailable",
    })
    await expect(siteAnnouncementStorage.getStatus()).resolves.toEqual([])
  })

  it("reports an exception through the typed message when seeding fails", async () => {
    vi.stubEnv("MODE", "development")
    vi.spyOn(siteAnnouncementStorage, "getStatus").mockRejectedValue(
      new Error("storage unavailable"),
    )

    await expect(
      resolveSiteAnnouncementsDebugSeedFixturesMessage({
        announcementCount: 5,
      }),
    ).resolves.toEqual({
      success: false,
      error: "storage unavailable",
    })
  })
})
