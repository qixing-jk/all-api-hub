import { beforeEach, describe, expect, it, vi } from "vitest"

import { PRODUCT_ANNOUNCEMENT_REMOTE_URL } from "~/services/productAnnouncements/constants"
import {
  productAnnouncementService,
  resolveProductAnnouncementDismissMessage,
  resolveProductAnnouncementGetStateMessage,
  resolveProductAnnouncementMarkSeenMessage,
  resolveProductAnnouncementRefreshMessage,
  resolveProductAnnouncementRestoreMessage,
  setupProductAnnouncementMessagingListeners,
} from "~/services/productAnnouncements/service"
import { productAnnouncementStorage } from "~/services/productAnnouncements/storage"
import { ProductAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"

const fetchMock = vi.fn()
const onMessageMock = vi.hoisted(() => vi.fn())

vi.mock("~/services/productAnnouncements/messaging", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/productAnnouncements/messaging")
    >()

  return {
    ...actual,
    onProductAnnouncementsMessage: onMessageMock,
  }
})

function resetProductAnnouncementServiceState() {
  ;(productAnnouncementService as any).isInitialized = false
  ;(productAnnouncementService as any).refreshPromise = null
}

describe("product announcement runtime message resolvers", () => {
  beforeEach(async () => {
    resetProductAnnouncementServiceState()
    vi.clearAllMocks()
    onMessageMock.mockReturnValue(() => {})
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

  it("returns current state with default version and current time", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        defaultLocale: "zh-CN",
        announcements: [
          {
            id: "always",
            revision: 1,
            severity: "info",
            priority: 1,
            affectedVersions: "*",
            startsAt: "2026-01-01T00:00:00Z",
            expiresAt: "2099-01-01T00:00:00Z",
            content: {
              "zh-CN": {
                title: "Always visible",
                message: "Uses default request values.",
              },
            },
          },
        ],
      }),
    })

    await resolveProductAnnouncementRefreshMessage()

    const response = await resolveProductAnnouncementGetStateMessage({
      locale: "zh-CN",
    })

    expect(response.success).toBe(true)
    expect(response.success ? response.data.view.notices[0]?.id : null).toBe(
      "always",
    )
  })

  it("handles refresh, seen, dismiss, and restore messages", async () => {
    await expect(resolveProductAnnouncementRefreshMessage()).resolves.toEqual({
      success: true,
      data: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(PRODUCT_ANNOUNCEMENT_REMOTE_URL, {
      cache: "no-store",
      signal: expect.any(AbortSignal),
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

  it("registers product announcement messaging listeners once", async () => {
    setupProductAnnouncementMessagingListeners()
    setupProductAnnouncementMessagingListeners()

    expect(onMessageMock).toHaveBeenCalledTimes(5)
    expect(onMessageMock.mock.calls.map(([type]) => type)).toEqual([
      ProductAnnouncementsMessageTypes.GetState,
      ProductAnnouncementsMessageTypes.Refresh,
      ProductAnnouncementsMessageTypes.MarkSeen,
      ProductAnnouncementsMessageTypes.Dismiss,
      ProductAnnouncementsMessageTypes.Restore,
    ])

    const findHandler = (
      messageType: (typeof ProductAnnouncementsMessageTypes)[keyof typeof ProductAnnouncementsMessageTypes],
    ) => {
      const handler = onMessageMock.mock.calls.find(
        ([type]) => type === messageType,
      )?.[1] as ((payload: { data: unknown }) => Promise<unknown>) | undefined

      if (!handler) {
        throw new Error(`Missing handler for ${messageType}`)
      }

      return handler
    }

    await expect(
      findHandler(ProductAnnouncementsMessageTypes.GetState)({
        data: { locale: "zh-CN" },
      }),
    ).resolves.toMatchObject({ success: true })
    await expect(
      findHandler(ProductAnnouncementsMessageTypes.Refresh)({ data: {} }),
    ).resolves.toEqual({ success: true, data: true })
    await expect(
      findHandler(ProductAnnouncementsMessageTypes.MarkSeen)({
        data: { ids: ["notice-a"] },
      }),
    ).resolves.toEqual({ success: true, data: undefined })
    await expect(
      findHandler(ProductAnnouncementsMessageTypes.Dismiss)({
        data: { id: "notice-a", revision: 1 },
      }),
    ).resolves.toEqual({ success: true, data: undefined })
    await expect(
      findHandler(ProductAnnouncementsMessageTypes.Restore)({
        data: { id: "notice-a" },
      }),
    ).resolves.toEqual({ success: true, data: undefined })
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

  it("returns failure responses when service operations throw", async () => {
    const getStateSpy = vi
      .spyOn(productAnnouncementService, "getCurrentState")
      .mockRejectedValueOnce(new Error("state failed"))
    await expect(
      resolveProductAnnouncementGetStateMessage({ locale: "zh-CN" }),
    ).resolves.toEqual({
      success: false,
      error: "state failed",
    })
    getStateSpy.mockRestore()

    const refreshSpy = vi
      .spyOn(productAnnouncementService, "refreshRemoteFeed")
      .mockRejectedValueOnce(new Error("refresh failed"))
    await expect(resolveProductAnnouncementRefreshMessage()).resolves.toEqual({
      success: false,
      error: "refresh failed",
    })
    refreshSpy.mockRestore()

    const markSeenSpy = vi
      .spyOn(productAnnouncementService, "markSeen")
      .mockRejectedValueOnce(new Error("seen failed"))
    await expect(
      resolveProductAnnouncementMarkSeenMessage({ ids: ["notice-a"] }),
    ).resolves.toEqual({
      success: false,
      error: "seen failed",
    })
    markSeenSpy.mockRestore()

    const dismissSpy = vi
      .spyOn(productAnnouncementService, "dismiss")
      .mockRejectedValueOnce(new Error("dismiss failed"))
    await expect(
      resolveProductAnnouncementDismissMessage({
        id: "notice-a",
        revision: 1,
      }),
    ).resolves.toEqual({
      success: false,
      error: "dismiss failed",
    })
    dismissSpy.mockRestore()

    const restoreSpy = vi
      .spyOn(productAnnouncementService, "restore")
      .mockRejectedValueOnce(new Error("restore failed"))
    await expect(
      resolveProductAnnouncementRestoreMessage({ id: "notice-a" }),
    ).resolves.toEqual({
      success: false,
      error: "restore failed",
    })
    restoreSpy.mockRestore()
  })
})
