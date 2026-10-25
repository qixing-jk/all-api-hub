// Initialize provider registrations before measuring the shared snapshot queries.
import "~/services/checkin/autoCheckin/providers"

import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ApiServiceAccountRequest } from "~/services/accounts/accountDataModel"
import { fetchAccountData } from "~/services/apiService/pmapi"
import { fetchPmApiAff } from "~/services/apiService/pmapi/aff"
import { fetchPmApiAnnouncements } from "~/services/apiService/pmapi/announcements"
import {
  PMAPI_ENDPOINTS,
  PMAPI_KEY_STATUSES,
} from "~/services/apiService/pmapi/constants"
import {
  createPmApiKey,
  deletePmApiKey,
  fetchPmApiKeys,
  fetchPmApiTokenGroups,
  regeneratePmApiKey,
  setPmApiKeyStatus,
  updatePmApiKey,
} from "~/services/apiService/pmapi/keys"
import { redeemPmApiCode } from "~/services/apiService/pmapi/redemption"
import {
  fetchPmApiCheckInOverview,
  performPmApiCheckIn,
} from "~/services/apiService/pmapi/rewards"
import { fetchPmApiCheckInSupport } from "~/services/apiService/pmapi/status"
import { AuthTypeEnum } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { server } from "~~/tests/msw/server"

const origin = "https://pmcat.top"

const identity = {
  id: 10171,
  username: "pm-test-user",
  display_name: "PM Test",
  email: "",
  quota: 1_250_000,
  used_quota: 125_000,
  request_count: 4,
  aff_code: "ABCD",
  aff_count: 0,
  checked_in_today: false,
  last_checkin: "",
  created_at: 1760000000,
  last_login_at: 1760000000,
  group: "default",
  grp: "default",
  group_ratio: 1,
  role: 1,
  status: 1,
  totp_enabled: false,
  linuxdo_bound: true,
  inviter_id: 0,
  remark: "",
}

const accountRequest = (): ApiServiceAccountRequest => ({
  baseUrl: origin,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "10171",
    accessToken: "pm-test-token",
  },
  includeTodayCashflow: true,
  checkIn: {
    automaticExecutionEnabled: false,
    selection: { mode: "automatic" },
    methodKnowledge: { methods: {} },
  },
})

const envelope = (data: unknown, success = true, message = "") => ({
  data,
  message,
  success,
})

function mockIdentity(extra: Parameters<typeof server.use> = []) {
  server.use(
    http.get(`${origin}/api/me`, (info) => {
      if (info.request.headers.get("Authorization") !== "Bearer pm-test-token")
        return HttpResponse.json({}, { status: 401 })
      return HttpResponse.json(envelope(identity))
    }),
    ...extra,
  )
}

const keyRow = {
  id: 6741,
  name: "user group (auto)",
  key: "sk-pm-plaintext-key-value",
  status: 1,
  unlimited: true,
  remain_quota: 0,
  used_quota: 0,
  expired_at: -1,
  models: "",
  subnet: "",
  rpm: 0,
  grp: "default",
  created_at: 1760000000,
  accessed_at: 1760000000,
  request_count: 0,
  user_id: 10171,
}

