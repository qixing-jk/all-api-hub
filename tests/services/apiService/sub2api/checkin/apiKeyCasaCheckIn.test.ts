import { describe, expect, it, vi } from "vitest"

import {
  fetchApiKeyCasaDailyCheckInStatus,
  parseApiKeyCasaDailyCheckInStatusResponse,
  performApiKeyCasaDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/apiKeyCasaCheckIn"
import {
  API_KEY_CASA_DAILY_CHECK_IN_ENDPOINT,
  createApiKeyCasaDailyCheckInStatusEndpoint,
} from "~/services/apiService/sub2api/checkin/apiKeyCasaCheckInProtocol"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type { ApiTransportResponse } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))

const response = (
  body: unknown,
  status = 200,
): ApiTransportResponse<unknown> => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body,
})

describe("ApiKey Casa daily check-in protocol", () => {
  it("reads status with the same browser-timezone query as the dashboard", () => {
    expect(createApiKeyCasaDailyCheckInStatusEndpoint("Asia/Singapore")).toBe(
      "/api/v1/redeem/checkin?timezone=Asia%2FSingapore",
    )
  })

  it("reads eligibility before claiming", () => {
    expect(
      parseApiKeyCasaDailyCheckInStatusResponse(
        response({
          code: 0,
          message: "success",
          data: { checked_in: false, reward: 0.25 },
        }),
      ),
    ).toEqual({
      enabled: true,
      checkedInToday: false,
    })
  })

  it("treats a zero reward as disabled and retains today's checked state", () => {
    expect(
      parseApiKeyCasaDailyCheckInStatusResponse(
        response({
          code: 0,
          message: "success",
          data: { checked_in: true, reward: 0 },
        }),
      ),
    ).toEqual({
      enabled: false,
      checkedInToday: true,
    })
  })

  it.each([
    null,
    [],
    {},
    { checked_in: "false", reward: 1 },
    { checked_in: false, reward: Number.NaN },
    { checked_in: false, reward: -1 },
    { already_checked_in: true },
    { reward_amount: 0.25 },
  ])("rejects an invalid status DTO: %j", (data) => {
    expect(() =>
      parseApiKeyCasaDailyCheckInStatusResponse(
        response({ code: 0, message: "success", data }),
      ),
    ).toThrow(expect.objectContaining({ code: "JSON_PARSE_ERROR" }))
  })

  it("recognizes the checked status that the native POST installs in its redeem view", () => {
    expect(
      parseApiKeyCasaDailyCheckInStatusResponse(
        response({
          code: 0,
          message: "success",
          data: { checked_in: true, reward: 0.25 },
        }),
      ),
    ).toEqual({ enabled: true, checkedInToday: true })
  })

  it("does not treat a message-only mutation response as a confirmed claim", () => {
    expect(() =>
      parseApiKeyCasaDailyCheckInStatusResponse(
        response({ code: 0, message: "Check-in successful" }),
      ),
    ).toThrow(expect.objectContaining({ code: "JSON_PARSE_ERROR" }))
  })

  it("rejects a business error even when its data looks checked", () => {
    expect(() =>
      parseApiKeyCasaDailyCheckInStatusResponse(
        response({
          code: 1,
          message: "failed",
          data: { checked_in: true, reward: 1 },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "BUSINESS_ERROR" }))
  })

  it.each([401, 403, 404, 429, 500])(
    "keeps HTTP %s tied to the check-in endpoint even without a standard envelope",
    (statusCode) => {
      let thrown: unknown
      try {
        parseApiKeyCasaDailyCheckInStatusResponse(response({}, statusCode))
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(ApiError)
      expect(thrown).toMatchObject({
        statusCode,
        endpoint: API_KEY_CASA_DAILY_CHECK_IN_ENDPOINT,
      })
    },
  )

  it("accepts the native POST status without treating its reward as a receipt", async () => {
    const transport = vi
      .mocked(fetchApiResponse)
      .mockReset()
      .mockResolvedValue(
        response({
          code: 0,
          message: "success",
          data: { checked_in: true, reward: 0.25 },
        }),
      )
    await expect(
      performApiKeyCasaDailyCheckIn({
        baseUrl: "https://casa.example",
        directRequestReason: API_DIRECT_REQUEST_REASONS.CallerManaged,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "fixture",
          userId: "42",
        },
      }),
    ).resolves.toBeUndefined()
    expect(transport).toHaveBeenCalledOnce()
  })

  it.each([fetchApiKeyCasaDailyCheckInStatus, performApiKeyCasaDailyCheckIn])(
    "does not replay an unauthorized request",
    async (operation) => {
      const transport = vi
        .mocked(fetchApiResponse)
        .mockReset()
        .mockResolvedValue(
          response({ code: "UNAUTHORIZED", message: "expired" }, 401),
        )
      await expect(
        operation({
          baseUrl: "https://casa.example",
          directRequestReason: API_DIRECT_REQUEST_REASONS.CallerManaged,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "fixture",
            userId: "42",
          },
        }),
      ).rejects.toMatchObject({ statusCode: 401 })
      expect(transport).toHaveBeenCalledOnce()
    },
  )

  it.each([{ checked_in: false, reward: 0.25 }, { reward_amount: 0.25 }])(
    "submits once and rejects a POST that cannot confirm today: %j",
    async (data) => {
      const transport = vi
        .mocked(fetchApiResponse)
        .mockReset()
        .mockResolvedValue(response({ code: 0, message: "success", data }))
      const request = {
        baseUrl: "https://casa.example",
        directRequestReason: API_DIRECT_REQUEST_REASONS.CallerManaged,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "fixture",
          userId: "42",
        },
      }
      await expect(
        performApiKeyCasaDailyCheckIn(request),
      ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
      expect(transport).toHaveBeenCalledOnce()
      expect(transport).toHaveBeenCalledWith(expect.anything(), {
        endpoint: API_KEY_CASA_DAILY_CHECK_IN_ENDPOINT,
        options: { method: "POST", cache: "no-store" },
      })
    },
  )
})
