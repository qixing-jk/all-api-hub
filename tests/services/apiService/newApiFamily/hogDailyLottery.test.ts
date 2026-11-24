import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  declaresHogLotterySource,
  fetchHogLotteryStatus,
  parseHogLotteryResult,
  parseHogLotteryStatus,
  performHogLotteryDraw,
} from "~/services/apiService/newApiFamily/variants/hogDailyLottery"
import { getHogLotteryPeriodKey } from "~/services/apiService/newApiFamily/variants/hogDailyLotteryProtocol"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { envelope: vi.fn() },
}))

const unchecked = { remaining: 1, daily_limit: 1, my_draw: null, rank: null }
const draw = {
  prizeName: "Prize",
  prizeLabel: "Native quota",
  quotaAmount: 123,
  createdAt: "2026-11-24T03:00:00Z",
}
const result = {
  prizeCode: "p",
  prizeName: "Prize",
  prizeLabel: "Native quota",
  quotaAmount: 123,
  boardIndex: 0,
  prizeIcon: "",
  prizeTone: "gold",
}
const request = {
  baseUrl: "https://example.test",
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "fixture-token",
    userId: "42",
  },
  allowAccountCredentialRecovery: true,
}

describe("Hog lottery source contract", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-24T04:00:00Z"))
    vi.resetAllMocks()
  })
  afterEach(() => vi.useRealTimers())

  it("accepts the exact unchecked and today's drawn DTO", () => {
    expect(parseHogLotteryStatus(unchecked)).toEqual(unchecked)
    expect(
      parseHogLotteryStatus({
        remaining: 0,
        daily_limit: 1,
        my_draw: draw,
        rank: 1,
      }),
    ).toMatchObject({ remaining: 0 })
  })
  it.each([
    { ...unchecked, remaining: "1" },
    { ...unchecked, daily_limit: 2 },
    { ...unchecked, my_draw: draw },
    { ...unchecked, rank: 1 },
    { remaining: 0, daily_limit: 1, my_draw: null, rank: null },
    {
      remaining: 0,
      daily_limit: 1,
      my_draw: { ...draw, quotaAmount: -1 },
      rank: 1,
    },
    {
      remaining: 0,
      daily_limit: 1,
      my_draw: { ...draw, createdAt: 1795489200 },
      rank: 1,
    },
    {
      remaining: 0,
      daily_limit: 1,
      my_draw: { ...draw, createdAt: "2026-11-23T03:00:00Z" },
      rank: 1,
    },
    {
      remaining: 0,
      daily_limit: 1,
      my_draw: { ...draw, createdAt: "2026-11-24T05:00:00Z" },
      rank: 1,
    },
  ])("rejects malformed, stale or future status %j", (input) =>
    expect(() => parseHogLotteryStatus(input)).toThrow(),
  )

  it("has a Shanghai midnight boundary regardless of the client timezone", () => {
    expect(getHogLotteryPeriodKey(Date.parse("2026-11-24T15:59:59Z"))).toBe(
      "2026-11-24",
    )
    expect(getHogLotteryPeriodKey(Date.parse("2026-11-24T16:00:00Z"))).toBe(
      "2026-11-25",
    )
  })
  it("rejects status delivered across Shanghai midnight", async () => {
    vi.setSystemTime(new Date("2026-11-24T15:59:59Z"))
    vi.mocked(newApiFamilyRequests.envelope).mockImplementationOnce(
      async () => {
        vi.setSystemTime(new Date("2026-11-24T16:00:01Z"))
        return { success: true, message: "", data: unchecked }
      },
    )
    await expect(fetchHogLotteryStatus(request)).rejects.toThrow()
  })
  it.each([0, 123])(
    "retains an explicit quotaAmount=%s without interpreting its label",
    (quotaAmount) => {
      expect(parseHogLotteryResult({ ...result, quotaAmount })).toMatchObject({
        quotaAmount,
      })
    },
  )
  it.each([undefined, "123", -1, Number.NaN])(
    "rejects malformed quotaAmount=%s",
    (quotaAmount) =>
      expect(() => parseHogLotteryResult({ ...result, quotaAmount })).toThrow(),
  )
  it.each([
    "https://github.com/Mr-Groundhog/hog-api-gateway",
    "source: [repo](https://github.com/mr-groundhog/hog-api-gateway/)",
  ])("recognizes a normalized exact upstream declaration", (notice) =>
    expect(declaresHogLotterySource(notice)).toBe(true),
  )
  it.each([
    "https://github.com/Mr-Groundhog/hog-api-gateway-other",
    "https://github.com/Mr-Groundhog/hog-api-gateway?fake=1",
    "https://github.com/Mr-Groundhog/hog-api-gateway/issues",
    "https://github.com@evil.test/Mr-Groundhog/hog-api-gateway",
    null,
  ])("rejects unrelated or credential-bearing declarations %j", (notice) =>
    expect(declaresHogLotterySource(notice)).toBe(false),
  )
  it("marks a single empty-body draw as a mutation without credential/page recovery", async () => {
    vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
      success: true,
      message: "",
      data: result,
    })
    await performHogLotteryDraw(request)
    expect(newApiFamilyRequests.envelope).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ allowAccountCredentialRecovery: false }),
      expect.objectContaining({
        endpoint: "/api/lottery/draw",
        operationSemantics: "mutation",
        currentTabTransport: "disabled",
        tempWindowFallback: { codes: [], statusCodes: [] },
        options: { method: "POST", cache: "no-store", body: "{}" },
      }),
    )
  })
  it("does not replay an uncertain draw", async () => {
    vi.mocked(newApiFamilyRequests.envelope).mockRejectedValue(
      new TypeError("lost response"),
    )
    await expect(performHogLotteryDraw(request)).rejects.toThrow(
      "lost response",
    )
    expect(newApiFamilyRequests.envelope).toHaveBeenCalledOnce()
  })
})