describe("PM-API account data", () => {
  afterEach(() => vi.restoreAllMocks())

  it("keeps the console's New API quota unit untouched", async () => {
    mockIdentity([
      http.get(`${origin}/api/me/stats`, () =>
        HttpResponse.json(
          envelope({
            models: ["glm-5.3"],
            rpm: 0,
            series: [
              { date: "10-21", errors: 0, quota: 0, requests: 0, tokens: 0 },
            ],
            today: { latency: 210, quota: 125_000, requests: 4, tokens: 300 },
            token_count: 1,
            user: identity,
          }),
        ),
      ),
    ])
    const data = await fetchAccountData(accountRequest())
    expect(data.quota).toBe(1_250_000)
    expect(data.today_quota_consumption).toBe(125_000)
    expect(data.today_requests_count).toBe(4)
    // The console reports one combined token total without a prompt split.
    expect(data.today_prompt_tokens).toBe(300)
    expect(data.today_completion_tokens).toBe(0)
    expect(data.todayStatsAvailability?.consumption).toMatchObject({
      status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
    })
  })

  it("keeps account data usable when the stats route fails", async () => {
    mockIdentity([
      http.get(`${origin}/api/me/stats`, () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    ])
    const data = await fetchAccountData(accountRequest())
    expect(data.quota).toBe(1_250_000)
    expect(data.todayStatsAvailability?.consumption).toMatchObject({
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    })
  })

  it("does not read check-in state during a data refresh", async () => {
    const readStatus = vi.fn(() => HttpResponse.json(envelope(null)))
    mockIdentity([
      http.get(`${origin}/api/me/checkin`, readStatus),
      http.get(`${origin}/api/me/stats`, readStatus),
    ])
    const request = accountRequest()
    request.includeTodayCashflow = false
    await fetchAccountData(request)
    expect(readStatus).not.toHaveBeenCalled()
  })

  it("rejects an identity that does not match the saved account", async () => {
    server.use(
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope({ ...identity, id: 999 })),
      ),
    )
    await expect(fetchAccountData(accountRequest())).rejects.toMatchObject({
      code: "ACCOUNT_IDENTITY_MISMATCH",
    })
  })

  it("maps a 401 to a session-expired auth failure", async () => {
    server.use(
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json({}, { status: 401 }),
      ),
    )
    await expect(fetchAccountData(accountRequest())).rejects.toMatchObject({
      statusCode: 401,
      code: "HTTP_401",
    })
  })

  it("surfaces business failure envelopes as errors", async () => {
    server.use(
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(null, false, "无效的会话")),
      ),
    )
    await expect(fetchAccountData(accountRequest())).rejects.toThrow(
      "无效的会话",
    )
  })
})

