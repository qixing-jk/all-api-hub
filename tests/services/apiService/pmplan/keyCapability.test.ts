import { expect, it } from "vitest"

import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { PMPLAN_KEY_STATUSES } from "~/services/apiService/pmplan/constants"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"

it("captures one browser Cookie for creation and readback even if the ambient account changes", async () => {
  const { http, HttpResponse } = await import("msw")
  const { server } = await import("~~/tests/msw/server")
  const { installCookieTransport } =
    await import("~~/tests/test-utils/cookieTransport")
  const { AuthTypeEnum } = await import("~/types")
  const { vi } = await import("vitest")
  const { cookies } = installCookieTransport("pmplan_session", "plan.pmcat.top")
  const template = (await browser.cookies.getAll({}))[0]!
  cookies.mockClear()
  cookies.mockResolvedValue([{ ...template, value: "first" }])
  let readsAtWrite = 0
  try {
    server.use(
      http.get("https://plan.pmcat.top/api/me", ({ request }) =>
        HttpResponse.json({
          user: {
            id:
              request.headers.get("cookie") === "pmplan_session=first"
                ? 661
                : 662,
            username: "sample",
          },
        }),
      ),
      http.post("https://plan.pmcat.top/api/keys", () => {
        readsAtWrite = cookies.mock.calls.length
        cookies.mockResolvedValue([{ ...template, value: "other" }])
        return HttpResponse.json({ id: 7, key: "sk-pm-created-test-secret" })
      }),
      http.get("https://plan.pmcat.top/api/models", () =>
        HttpResponse.json({ models: [] }),
      ),
      http.get("https://plan.pmcat.top/api/keys", () =>
        HttpResponse.json({
          keys: [
            {
              id: 7,
              key_prefix: "sk-pm-created…",
              status: PMPLAN_KEY_STATUSES.Active,
              all_models: true,
              models: [],
              expires_at: null,
            },
          ],
        }),
      ),
    )
    const session = await getSiteTypeCapabilities(
      "pmplan",
    ).account!.keyResourceManagement!.open({
      account: { id: "test-account", siteType: "pmplan", name: "PM-Plan" },
      request: {
        accountId: "test-account",
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl: "https://plan.pmcat.top",
        auth: { authType: AuthTypeEnum.Cookie, userId: "661" },
      },
    })
    const editor = await session.openCreateEditor("account")
    cookies.mockClear()
    cookies.mockResolvedValue([{ ...template, value: "first" }])
    const result = await editor.submit(editor.initialValues)
    expect(result.createdSecret?.correlation).toMatchObject({
      kind: "account-key-resource",
      ref: { resourceId: "7" },
    })
    expect(readsAtWrite).toBeGreaterThan(0)
    expect(cookies).toHaveBeenCalledTimes(readsAtWrite)
  } finally {
    vi.restoreAllMocks()
  }
})

it("honors an already cancelled account request when a collection adds no signal", async () => {
  const { http, HttpResponse } = await import("msw")
  const { server } = await import("~~/tests/msw/server")
  const { installCookieTransport } =
    await import("~~/tests/test-utils/cookieTransport")
  const { AuthTypeEnum } = await import("~/types")
  const { vi } = await import("vitest")
  const { fetch } = installCookieTransport("pmplan_session", "plan.pmcat.top")
  const cancelled = new AbortController()
  cancelled.abort()
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.get("https://plan.pmcat.top/api/keys", () =>
      HttpResponse.json({ keys: [] }),
    ),
  )
  try {
    const session = await getSiteTypeCapabilities(
      "pmplan",
    ).account!.keyResourceManagement!.open({
      account: { id: "test-account", siteType: "pmplan", name: "PM-Plan" },
      request: {
        accountId: "test-account",
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl: "https://plan.pmcat.top",
        abortSignal: cancelled.signal,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "661",
          cookie: "pmplan_session=saved",
        },
      },
    })
    await expect(
      (await session.openCollection("account")).list(),
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    vi.restoreAllMocks()
  }
})

it("exposes native PM-Plan key management", () => {
  expect(
    getSiteTypeCapabilities("pmplan").account?.keyResourceManagement,
  ).toBeDefined()
})

