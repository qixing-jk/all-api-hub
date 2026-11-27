import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Sub2ApiAuthSessionRequest } from "~/services/apiService/sub2api/auth/authSession"
import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import {
  BizDecipherCheckInUnconfirmedError,
  fetchBizDecipherDailyCheckInStatus,
  performBizDecipherDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/bizdecipherCheckIn"
import * as userCheckInProtocol from "~/services/apiService/sub2api/checkin/userCheckInProtocol"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import {
  API_DIRECT_REQUEST_REASONS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))
vi.mock("~/services/apiService/sub2api/auth/browserAuth", () => ({
  recoverSub2ApiBrowserAuth: vi.fn(),
}))
vi.mock("~/services/apiService/sub2api/auth/tokenRefresh", () => ({
  refreshSub2ApiTokens: vi.fn(),
}))

const request: ApiServiceRequest = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: "https://biz.example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "42",
  },
}
const statusData = {
  date: "2026-11-24",
  free_claimed: false,
  balance: 8,
  credit_balance: 40,
}
const response = (data: unknown) => ({
  ok: true,
  status: 200,
  headers: {},
  body: { code: 0, message: "success", data },
})
const receipt = (operationId: string) => ({
  operation_id: operationId,
  type: "free",
  date: "2026-11-24",
  cost: 0,
  reward: 12,
  reward_asset: "credit",
  balance_after: 8,
  credit_balance_after: 52,
  already_claimed: false,
})

