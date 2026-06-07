import { beforeEach, describe, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION } from "~/services/productAnnouncements/constants"
import { productAnnouncementStorage } from "~/services/productAnnouncements/storage"

const storage = new Storage({ area: "local" })

describe("product announcement storage", () => {
  beforeEach(async () => {
    await storage.remove(STORAGE_KEYS.PRODUCT_ANNOUNCEMENTS_STATE)
  })

  it("returns an empty sanitized state by default", async () => {
    await expect(productAnnouncementStorage.getState()).resolves.toEqual({
      schemaVersion: 1,
      dismissed: {},
      seenAt: {},
      lastShownAt: {},
    })
  })

  it("persists cached feed, seen state, and dismissed revisions", async () => {
    await productAnnouncementStorage.updateState((state) => {
      state.lastFetchedAt = 100
      state.cachedFeed = {
        schemaVersion: PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION,
        defaultLocale: "zh-CN",
        announcements: [],
      }
      state.seenAt.notice = 200
      state.dismissed.notice = 1
    })

    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      lastFetchedAt: 100,
      cachedFeed: {
        schemaVersion: PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION,
        defaultLocale: "zh-CN",
        announcements: [],
      },
      seenAt: { notice: 200 },
      dismissed: { notice: 1 },
    })
  })

  it("sanitizes persisted number records and keeps state across feed schema changes", async () => {
    await storage.set(STORAGE_KEYS.PRODUCT_ANNOUNCEMENTS_STATE, {
      schemaVersion: 1,
      dismissed: {
        " notice-a ": 1,
        "   ": 2,
        noticeB: "3",
      },
      seenAt: {
        " notice-a ": 100,
        noticeB: Number.NaN,
      },
      lastShownAt: {
        " notice-c ": 200,
        noticeD: Number.POSITIVE_INFINITY,
      },
      cachedFeed: {
        schemaVersion: 999,
        defaultLocale: "zh-CN",
        announcements: [],
      },
    })

    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      schemaVersion: 1,
      dismissed: { "notice-a": 1 },
      seenAt: { "notice-a": 100 },
      lastShownAt: { "notice-c": 200 },
      cachedFeed: {
        schemaVersion: 999,
        defaultLocale: "zh-CN",
        announcements: [],
      },
    })
  })
})
