import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  performXiaobaiCodeDailyCheckIn,
  probeXiaobaiCodeCheckInStatus,
  XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS,
  XIAOBAI_CODE_STATUS_OUTCOMES,
} from "~/services/apiService/sub2api/checkin/xiaobaiCodeCheckIn"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))

const request: ApiServiceRequest = {
  baseUrl: "https://relay.example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "42",
  },
}

const textResponse = (body: string, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body,
})

const statusEnvelope = (signedToday = false, enabled = true) =>
  JSON.stringify({
    ok: true,
    data: {
      config: { enabled, dailyReward: "0.25" },
      user: { id: "3874", email: "private@example.invalid" },
      signedToday,
      records: [{ checkin_date: "2026-09-26" }],
    },
  })

describe("小白Code status probe", () => {
  beforeEach(() => {
    vi.mocked(fetchApiResponse).mockReset()
  })

  it("matches the app's status envelope from the fixed endpoint", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse(statusEnvelope(false)),
    )
    await expect(probeXiaobaiCodeCheckInStatus(request)).resolves.toEqual({
      outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Matched,
      status: { enabled: true, checkedInToday: false },
    })
    expect(fetchApiResponse).toHaveBeenCalledWith(expect.anything(), {
      endpoint: "/checkin/api/status",
      options: { method: "GET", cache: "no-store" },
      responseType: "text",
    })
  })

  it.each([
    [true, true],
    [false, false],
    [true, false],
  ])(
    "reads enabled/checked from the deployment (checked=%s enabled=%s)",
    async (signedToday, enabled) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        textResponse(statusEnvelope(signedToday, enabled)),
      )
      await expect(probeXiaobaiCodeCheckInStatus(request)).resolves.toEqual({
        outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Matched,
        status: { enabled, checkedInToday: signedToday },
      })
    },
  )

  it("treats an origin without the app as a different site, not a broken app", async () => {
    // Hosts that do not serve the app answer any unknown path from the SPA.
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse("<!doctype html><html><body>spa</body></html>"),
    )
    await expect(probeXiaobaiCodeCheckInStatus(request)).resolves.toEqual({
      outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Absent,
    })
  })

  it.each([404, 405])("treats HTTP %s as an absent app", async (status) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse("404 page not found", status),
    )
    await expect(probeXiaobaiCodeCheckInStatus(request)).resolves.toEqual({
      outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Absent,
    })
  })

  it.each([
    [401, "authentication_required"],
    [403, "permission_denied"],
    [500, "invalid_response"],
  ])("keeps HTTP %s unknown (%s)", async (status, reason) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse(JSON.stringify({ ok: false }), status),
    )
    await expect(probeXiaobaiCodeCheckInStatus(request)).resolves.toEqual({
      outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Unknown,
      reason,
    })
  })

  it("keeps an unauthorized login envelope unknown without judging the app", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue({
      ok: false,
      status: 401,
      headers: {},
      body: JSON.stringify({
        ok: false,
        code: "LOGIN_REQUIRED",
        message: "请先登录后再签到",
      }),
    })
    await expect(probeXiaobaiCodeCheckInStatus(request)).resolves.toEqual({
      outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Unknown,
      reason: "authentication_required",
    })
  })

  it.each([
    {},
    { ok: false, data: { config: { enabled: true }, signedToday: false } },
    { ok: true },
    { ok: true, data: { config: { enabled: "true" }, signedToday: false } },
    { ok: true, data: { config: { enabled: true }, signedToday: 0 } },
  ])(
    "keeps a JSON answer with an unexpected shape unknown %j",
    async (body) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        textResponse(JSON.stringify(body)),
      )
      await expect(probeXiaobaiCodeCheckInStatus(request)).resolves.toEqual({
        outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Unknown,
        reason: "invalid_response",
      })
    },
  )

  it("surfaces a transport failure to the caller", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(probeXiaobaiCodeCheckInStatus(request)).rejects.toMatchObject({
      message: "Failed to fetch",
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })
})

describe("小白Code check-in", () => {
  beforeEach(() => {
    vi.mocked(fetchApiResponse).mockReset()
  })

  it.each([0.25, "0.25", "1.75000000"])(
    "reads a new award of %s without keeping the record",
    async (rewardAmount) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        textResponse(
          JSON.stringify({
            ok: true,
            data: {
              alreadyChecked: false,
              record: {
                id: 120662,
                reward_amount: rewardAmount,
                ip_address: "203.0.113.7",
              },
              status: { config: { enabled: true } },
            },
          }),
        ),
      )
      await expect(performXiaobaiCodeDailyCheckIn(request)).resolves.toEqual({
        kind: XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS.Applied,
        data: { rewardAmount: Number(rewardAmount) },
      })
    },
  )

  it("recognizes an already-checked day without award details", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse(
        JSON.stringify({ ok: true, data: { alreadyChecked: true } }),
      ),
    )
    await expect(performXiaobaiCodeDailyCheckIn(request)).resolves.toEqual({
      kind: XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
    })
  })

  it("submits a single POST with an empty JSON body", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse(
        JSON.stringify({ ok: true, data: { alreadyChecked: true } }),
      ),
    )
    await performXiaobaiCodeDailyCheckIn(request)
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    expect(fetchApiResponse).toHaveBeenCalledWith(expect.anything(), {
      endpoint: "/checkin/api/checkin",
      options: {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
      responseType: "text",
    })
  })

  it.each([
    ["not JSON at all"],
    [JSON.stringify({ ok: false, data: { alreadyChecked: false } })],
    [JSON.stringify({ ok: true, data: {} })],
    [JSON.stringify({ ok: true, data: { alreadyChecked: "false" } })],
    [JSON.stringify({ ok: true, data: { alreadyChecked: false } })],
    [
      JSON.stringify({
        ok: true,
        data: { alreadyChecked: false, record: { reward_amount: "abc" } },
      }),
    ],
    [
      JSON.stringify({
        ok: true,
        data: { alreadyChecked: false, record: { reward_amount: -1 } },
      }),
    ],
  ])("does not claim success for %s", async (body) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(textResponse(body))
    await expect(performXiaobaiCodeDailyCheckIn(request)).rejects.toThrow()
  })

  it.each([401, 403, 404, 405, 429, 500])(
    "preserves HTTP %s for the caller's error mapping",
    async (status) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        textResponse("nope", status),
      )
      await expect(
        performXiaobaiCodeDailyCheckIn(request),
      ).rejects.toMatchObject({ statusCode: status })
    },
  )

  it("does not replay a write whose response was lost", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(performXiaobaiCodeDailyCheckIn(request)).rejects.toMatchObject(
      { message: "Failed to fetch" },
    )
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })
})