describe("PM-API keys", () => {
  beforeEach(() => {
    mockIdentity()
  })

  it("lists keys across pages with the console's native fields", async () => {
    const secondRow = { ...keyRow, id: 6742, name: "second", grp: "Free" }
    server.use(
      http.get(`${origin}/api/tokens`, (info) => {
        const page = new URL(info.request.url).searchParams.get("p")
        return HttpResponse.json(
          page === "1"
            ? envelope({ items: [keyRow], total: 101 })
            : envelope({ items: [secondRow], total: 101 }),
        )
      }),
    )
    const keys = await fetchPmApiKeys(accountRequest())
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatchObject({
      id: 6741,
      name: "user group (auto)",
      // The console list route returns the recoverable plaintext key.
      key: "sk-pm-plaintext-key-value",
      enabled: true,
      unlimited: true,
      remainQuota: 0,
      usedQuota: 0,
      expiredAt: -1,
      models: "",
      rpm: 0,
      grp: "default",
    })
  })

  it("rejects a malformed key row instead of returning partial data", async () => {
    server.use(
      http.get(`${origin}/api/tokens`, () =>
        HttpResponse.json(
          envelope({ items: [{ ...keyRow, id: "bogus" }], total: 1 }),
        ),
      ),
    )
    await expect(fetchPmApiKeys(accountRequest())).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })

  it("creates one key and reads the created record back by its secret", async () => {
    const created = {
      ...keyRow,
      id: 6800,
      name: "disposable",
      key: "sk-pm-created-secret",
    }
    server.use(
      http.post(`${origin}/api/tokens`, () =>
        HttpResponse.json(envelope({ keys: ["sk-pm-created-secret"] })),
      ),
      http.get(`${origin}/api/tokens`, () =>
        HttpResponse.json(
          envelope({ items: [{ ...keyRow, id: 6741 }, created], total: 2 }),
        ),
      ),
    )
    const result = await createPmApiKey(accountRequest(), {
      name: "disposable",
      unlimited: true,
      remainQuota: 0,
      expiredAt: -1,
      models: "",
      subnet: "",
      rpm: 0,
      grp: "",
    })
    expect(result.secret).toBe("sk-pm-created-secret")
    expect(result.item).toMatchObject({ id: 6800, name: "disposable" })
  })

  it("updates a key and reads the saved record back from the list", async () => {
    const bodies: unknown[] = []
    server.use(
      http.put(`${origin}/api/tokens/6741`, async (info) => {
        bodies.push(await info.request.json())
        return HttpResponse.json(envelope(null))
      }),
      http.get(`${origin}/api/tokens`, () =>
        HttpResponse.json(
          envelope({
            items: [
              {
                ...keyRow,
                name: "renamed",
                status: PMAPI_KEY_STATUSES.Disabled,
              },
            ],
            total: 1,
          }),
        ),
      ),
    )
    const updated = await updatePmApiKey(accountRequest(), "6741", {
      name: "renamed",
      unlimited: true,
      remainQuota: 0,
      expiredAt: -1,
      models: "",
      subnet: "",
      rpm: 0,
      grp: "",
    })
    expect(bodies[0]).toMatchObject({ name: "renamed" })
    expect(updated).toMatchObject({ name: "renamed" })
  })

  it("toggles status with the console's minimal partial write", async () => {
    const bodies: unknown[] = []
    server.use(
      http.put(`${origin}/api/tokens/6741`, async (info) => {
        bodies.push(await info.request.json())
        return HttpResponse.json(envelope(null))
      }),
      http.get(`${origin}/api/tokens`, () =>
        HttpResponse.json(
          envelope({
            items: [{ ...keyRow, status: PMAPI_KEY_STATUSES.Disabled }],
            total: 1,
          }),
        ),
      ),
    )
    const updated = await setPmApiKeyStatus(
      accountRequest(),
      "6741",
      PMAPI_KEY_STATUSES.Disabled,
    )
    expect(bodies[0]).toEqual({ status: 2 })
    expect(updated).toMatchObject({ enabled: false })
  })

  it("regenerates a key and returns the new plaintext secret", async () => {
    server.use(
      http.post(`${origin}/api/tokens/6741/regenerate`, () =>
        HttpResponse.json(envelope("sk-pm-rotated-secret")),
      ),
    )
    const secret = await regeneratePmApiKey(accountRequest(), "6741")
    expect(secret).toBe("sk-pm-rotated-secret")
  })

  it("deletes a key", async () => {
    const deleted = vi.fn(() => HttpResponse.json(envelope(null)))
    server.use(http.delete(`${origin}/api/tokens/6741`, deleted))
    await deletePmApiKey(accountRequest(), "6741")
    expect(deleted).toHaveBeenCalled()
  })

  it("rejects a non-numeric key locator before any request", async () => {
    await expect(
      regeneratePmApiKey(accountRequest(), "../../admin"),
    ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
  })
})

describe("PM-API check-in", () => {
  afterEach(() => vi.restoreAllMocks())

  it("reads today's status from the account identity", async () => {
    const calendar = vi.fn(() =>
      HttpResponse.json(envelope({ days: 3, streak: 1, total: 150_000 })),
    )
    mockIdentity([http.get(`${origin}/api/me/checkin`, calendar)])
    const overview = await fetchPmApiCheckInOverview(accountRequest())
    expect(overview.checkedInToday).toBe(false)
    expect(overview.streak).toBe(1)
    expect(calendar).toHaveBeenCalledOnce()
  })

  it("reports an already-checked account without mutating", async () => {
    const claim = vi.fn(() => HttpResponse.json(envelope({ quota: 50_000 })))
    server.use(
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope({ ...identity, checked_in_today: true })),
      ),
      http.post(`${origin}/api/me/checkin`, claim),
    )
    const result = await performPmApiCheckIn(accountRequest())
    expect(result.alreadyChecked).toBe(true)
    expect(claim).not.toHaveBeenCalled()
  })

  it("performs a check-in and reports the granted quota", async () => {
    mockIdentity([
      http.post(`${origin}/api/me/checkin`, () =>
        HttpResponse.json(envelope({ quota: 50_000 })),
      ),
    ])
    const result = await performPmApiCheckIn(accountRequest())
    expect(result.alreadyChecked).toBe(false)
    expect(result.quotaGranted).toBe(50_000)
  })
})