describe("BizDecipher free daily check-in protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApiResponse).mockReset()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-24T05:00:00Z"))
    vi.spyOn(userCheckInProtocol, "resolveUserCheckInTimezone").mockReturnValue(
      "UTC",
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("cancels a queued claim before it can dispatch after the requested timezone rolls over", async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(new Date("2026-11-24T15:59:59Z"))
    vi.spyOn(userCheckInProtocol, "resolveUserCheckInTimezone").mockReturnValue(
      "Asia/Singapore",
    )
    const send = vi.fn()
    vi.mocked(fetchApiResponse).mockImplementation(async (queued, input) => {
      if (input.options?.method !== "POST")
        throw new ApiError("Missing operation", 404)
      await new Promise<void>((resolve) => setTimeout(resolve, 1500))
      queued.abortSignal?.throwIfAborted()
      send()
      return response(
        receipt(JSON.parse(String(input.options.body)).operation_id),
      )
    })
    const claim = performBizDecipherDailyCheckIn(request).catch(
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(1600)
    expect(send).not.toHaveBeenCalled()
    expect(await claim).toBeInstanceOf(Error)
  })

  it.each([false, true])(
    "reads free completion without authentication recovery (%s)",
    async (checked) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        response({ ...statusData, free_claimed: checked }),
      )
      await expect(
        fetchBizDecipherDailyCheckInStatus(request),
      ).resolves.toEqual({ enabled: true, checkedInToday: checked })
      expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        {
          endpoint: "/api/v1/user/checkin/status?timezone=UTC",
          options: {
            method: "GET",
            cache: "no-store",
            headers: { "X-User-UI-Request": "1" },
          },
        },
      )
      expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
      expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
    },
  )

  it.each([
    { free_claimed: undefined },
    { free_claimed: "false" },
    { date: "2026-02-30" },
    { date: "2026-11-23" },
    { date: "2026-11-25" },
    { date: undefined },
    { balance: "8" },
    { credit_balance: Number.NaN },
    { checked_in_today: false },
    { today_checked_in: true },
  ])("rejects incomplete or contradictory status %j", async (fields) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response({ ...statusData, ...fields }),
    )
    await expect(
      fetchBizDecipherDailyCheckInStatus(request),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("posts only the native free type with the same operation ID in body and header", async () => {
    vi.mocked(fetchApiResponse).mockImplementation(async (_, input) => {
      const body = JSON.parse(String(input.options?.body))
      expect(body).toEqual({
        type: "free",
        operation_id: expect.stringMatching(/^free-/),
      })
      expect(input.endpoint).toBe("/api/v1/user/checkin/claim")
      expect(input.options?.headers).toEqual({
        "X-User-UI-Request": "1",
        "Idempotency-Key": body.operation_id,
      })
      return response(receipt(body.operation_id))
    })
    await expect(
      performBizDecipherDailyCheckIn(request),
    ).resolves.toMatchObject({
      alreadyClaimed: false,
      reward: 12,
      rewardAsset: "credit",
      day: "2026-11-24",
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })

  it("recovers a lost claim response by querying its operation without repeating the POST", async () => {
    let operationId = ""
    const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }
    vi.mocked(fetchApiResponse).mockImplementation(
      async (actualRequest, input) => {
        if (input.options?.method === "POST") {
          operationId = JSON.parse(String(input.options.body)).operation_id
          throw new TypeError("Lost response")
        }
        expect(input.endpoint).toBe(
          `/api/v1/user/checkin/operations/${operationId}?timezone=UTC`,
        )
        expect(actualRequest.observer).toBeUndefined()
        return response(receipt(operationId))
      },
    )
    await expect(
      performBizDecipherDailyCheckIn({ ...request, observer }),
    ).resolves.toMatchObject({ reward: 12 })
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
  })

  it.each([
    { operation_id: "another-operation" },
    { type: "credit" },
    { type: "balance" },
    { cost: 20 },
    { cost: -1 },
    { reward: Number.NaN },
    { reward: -1 },
    { reward_asset: "usd" },
    { already_claimed: undefined },
    { date: "invalid" },
    { date: "2026-11-23" },
    { date: "2026-11-25" },
    { balance_after: undefined },
  ])("does not confirm an invalid or paid receipt %j", async (fields) => {
    vi.mocked(fetchApiResponse).mockImplementation(async (_, input) => {
      const operationId =
        input.options?.method === "POST"
          ? JSON.parse(String(input.options.body)).operation_id
          : input.endpoint.split("/").at(-1)!.split("?")[0]
      return response({ ...receipt(operationId), ...fields })
    })
    await expect(
      performBizDecipherDailyCheckIn(request),
    ).rejects.toBeInstanceOf(BizDecipherCheckInUnconfirmedError)
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.filter(([, input]) => input.options?.method === "POST"),
    ).toHaveLength(1)
  })

  it("retains uncertainty when neither the claim nor its operation can be read", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(new TypeError("Offline"))
    await expect(
      performBizDecipherDailyCheckIn(request),
    ).rejects.toBeInstanceOf(BizDecipherCheckInUnconfirmedError)
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
  })

  it("keeps a dispatched claim uncertain when the caller cancels before the receipt", async () => {
    const controller = new AbortController()
    let operationId = ""
    vi.mocked(fetchApiResponse).mockImplementation(async (_, input) => {
      operationId = JSON.parse(String(input.options?.body)).operation_id
      controller.abort()
      throw controller.signal.reason
    })

    const result = await performBizDecipherDailyCheckIn({
      ...request,
      abortSignal: controller.signal,
    }).catch((error: unknown) => error)

    expect(result).toBeInstanceOf(BizDecipherCheckInUnconfirmedError)
    expect(result).toHaveProperty("operationId", operationId)
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })

  it("checks the native GET timezone day rather than the UTC date", async () => {
    vi.mocked(userCheckInProtocol.resolveUserCheckInTimezone).mockReturnValue(
      "Asia/Shanghai",
    )
    vi.setSystemTime(new Date("2026-11-23T16:00:01Z"))
    vi.mocked(fetchApiResponse).mockResolvedValue(response(statusData))
    await expect(
      fetchBizDecipherDailyCheckInStatus(request),
    ).resolves.toMatchObject({ checkedInToday: false })
    expect(vi.mocked(fetchApiResponse).mock.calls[0]?.[1]?.endpoint).toContain(
      "timezone=Asia%2FShanghai",
    )
  })

  it("does not label a status read crossing the requested timezone midnight as today", async () => {
    vi.mocked(userCheckInProtocol.resolveUserCheckInTimezone).mockReturnValue(
      "Asia/Shanghai",
    )
    vi.setSystemTime(new Date("2026-11-23T15:59:59Z"))
    vi.mocked(fetchApiResponse).mockImplementation(async () => {
      vi.setSystemTime(new Date("2026-11-23T16:00:01Z"))
      return response(statusData)
    })
    await expect(
      fetchBizDecipherDailyCheckInStatus(request),
    ).rejects.toBeInstanceOf(ApiError)
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })

  it("keeps a claim crossing midnight uncertain even when the old operation receipt exists", async () => {
    vi.mocked(userCheckInProtocol.resolveUserCheckInTimezone).mockReturnValue(
      "Asia/Shanghai",
    )
    vi.setSystemTime(new Date("2026-11-24T15:59:59Z"))
    let operationId = ""
    vi.mocked(fetchApiResponse).mockImplementation(async (_, input) => {
      if (input.options?.method === "POST") {
        operationId = JSON.parse(String(input.options.body)).operation_id
        vi.setSystemTime(new Date("2026-11-24T16:00:01Z"))
      }
      return response(receipt(operationId))
    })
    await expect(
      performBizDecipherDailyCheckIn(request),
    ).rejects.toBeInstanceOf(BizDecipherCheckInUnconfirmedError)
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.filter(([, input]) => input.options?.method === "POST"),
    ).toHaveLength(1)
  })

  it("does not submit against a pre-mutation proof from the previous day", async () => {
    vi.mocked(userCheckInProtocol.resolveUserCheckInTimezone).mockReturnValue(
      "Asia/Shanghai",
    )
    const observedAt = new Date("2026-11-23T15:59:59Z").getTime()
    vi.setSystemTime(new Date("2026-11-23T16:00:01Z"))
    await expect(
      performBizDecipherDailyCheckIn(request, observedAt),
    ).rejects.toBeInstanceOf(ApiError)
    expect(fetchApiResponse).not.toHaveBeenCalled()
  })

  it("discards the admission proof if saved credentials load after midnight", async () => {
    vi.setSystemTime(new Date("2026-11-24T23:59:59Z"))
    const savedRequest: Sub2ApiAuthSessionRequest = {
      ...request,
      accountId: "saved-account",
      sub2apiAuthSession: {
        getLatestAuth: async () => {
          vi.setSystemTime(new Date("2026-11-25T00:00:01Z"))
          return { userId: "42", accessToken: "saved-token" }
        },
        persistAuthUpdate: vi.fn(),
      },
    }

    await expect(
      performBizDecipherDailyCheckIn(savedRequest),
    ).rejects.toBeInstanceOf(ApiError)
    expect(fetchApiResponse).not.toHaveBeenCalled()
    expect(
      savedRequest.sub2apiAuthSession?.persistAuthUpdate,
    ).not.toHaveBeenCalled()
  })

  it.each([401, 403])(
    "does not recover or replay a denied claim (%s)",
    async (status) => {
      vi.mocked(fetchApiResponse).mockResolvedValue({
        ...response(null),
        ok: false,
        status,
        body: { code: "UNAUTHORIZED", message: "Denied" },
      })
      await expect(
        performBizDecipherDailyCheckIn(request),
      ).rejects.toMatchObject({ statusCode: status })
      expect(fetchApiResponse).toHaveBeenCalledTimes(1)
      expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
      expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
    },
  )
})
