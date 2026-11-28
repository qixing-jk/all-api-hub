import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { fetchUserInfo } from "~/services/apiService/pmplan"
import { fetchPmplanCheckInStatus } from "~/services/apiService/pmplan/checkIn"
import {
  createPmplanKey,
  revokePmplanKey,
  updatePmplanKeyModels,
} from "~/services/apiService/pmplan/keys"
import { fetchPmplanModelSquare } from "~/services/apiService/pmplan/models"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://plan.pmcat.top"
const request = {
  baseUrl: origin,
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  auth: {
    authType: AuthTypeEnum.Cookie,
    userId: "661",
    cookie: "pmplan_session=saved",
  },
}
const key = {
  id: 7,
  key_prefix: "sk-pm-test",
  status: "active",
  all_models: true,
  models: [],
  expires_at: null,
}
beforeEach(() => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get(`${origin}/api/me`, () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
  )
})
afterEach(() => vi.restoreAllMocks())

it.each([
  null,
  {},
  { id: 7 },
  { id: -1, key: "sk-pm-test" },
  { id: 7, key: "prefix-only" },
])(
  "rejects unusable create responses without inventing a secret: %j",
  async (body) => {
    server.use(http.post(`${origin}/api/keys`, () => HttpResponse.json(body)))
    await expect(
      createPmplanKey(request, { expires_at: null, models: [] }),
    ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
  },
)
it.each([0, -1, Number.NaN])(
  "rejects invalid mutation IDs before any HTTP request: %s",
  async (id) => {
    const fetch = vi.spyOn(globalThis, "fetch")
    await expect(
      updatePmplanKeyModels(request, id, { models: [] }),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    await expect(revokePmplanKey(request, id)).rejects.toMatchObject({
      code: "FEATURE_UNSUPPORTED",
    })
    expect(fetch).not.toHaveBeenCalled()
  },
)
it.each(["missing-ack", "missing-key", "different-models", "different-scope"])(
  "rejects unconfirmed model updates: %s",
  async (failure) => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
      onMutationAccepted: vi.fn(),
    }
    server.use(
      http.put(`${origin}/api/keys/7/models`, () =>
        HttpResponse.json(failure === "missing-ack" ? {} : { ok: true }),
      ),
      http.get(`${origin}/api/keys`, () =>
        HttpResponse.json({
          keys:
            failure === "missing-key"
              ? []
              : [
                  {
                    ...key,
                    all_models: failure === "different-scope" ? true : false,
                    models:
                      failure === "different-models" ? ["other"] : ["test"],
                  },
                ],
        }),
      ),
    )
    await expect(
      updatePmplanKeyModels({ ...request, observer }, 7, { models: ["test"] }),
    ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
    expect(observer.onMutationAccepted).toHaveBeenCalledTimes(
      failure === "missing-ack" ? 0 : 1,
    )
  },
)
it.each([{ keys: [] }, { keys: [key] }])(
  "keeps accepted revocation unconfirmed when inventory cannot prove revocation: %j",
  async ({ keys }) => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
      onMutationAccepted: vi.fn(),
    }
    server.use(
      http.delete(`${origin}/api/keys/7`, () =>
        HttpResponse.json({ ok: true }),
      ),
      http.get(`${origin}/api/keys`, () => HttpResponse.json({ keys })),
    )
    await expect(
      revokePmplanKey({ ...request, observer }, 7),
    ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
    expect(observer.onMutationAccepted).toHaveBeenCalledOnce()
  },
)
it.each([
  null,
  {},
  { models: [], total: 1, available: 0 },
  { models: [], total: 0, available: 1 },
  { models: [{}], total: 1, available: 0 },
])("rejects malformed catalog totals and rows: %j", async (body) => {
  server.use(
    http.get(`${origin}/api/model-square`, () => HttpResponse.json(body)),
  )
  await expect(fetchPmplanModelSquare(request)).rejects.toMatchObject({
    code: "JSON_PARSE_ERROR",
  })
})
it("rejects malformed identity without accepting a session", async () => {
  server.use(
    http.get(`${origin}/api/me`, () => HttpResponse.json({ user: {} })),
  )
  await expect(fetchUserInfo(request)).rejects.toMatchObject({
    code: "JSON_PARSE_ERROR",
  })
})
it("rejects a malformed status response after the identity preflight succeeded", async () => {
  let reads = 0
  server.use(
    http.get(`${origin}/api/me`, () =>
      HttpResponse.json(
        reads++ ? null : { user: { id: 661, username: "sample" } },
      ),
    ),
  )
  await expect(fetchPmplanCheckInStatus(request)).rejects.toMatchObject({
    code: "JSON_PARSE_ERROR",
  })
})
