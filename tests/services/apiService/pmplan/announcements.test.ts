import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { getAnnouncementSourceHandlers } from "~/services/siteAnnouncements/sourceHandlers"
import { AuthTypeEnum } from "~/types"
import type { AnnouncementSourceHandlerRequest } from "~/types/siteAnnouncements"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

afterEach(() => vi.restoreAllMocks())
const request: AnnouncementSourceHandlerRequest = {
  accountId: "pm-account",
  siteName: "PM-Plan",
  siteType: "pmplan",
  baseUrl: "https://plan.pmcat.top",
  sourceScope: "account",
  apiRequest: {
    baseUrl: "https://plan.pmcat.top",
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    auth: {
      authType: AuthTypeEnum.Cookie,
      userId: "661",
      cookie: "pmplan_session=test",
    },
  },
}
const notice = {
  id: 7,
  user_id: 661,
  title: "Account notice",
  body: "Your account message",
  kind: "warning",
  is_read: false,
  created_at: "2026-11-27T12:00:00Z",
}

it("keeps personal notices in account sources with native read state and isolated identities", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.get("https://plan.pmcat.top/api/notices", () =>
      HttpResponse.json({
        notices: [notice, { ...notice, id: 8, is_read: true }],
        unread_count: 1,
      }),
    ),
  )
  const handlers = getAnnouncementSourceHandlers("pmplan")
  expect(handlers).toHaveLength(1)
  const handler = handlers[0]!
  expect(handler.scope).toBe("account")
  expect(handler.createSiteKey(request)).not.toBe(
    handler.createSiteKey({ ...request, accountId: "second-account" }),
  )
  expect(handler.markRead).toBeUndefined()
  expect(await handler.fetch(request)).toMatchObject({
    status: "success",
    sourceScope: "account",
    announcements: [
      {
        id: "7",
        title: "Account notice",
        content: "Your account message",
        read: false,
        createdAt: 1795780800000,
      },
      { id: "8", read: true },
    ],
  })
})

it("rejects a response containing another user's personal notice", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.get("https://plan.pmcat.top/api/notices", () =>
      HttpResponse.json({
        notices: [{ ...notice, user_id: 662 }],
        unread_count: 1,
      }),
    ),
  )
  expect(
    await getAnnouncementSourceHandlers("pmplan")[0]!.fetch(request),
  ).toMatchObject({ status: "error", announcements: [] })
})

it("drops malformed notices while retaining valid notices owned by the account", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.get("https://plan.pmcat.top/api/notices", () =>
      HttpResponse.json({
        notices: [
          null,
          "invalid",
          { ...notice, id: 0 },
          { ...notice, id: "8" },
          { ...notice, created_at: "invalid" },
          { ...notice, is_read: "false" },
          notice,
          { ...notice, id: 9, user_id: "661", is_read: true },
        ],
      }),
    ),
  )
  const result =
    await getAnnouncementSourceHandlers("pmplan")[0]!.fetch(request)
  expect(result).toMatchObject({ status: "success" })
  expect(result.announcements.map(({ id, read }) => ({ id, read }))).toEqual([
    { id: "7", read: false },
    { id: "9", read: true },
  ])
})

it.each([undefined, 662])(
  "rejects the whole notice batch before filtering a malformed row with owner %s",
  async (userId) => {
    installCookieTransport("pmplan_session", "plan.pmcat.top")
    server.use(
      http.get("https://plan.pmcat.top/api/me", () =>
        HttpResponse.json({ user: { id: 661, username: "sample" } }),
      ),
      http.get("https://plan.pmcat.top/api/notices", () =>
        HttpResponse.json({ notices: [notice, { user_id: userId }] }),
      ),
    )
    expect(
      await getAnnouncementSourceHandlers("pmplan")[0]!.fetch(request),
    ).toMatchObject({ status: "error", announcements: [] })
  },
)

it.each(["empty", "malformed", "unauthorized"])(
  "handles %s notices without inventing messages",
  async (state) => {
    installCookieTransport("pmplan_session", "plan.pmcat.top")
    server.use(
      http.get("https://plan.pmcat.top/api/me", () =>
        HttpResponse.json({ user: { id: 661, username: "sample" } }),
      ),
      http.get("https://plan.pmcat.top/api/notices", () =>
        state === "unauthorized"
          ? HttpResponse.json(
              { error: { message: "Expired session" } },
              { status: 401 },
            )
          : HttpResponse.json(
              state === "malformed"
                ? { notices: "bad" }
                : { notices: [], unread_count: 0 },
            ),
      ),
    )
    expect(
      await getAnnouncementSourceHandlers("pmplan")[0]!.fetch(request),
    ).toMatchObject({
      status: state === "empty" ? "success" : "error",
      announcements: [],
    })
  },
)