it.each(["https://plan.pmcat.top", "https://custom-plan.example"])(
  "opens native keys and exports the same deployment: %s",
  async (origin) => {
    const { http, HttpResponse } = await import("msw")
    const { server } = await import("~~/tests/msw/server")
    const { installCookieTransport } =
      await import("~~/tests/test-utils/cookieTransport")
    const { AuthTypeEnum } = await import("~/types")
    const { vi } = await import("vitest")
    installCookieTransport("pmplan_session", new URL(origin).hostname)
    try {
      server.use(
        http.get(`${origin}/api/me`, () =>
          HttpResponse.json({ user: { id: 661, username: "sample" } }),
        ),
        http.get(`${origin}/api/keys`, () =>
          HttpResponse.json({
            keys: [
              {
                id: 7,
                key_prefix: "sk-pm-abc…",
                status: PMPLAN_KEY_STATUSES.Active,
                all_models: true,
                models: [],
                expires_at: null,
                created_at: "2026-11-01T06:00:00Z",
                last_used_at: "2026-11-02T06:00:00Z",
              },
            ],
          }),
        ),
        http.get(`${origin}/api/models`, () =>
          HttpResponse.json({ models: [] }),
        ),
      )
      const session = await getSiteTypeCapabilities(
        "pmplan",
      ).account!.keyResourceManagement!.open({
        account: { id: "test-account", siteType: "pmplan", name: "PM-Plan" },
        request: {
          accountId: "test-account",
          directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
          baseUrl: origin,
          auth: {
            authType: AuthTypeEnum.Cookie,
            userId: "661",
            cookie: "pmplan_session=saved",
          },
        },
      })
      const collection = await session.openCollection("account")
      const page = await collection.list()
      expect(page.items[0]).toMatchObject({
        maskedLabel: "sk-pm-abc…",
        keyMask: { prefix: "sk-pm-abc", suffix: "" },
        actions: { canRevoke: true, canDelete: false, canUpdate: true },
        status: "enabled",
      })
      expect(page.items[0]!.runtimeSecret).toBeUndefined()
      expect(page.items[0]!.displayFacts).toEqual(
        expect.arrayContaining([
          { fieldId: "expiry", kind: "expiry", timestampMs: "never" },
          {
            fieldId: "accessed_time",
            kind: "last-used",
            timestampMs: Date.parse("2026-11-02T06:00:00Z"),
          },
        ]),
      )
      expect(page.items[0]!.runtimeKey).toMatchObject({
        createdAt: Date.parse("2026-11-01T06:00:00Z"),
        baseUrl: `${origin}/v1`,
      })
      expect(
        (await session.openCreateEditor("account")).fields.map(
          (field) => field.fieldId,
        ),
      ).toEqual(["expiry", "expiresAt", "models"])
    } finally {
      vi.restoreAllMocks()
    }
  },
)

it.each(["https://plan.pmcat.top", "https://custom-plan.example"])(
  "preserves a one-time secret with the correct deployment after failed readback: %s",
  async (origin) => {
    const { http, HttpResponse } = await import("msw")
    const { server } = await import("~~/tests/msw/server")
    const { installCookieTransport } =
      await import("~~/tests/test-utils/cookieTransport")
    const { AuthTypeEnum } = await import("~/types")
    const { vi } = await import("vitest")
    installCookieTransport("pmplan_session", new URL(origin).hostname)
    try {
      let writes = 0
      server.use(
        http.get(`${origin}/api/me`, () =>
          HttpResponse.json({ user: { id: 661, username: "sample" } }),
        ),
        http.get(`${origin}/api/models`, () =>
          HttpResponse.json({ models: [] }),
        ),
        http.post(`${origin}/api/keys`, () => {
          writes++
          return HttpResponse.json({
            id: 7,
            key: "sk-pm-confirmed-test-secret",
            expires_at: null,
          })
        }),
        http.get(`${origin}/api/keys`, () =>
          HttpResponse.json(
            { error: { message: "read unavailable" } },
            { status: 503 },
          ),
        ),
      )
      const session = await getSiteTypeCapabilities(
        "pmplan",
      ).account!.keyResourceManagement!.open({
        account: { id: "test-account", siteType: "pmplan", name: "PM-Plan" },
        request: {
          accountId: "test-account",
          directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
          baseUrl: origin,
          auth: {
            authType: AuthTypeEnum.Cookie,
            userId: "661",
            cookie: "pmplan_session=saved",
          },
        },
      })
      const editor = await session.openCreateEditor("account")
      const result = await editor.submit(editor.initialValues)
      expect(result.createdSecret?.secret).toBe("sk-pm-confirmed-test-secret")
      expect(result.createdSecret?.credential.baseUrl).toBe(`${origin}/v1`)
      expect(writes).toBe(1)
    } finally {
      vi.restoreAllMocks()
    }
  },
)
