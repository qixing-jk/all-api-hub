import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { PMPLAN_KEY_STATUSES } from "~/services/apiService/pmplan/constants"
import { createPmplanKey } from "~/services/apiService/pmplan/keys"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

afterEach(() => vi.restoreAllMocks())
it.each([
  { id: 0 },
  { id: -1 },
  { expires_at: "invalid-date" },
  { created_at: "invalid-date" },
  { last_used_at: "invalid-date" },
])("rejects unusable native inventory facts %j", async (change) => {
  const { fetchPmplanKeys } = await import("~/services/apiService/pmplan/keys")
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.get("https://plan.pmcat.top/api/keys", () =>
      HttpResponse.json({
        keys: [
          {
            id: 7,
            key_prefix: "sk-pm-test…",
            status: PMPLAN_KEY_STATUSES.Active,
            all_models: true,
            models: [],
            expires_at: null,
            ...change,
          },
        ],
      }),
    ),
  )
  await expect(
    fetchPmplanKeys({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://plan.pmcat.top",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "661",
        cookie: "pmplan_session=saved",
      },
    }),
  ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
})
it("rejects duplicate native IDs instead of mixing two resource records", async () => {
  const { fetchPmplanKeys } = await import("~/services/apiService/pmplan/keys")
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  const key = {
    id: 7,
    key_prefix: "sk-pm-test…",
    status: PMPLAN_KEY_STATUSES.Active,
    all_models: true,
    models: [],
    expires_at: null,
  }
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.get("https://plan.pmcat.top/api/keys", () =>
      HttpResponse.json({ keys: [key, key] }),
    ),
  )
  await expect(
    fetchPmplanKeys({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://plan.pmcat.top",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "661",
        cookie: "pmplan_session=saved",
      },
    }),
  ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
})
it("creates a dynamic-model key with native expiry and CSRF protection", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.post("https://plan.pmcat.top/api/keys", async ({ request }) => {
      expect(request.headers.get("x-pmplan-csrf")).toBe("1")
      expect(await request.json()).toEqual({ expires_at: null, models: [] })
      return HttpResponse.json({
        id: 7,
        key: "sk-pm-disposable-example",
        expires_at: null,
      })
    }),
  )
  expect(
    await createPmplanKey(
      {
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl: "https://plan.pmcat.top",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "661",
          cookie: "pmplan_session=saved",
        },
      },
      { expires_at: null, models: [] },
    ),
  ).toMatchObject({ id: 7, key: "sk-pm-disposable-example" })
})

it.each([{}, { created_at: null, last_used_at: null, revoked_at: null }])(
  "keeps revoked keys and absent native timestamps without inventing plaintext: %j",
  async (timestamps) => {
    const { fetchPmplanKeys } =
      await import("~/services/apiService/pmplan/keys")
    installCookieTransport("pmplan_session", "plan.pmcat.top")
    server.use(
      http.get("https://plan.pmcat.top/api/me", () =>
        HttpResponse.json({ user: { id: 661, username: "sample" } }),
      ),
      http.get("https://plan.pmcat.top/api/keys", () =>
        HttpResponse.json({
          keys: [
            {
              id: 7,
              key_prefix: "sk-pm-abc",
              status: PMPLAN_KEY_STATUSES.Revoked,
              all_models: true,
              models: [],
              expires_at: null,
              ...timestamps,
            },
          ],
        }),
      ),
    )
    expect(
      await fetchPmplanKeys({
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl: "https://plan.pmcat.top",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "661",
          cookie: "pmplan_session=saved",
        },
      }),
    ).toEqual([
      {
        id: 7,
        key_prefix: "sk-pm-abc",
        status: "revoked",
        all_models: true,
        models: [],
        expires_at: null,
        ...timestamps,
      },
    ])
  },
)

it("revokes once then confirms the retained record", async () => {
  const { revokePmplanKey } = await import("~/services/apiService/pmplan/keys")
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  let revoked = false
  let writes = 0
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.delete("https://plan.pmcat.top/api/keys/7", ({ request }) => {
      expect(request.headers.get("x-pmplan-csrf")).toBe("1")
      writes++
      revoked = true
      return HttpResponse.json({ ok: true })
    }),
    http.get("https://plan.pmcat.top/api/keys", () =>
      HttpResponse.json({
        keys: [
          {
            id: 7,
            key_prefix: "sk-pm-abc",
            status: revoked
              ? PMPLAN_KEY_STATUSES.Revoked
              : PMPLAN_KEY_STATUSES.Active,
            all_models: true,
            models: [],
            expires_at: null,
          },
        ],
      }),
    ),
  )
  expect(
    await revokePmplanKey(
      {
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl: "https://plan.pmcat.top",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "661",
          cookie: "pmplan_session=saved",
        },
      },
      7,
    ),
  ).toMatchObject({ id: 7, status: "revoked" })
  expect(writes).toBe(1)
})
