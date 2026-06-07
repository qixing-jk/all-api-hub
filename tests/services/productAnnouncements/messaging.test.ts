import { beforeEach, describe, expect, it, vi } from "vitest"

import { PRODUCT_ANNOUNCEMENT_REMOTE_URL } from "~/services/productAnnouncements/constants"
import {
  productAnnouncementService,
  resolveProductAnnouncementDismissMessage,
  resolveProductAnnouncementGetStateMessage,
  resolveProductAnnouncementMarkSeenMessage,
  resolveProductAnnouncementRefreshMessage,
  resolveProductAnnouncementRestoreMessage,
} from "~/services/productAnnouncements/service"
import { productAnnouncementStorage } from "~/services/productAnnouncements/storage"

const fetchMock = vi.fn()

function resetProductAnnouncementServiceState() {
  ;(productAnnouncementService as any).isInitialized = false
  ;(productAnnouncementService as any).refreshPromise = null
}

describe("product announcement runtime message resolvers", () => {
  beforeEach(async () => {
    resetProductAnnouncementServiceState()
    vi.clearAllMocks()
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        defaultLocale: "zh-CN",
        announcements: [],
      }),
    })
    await productAnnouncementStorage.setState({
      schemaVersion: 1,
      dismissed: {},
      seenAt: {},
      lastShownAt: {},
    })
  })

  it("returns current state response", async () => {
    const response = await resolveProductAnnouncementGetStateMessage({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })

    expect(response.success).toBe(true)
    expect(response.success ? response.data.view.notices : []).toEqual([])
    await vi.waitFor(() => {
      expect((productAnnouncementService as any).refreshPromise).toBeNull()
    })
  })

  it("handles refresh, seen, dismiss, and restore messages", async () => {
    await expect(resolveProductAnnouncementRefreshMessage()).resolves.toEqual({
      success: true,
      data: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(PRODUCT_ANNOUNCEMENT_REMOTE_URL, {
      cache: "no-store",
    })
    await expect(
      resolveProductAnnouncementMarkSeenMessage({
        ids: [" notice-a "],
        now: 1,
      }),
    ).resolves.toEqual({ success: true, data: undefined })
    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      seenAt: { "notice-a": 1 },
    })
    await expect(
      resolveProductAnnouncementDismissMessage({
        id: " notice-a ",
        revision: 1,
      }),
    ).resolves.toEqual({ success: true, data: undefined })
    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      dismissed: { "notice-a": 1 },
    })
    await expect(
      resolveProductAnnouncementRestoreMessage({
        id: " notice-a ",
      }),
    ).resolves.toEqual({ success: true, data: undefined })
    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      dismissed: {},
    })
  })

  it("returns failure responses for malformed get-state messages", async () => {
    for (const request of [
      undefined,
      null,
      "zh-CN",
      {},
      { locale: "" },
      { locale: "   " },
      { locale: 1 },
      { locale: "zh-CN", currentVersion: 3.44 },
      { locale: "zh-CN", now: Number.NaN },
      { locale: "zh-CN", now: Number.POSITIVE_INFINITY },
      { locale: "zh-CN", now: "2026-06-06" },
    ]) {
      await expect(
        resolveProductAnnouncementGetStateMessage(request as any),
      ).resolves.toEqual({
        success: false,
        error: "Invalid product announcement state request",
      })
    }
  })

  it("returns failure responses for malformed mark-seen messages", async () => {
    for (const request of [
      undefined,
      null,
      "notice-a",
      {},
      { ids: "notice-a" },
      { ids: [] },
      { ids: [""] },
      { ids: ["   "] },
      { ids: ["notice-a", 1] },
      { ids: ["notice-a"], now: Number.NaN },
      { ids: ["notice-a"], now: Number.NEGATIVE_INFINITY },
      { ids: ["notice-a"], now: "1" },
    ]) {
      await expect(
        resolveProductAnnouncementMarkSeenMessage(request as any),
      ).resolves.toEqual({
        success: false,
        error: "Invalid product announcement mark-seen request",
      })
    }
  })

  it("returns failure responses for malformed dismiss messages", async () => {
    for (const request of [
      undefined,
      null,
      "notice-a",
      {},
      {
        id: "",
        revision: 1,
      },
      {
        id: "   ",
        revision: 1,
      },
      {
        id: 1,
        revision: 1,
      },
      {
        id: "notice-a",
        revision: 1.5,
      },
      {
        id: "notice-a",
        revision: 0,
      },
      {
        id: "notice-a",
        revision: -1,
      },
      {
        id: "notice-a",
        revision: "1",
      },
      {
        revision: 1,
      },
    ]) {
      await expect(
        resolveProductAnnouncementDismissMessage(request as any),
      ).resolves.toEqual({
        success: false,
        error: "Invalid product announcement dismiss request",
      })
    }
  })

  it("returns failure responses for malformed restore messages", async () => {
    for (const request of [
      undefined,
      null,
      "notice-a",
      {},
      {
        id: "",
      },
      {
        id: "   ",
      },
      {
        id: 1,
      },
    ]) {
      await expect(
        resolveProductAnnouncementRestoreMessage(request as any),
      ).resolves.toEqual({
        success: false,
        error: "Invalid product announcement restore request",
      })
    }
  })
})
