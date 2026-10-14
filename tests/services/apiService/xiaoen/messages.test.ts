import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import announcementLocale from "~/locales/en/siteAnnouncements.json"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { AuthTypeEnum } from "~/types"
import i18n from "~/utils/i18n/core"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://free.supxh.xin"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: "account-a" },
}
const message = {
  id: "message-a",
  userId: "account-a",
  templateId: "template-a",
  isRead: false,
  isDeleted: false,
  readAt: null,
  createdAt: "2026-10-14T00:00:00Z",
  template: { title: "Notice", content: "Native content", type: "promo" },
}

describe("Xiaoen account messages", () => {
  it.each([null, { success: false }])(
    "does not accept a failed acknowledgement %j",
    async (result) => {
      const patch = vi.fn(() => HttpResponse.json(result))
      server.use(
        http.get(`${origin}/api/messages`, () => HttpResponse.json([message])),
        http.patch(`${origin}/api/messages`, patch),
      )
      const capability =
        getSiteTypeCapabilities("xiaoen").account!.announcements!
      expect(await capability.markRead!({ request, id: "" })).toBe(false)
      expect(patch).not.toHaveBeenCalled()
      expect(await capability.markRead!({ request, id: message.id })).toBe(
        false,
      )
      expect(patch).toHaveBeenCalledTimes(1)
    },
  )
  it("keeps malformed optional reward metadata out of messages without exposing coupon codes", async () => {
    server.use(
      http.get(`${origin}/api/messages`, () =>
        HttpResponse.json([
          {
            ...message,
            template: {
              ...message.template,
              type: "quota",
              quotaAmount: -3,
              expiresAt: "invalid",
            },
          },
          {
            ...message,
            id: "coupon",
            isClaimed: false,
            template: {
              ...message.template,
              type: "coupon",
              redeemCode: "private-coupon",
            },
          },
        ]),
      ),
    )
    const items =
      await getSiteTypeCapabilities("xiaoen").account!.announcements!.fetch(
        request,
      )
    expect(items).toHaveLength(2)
    expect(items[0]!.content).not.toContain("-3")
    expect(items[0]!.content).not.toContain("invalid")
    expect(items[1]!.content).not.toContain("private-coupon")
    expect(items[1]!.content).toContain("dashboard/messages?messageId=coupon")
  })
  afterEach(() => vi.restoreAllMocks())
  beforeEach(async () => {
    i18n.addResourceBundle("en", "siteAnnouncements", announcementLocale)
    const transport = installCookieTransport()
    const cookie = (await browser.cookies.getAll({}))[0]!
    transport.cookies.mockResolvedValue([
      { ...cookie, name: "auth_token", domain: "free.supxh.xin" },
    ])
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({
          success: true,
          data: { id: "account-a", username: "sample" },
        }),
      ),
    )
  })

  it("reads account-bound messages separately from public announcements without writes", async () => {
    const write = vi.fn(() => HttpResponse.json({ success: true }))
    server.use(
      http.get(`${origin}/api/messages`, () =>
        HttpResponse.json([
          message,
          {
            ...message,
            id: "read-message",
            isRead: true,
            readAt: "2026-10-14T01:00:00Z",
          },
          { ...message, id: "deleted-message", isDeleted: true },
        ]),
      ),
      http.patch(`${origin}/api/messages`, write),
      http.post(`${origin}/api/messages/claim`, write),
    )
    const capabilities = getSiteTypeCapabilities("xiaoen")
    expect(capabilities.site?.announcements).toBeDefined()
    expect(await capabilities.account!.announcements!.fetch(request)).toEqual([
      {
        id: "message-a",
        title: "Notice",
        content: "Native content",
        createdAt: 1791936000000,
        read: false,
      },
      {
        id: "read-message",
        title: "Notice",
        content: "Native content",
        createdAt: 1791936000000,
        read: true,
        readAt: 1791939600000,
      },
    ])
    expect(write).not.toHaveBeenCalled()
  })

  it("marks only the owned message read and verifies the state without claiming rewards", async () => {
    let read = false
    const patch = vi.fn(async ({ request: native }) => {
      expect(await native.json()).toEqual({ messageId: "message-a" })
      read = true
      return HttpResponse.json({ success: true })
    })
    const claim = vi.fn(() => HttpResponse.json({ success: true }))
    server.use(
      http.get(`${origin}/api/messages`, () =>
        HttpResponse.json([{ ...message, isRead: read }]),
      ),
      http.patch(`${origin}/api/messages`, patch),
      http.post(`${origin}/api/messages/claim`, claim),
      http.patch(`${origin}/api/messages/popup`, claim),
    )
    expect(
      await getSiteTypeCapabilities("xiaoen").account!.announcements!.markRead!(
        { request, id: "message-a" },
      ),
    ).toBe(true)
    expect(patch).toHaveBeenCalledTimes(1)
    expect(claim).not.toHaveBeenCalled()
  })

  it("links reward messages to the native page without claiming or publishing coupon codes", async () => {
    server.use(
      http.get(`${origin}/api/messages`, () =>
        HttpResponse.json([
          {
            ...message,
            isClaimed: true,
            template: {
              ...message.template,
              type: "quota",
              quotaAmount: 5000,
              redeemCode: "PRIVATE-COUPON",
              expiresAt: "2026-10-23T00:00:00Z",
            },
          },
        ]),
      ),
    )
    const [result] =
      await getSiteTypeCapabilities("xiaoen").account!.announcements!.fetch(
        request,
      )
    expect(result!.content).toContain("/dashboard/messages?messageId=message-a")
    expect(result!.content).toContain("5000")
    expect(result!.content).toContain("2026-10-23T00:00:00Z")
    expect(result!.content).not.toContain("PRIVATE-COUPON")
  })

  it("rejects a changed session identity before reading or acknowledging messages", async () => {
    const access = vi.fn(() => HttpResponse.json([message]))
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({
          success: true,
          data: { id: "account-b", username: "other" },
        }),
      ),
      http.get(`${origin}/api/messages`, access),
      http.patch(`${origin}/api/messages`, access),
    )
    await expect(
      getSiteTypeCapabilities("xiaoen").account!.announcements!.markRead!({
        request,
        id: "message-a",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTITY_MISMATCH" })
    expect(access).not.toHaveBeenCalled()
  })

  it("rejects foreign-account rows and malformed list payloads", async () => {
    for (const payload of [
      [{ ...message, userId: "account-b" }],
      { error: "not authenticated" },
      [{ ...message, createdAt: "invalid" }],
    ]) {
      server.use(
        http.get(`${origin}/api/messages`, () => HttpResponse.json(payload)),
      )
      await expect(
        getSiteTypeCapabilities("xiaoen").account!.announcements!.fetch(
          request,
        ),
      ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
    }
  })

  it("does not acknowledge unknown or deleted messages", async () => {
    const patch = vi.fn(() => HttpResponse.json({ success: true }))
    server.use(
      http.get(`${origin}/api/messages`, () =>
        HttpResponse.json([{ ...message, isDeleted: true }]),
      ),
      http.patch(`${origin}/api/messages`, patch),
    )
    expect(
      await getSiteTypeCapabilities("xiaoen").account!.announcements!.markRead!(
        { request, id: "message-a" },
      ),
    ).toBe(false)
    expect(patch).not.toHaveBeenCalled()
  })

  it("does not report an unread readback as successfully acknowledged or replay the write", async () => {
    const patch = vi.fn(() => HttpResponse.json({ success: true }))
    server.use(
      http.get(`${origin}/api/messages`, () => HttpResponse.json([message])),
      http.patch(`${origin}/api/messages`, patch),
    )
    expect(
      await getSiteTypeCapabilities("xiaoen").account!.announcements!.markRead!(
        { request, id: "message-a" },
      ),
    ).toBe(false)
    expect(patch).toHaveBeenCalledTimes(1)
  })

  it("preserves a failed acknowledgement and never replays a lost write response", async () => {
    const patch = vi.fn(() => HttpResponse.error())
    server.use(
      http.get(`${origin}/api/messages`, () => HttpResponse.json([message])),
      http.patch(`${origin}/api/messages`, patch),
    )
    await expect(
      getSiteTypeCapabilities("xiaoen").account!.announcements!.markRead!({
        request,
        id: "message-a",
      }),
    ).rejects.toThrow()
    expect(patch).toHaveBeenCalledTimes(1)
  })
})