describe("PM-API redemption", () => {
  it("redeems a code and reports the granted quota", async () => {
    mockIdentity([
      http.post(`${origin}/api/me/redeem`, async (info) => {
        await expect(info.request.json()).resolves.toEqual({ code: "TESTCODE" })
        return HttpResponse.json(envelope({ quota: 250_000 }))
      }),
    ])
    const result = await redeemPmApiCode(accountRequest(), "TESTCODE")
    expect(result.quotaGranted).toBe(250_000)
  })
})

describe("PM-API aff", () => {
  it("builds the invite link from the account origin", async () => {
    mockIdentity([
      http.get(`${origin}/api/me/aff`, () =>
        HttpResponse.json(
          envelope({
            code: "ABCD",
            count: 0,
            invited: [],
            invitee_reward: 100_000,
            reward: 250_000,
          }),
        ),
      ),
    ])
    const aff = await fetchPmApiAff(accountRequest())
    expect(aff.inviteUrl).toBe(`${origin}/register?aff=ABCD`)
    expect(aff.code).toBe("ABCD")
  })
})

describe("PM-API announcements", () => {
  it("reads the site notice and announcement rows from the public status", async () => {
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(
          envelope({
            name: "PM-API",
            notice: "主帖是 https://linux.do/t/topic/2948866 喵",
            announcements: [{ title: "维护公告", content: "今晚维护" }],
            checkin_enabled: true,
          }),
        ),
      ),
    )
    const items = await fetchPmApiAnnouncements(accountRequest())
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      title: "维护公告",
      content: "今晚维护",
    })
    expect(items[1]?.title).toContain("主帖")
  })

  it("answers deployment check-in support from the public status", async () => {
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(envelope({ checkin_enabled: false })),
      ),
    )
    await expect(fetchPmApiCheckInSupport(accountRequest())).resolves.toBe(
      false,
    )
  })

  it("keeps the grant offered when only execution needs the site's slider", async () => {
    // Verified live on pap.pmcat.top: the POST answers 请先完成人机验证, which
    // execution reports as manual verification; the method stays visible.
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(
          envelope({
            checkin_enabled: true,
            captcha: {
              enabled: true,
              scenes: ["register", "login", "checkin"],
            },
          }),
        ),
      ),
    )
    await expect(fetchPmApiCheckInSupport(accountRequest())).resolves.toBe(true)
  })

  it("keeps automated check-in available without a checkin captcha scene", async () => {
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(
          envelope({
            checkin_enabled: true,
            captcha: { enabled: true, scenes: ["register", "login"] },
          }),
        ),
      ),
    )
    await expect(fetchPmApiCheckInSupport(accountRequest())).resolves.toBe(true)
  })
})

describe("PM-API token groups", () => {
  it("lists selectable token groups", async () => {
    mockIdentity([
      http.get(`${origin}${PMAPI_ENDPOINTS.TokenGroups}`, () =>
        HttpResponse.json(envelope(["default", "Free", "Nvidia"])),
      ),
    ])
    // Plain-string rows stay accepted; the ratio defaults to 1 so the editor
    // can still show a secondary label for older deployments.
    await expect(fetchPmApiTokenGroups(accountRequest())).resolves.toEqual([
      { name: "default", ratio: 1 },
      { name: "Free", ratio: 1 },
      { name: "Nvidia", ratio: 1 },
    ])
  })
})
