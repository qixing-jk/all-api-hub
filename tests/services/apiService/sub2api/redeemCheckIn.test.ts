import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchSub2ApiProCheckInStatus,
  getSub2ApiRedeemCheckInErrorReason,
  submitSub2ApiProCheckIn,
} from "~/services/apiService/sub2api/redeemCheckIn"
import {
  SUB2API_REDEEM_CHECKIN_ENDPOINT,
  SUB2API_REDEEM_CHECKIN_ERROR_REASONS,
  SUB2API_REDEEM_CHECKIN_STATUS_ENDPOINT,
} from "~/services/apiService/sub2api/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

// Contract pinned to jiangmuran/sub2api_pro@3f858570 and Wei-Shaw/sub2api#510.
// Tests use placeholder hosts and credentials only.

const { mockExecuteAuthed, mockFetchApiResponse } = vi.hoisted(() => ({
  // Delegates the runner so tests receive the fully-hydrated request and can
  // assert transport parsing/error-classification in isolation.
  mockExecuteAuthed: vi.fn(),
  mockFetchApiResponse: vi.fn(),
}))

vi.mock("~/services/apiService/sub2api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/apiService/sub2api")>()
  return {
    ...actual,
    executeSub2ApiAuthenticatedRequest: mockExecuteAuthed,
  }
})

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiResponse: mockFetchApiResponse,
}))

vi.mock("~/utils/i18n/core", () => ({
  t: (key: string) => key,
}))

const baseRequest = {
  baseUrl: "https://sub2api.example.invalid",
  accountId: "acct-1",
  auth: {
    authType: "access_token" as const,
    accessToken: "placeholder-jwt",
  },
} as unknown as ApiServiceRequest

/**
 * Wires executeSub2ApiAuthenticatedRequest to call the runner with the same
 * request, and stubs fetchApiResponse to return the given response.
 */
const stubResponse = (body: unknown, ok = true, status = 200) => {
  mockExecuteAuthed.mockImplementationOnce(
    async (
      _req: ApiServiceRequest,
      _endpoint: string,
      runner: (r: ApiServiceRequest) => Promise<unknown>,
    ) => runner(_req),
  )
  mockFetchApiResponse.mockResolvedValueOnce({
    ok,
    status,
    headers: new Headers(),
    body,
  })
}

const stubErrorResponse = (body: unknown, status: number) =>
  stubResponse(body, false, status)

describe("Sub2API redeem check-in transport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("status parsing", () => {
    it("parses a valid status envelope with optional reward_amount", async () => {
      stubResponse({
        code: 0,
        message: "success",
        data: {
          enabled: true,
          checked_in_today: false,
          reward_min: 1,
          reward_max: 5,
          reward_amount: 3,
        },
      })
      const status = await fetchSub2ApiProCheckInStatus(baseRequest)
      expect(status).toEqual({
        enabled: true,
        checked_in_today: false,
        reward_min: 1,
        reward_max: 5,
        reward_amount: 3,
      })
    })

    it("parses a valid status envelope without optional reward_amount", async () => {
      stubResponse({
        code: 0,
        message: "success",
        data: {
          enabled: false,
          checked_in_today: true,
          reward_min: 0,
          reward_max: 0,
        },
      })
      const status = await fetchSub2ApiProCheckInStatus(baseRequest)
      expect(status.checked_in_today).toBe(true)
      expect(status).not.toHaveProperty("reward_amount")
    })

    it("rejects a non-boolean enabled field", async () => {
      stubResponse({
        code: 0,
        message: "success",
        data: {
          enabled: "yes",
          checked_in_today: false,
          reward_min: 0,
          reward_max: 0,
        },
      })
      await expect(fetchSub2ApiProCheckInStatus(baseRequest)).rejects.toThrow(
        "messages:errors.api.invalidResponseFormat",
      )
    })

    it("rejects non-finite numeric reward bounds", async () => {
      stubResponse({
        code: 0,
        message: "success",
        data: {
          enabled: true,
          checked_in_today: false,
          reward_min: NaN,
          reward_max: 0,
        },
      })
      await expect(fetchSub2ApiProCheckInStatus(baseRequest)).rejects.toThrow()
    })

    it("rejects reversed reward bounds", async () => {
      stubResponse({
        code: 0,
        message: "success",
        data: {
          enabled: true,
          checked_in_today: false,
          reward_min: 10,
          reward_max: 5,
        },
      })
      await expect(fetchSub2ApiProCheckInStatus(baseRequest)).rejects.toThrow(
        "messages:errors.api.invalidResponseFormat",
      )
    })

    it("rejects negative reward_min", async () => {
      stubResponse({
        code: 0,
        message: "success",
        data: {
          enabled: true,
          checked_in_today: false,
          reward_min: -1,
          reward_max: 5,
        },
      })
      await expect(fetchSub2ApiProCheckInStatus(baseRequest)).rejects.toThrow(
        "messages:errors.api.invalidResponseFormat",
      )
    })

    it("rejects missing required success fields", async () => {
      stubResponse({
        code: 0,
        message: "success",
        data: { enabled: true, checked_in_today: false },
      })
      await expect(fetchSub2ApiProCheckInStatus(baseRequest)).rejects.toThrow()
    })

    it("rejects array data wrappers", async () => {
      stubResponse({ code: 0, message: "success", data: [] })
      await expect(fetchSub2ApiProCheckInStatus(baseRequest)).rejects.toThrow()
    })

    it("rejects a non-zero business code as not success", async () => {
      stubResponse({ code: 500, message: "fail", data: null })
      await expect(fetchSub2ApiProCheckInStatus(baseRequest)).rejects.toThrow()
    })
  })

  describe("result parsing", () => {
    it("parses a valid check-in result envelope", async () => {
      stubResponse({
        code: 0,
        message: "success",
        data: {
          message: "Checked in",
          reward_amount: 2,
          new_balance: 42,
          checked_in_at: "2026-01-01T00:00:00Z",
        },
      })
      const result = await submitSub2ApiProCheckIn(baseRequest)
      expect(result).toEqual({
        message: "Checked in",
        reward_amount: 2,
        new_balance: 42,
        checked_in_at: "2026-01-01T00:00:00Z",
      })
    })

    it("rejects a check-in result missing required fields", async () => {
      stubResponse({
        code: 0,
        message: "success",
        data: { message: "Checked in", reward_amount: 2 },
      })
      await expect(submitSub2ApiProCheckIn(baseRequest)).rejects.toThrow()
    })
  })

  describe("HTTP error envelope normalization", () => {
    it("extracts DAILY_CHECKIN_ALREADY_DONE reason from 409", async () => {
      stubErrorResponse(
        { code: 409, message: "already", reason: "DAILY_CHECKIN_ALREADY_DONE" },
        409,
      )
      await expect(
        fetchSub2ApiProCheckInStatus(baseRequest),
      ).rejects.toMatchObject({
        statusCode: 409,
        upstreamCode:
          SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinAlreadyDone,
      })
    })

    it("forces 409 for DAILY_CHECKIN_ALREADY_DONE when HTTP drifts", async () => {
      stubErrorResponse(
        { code: 200, message: "already", reason: "DAILY_CHECKIN_ALREADY_DONE" },
        400,
      )
      await expect(
        fetchSub2ApiProCheckInStatus(baseRequest),
      ).rejects.toMatchObject({
        statusCode: 409,
        upstreamCode:
          SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinAlreadyDone,
      })
    })

    it("extracts DAILY_CHECKIN_DISABLED reason and forces 403", async () => {
      stubErrorResponse(
        { code: 403, message: "disabled", reason: "DAILY_CHECKIN_DISABLED" },
        403,
      )
      await expect(
        fetchSub2ApiProCheckInStatus(baseRequest),
      ).rejects.toMatchObject({
        statusCode: 403,
        upstreamCode: SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinDisabled,
      })
    })

    it("extracts DAILY_CHECKIN_ROLE_FORBIDDEN reason and forces 403", async () => {
      stubErrorResponse(
        {
          code: 500,
          message: "forbidden",
          reason: "DAILY_CHECKIN_ROLE_FORBIDDEN",
        },
        500,
      )
      await expect(
        fetchSub2ApiProCheckInStatus(baseRequest),
      ).rejects.toMatchObject({
        statusCode: 403,
        upstreamCode:
          SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinRoleForbidden,
      })
    })

    it("does not force 409 for DAILY_CHECKIN_ALREADY_DONE on 403", async () => {
      // Already-done on a 403 keeps 403 (the forced 409 path excludes 403).
      stubErrorResponse(
        { code: 403, message: "done", reason: "DAILY_CHECKIN_ALREADY_DONE" },
        403,
      )
      await expect(
        fetchSub2ApiProCheckInStatus(baseRequest),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it("falls back to HTTP status when reason is unrecognized", async () => {
      stubErrorResponse(
        { code: 500, message: "unknown", reason: "SOME_OTHER_REASON" },
        500,
      )
      await expect(
        fetchSub2ApiProCheckInStatus(baseRequest),
      ).rejects.toMatchObject({
        statusCode: 500,
        upstreamCode: undefined,
      })
    })

    it("falls back when body is missing", async () => {
      stubErrorResponse(undefined, 500)
      await expect(
        fetchSub2ApiProCheckInStatus(baseRequest),
      ).rejects.toMatchObject({ statusCode: 500 })
    })

    it("uses a fallback message when backend message is empty", async () => {
      stubErrorResponse({ reason: "DAILY_CHECKIN_DISABLED" }, 403)
      await expect(
        fetchSub2ApiProCheckInStatus(baseRequest),
      ).rejects.toMatchObject({
        message: expect.stringContaining("403"),
        statusCode: 403,
      })
    })
  })

  describe("getSub2ApiRedeemCheckInErrorReason", () => {
    it("returns the reason for a known ApiError", () => {
      const error = new ApiError(
        "done",
        409,
        SUB2API_REDEEM_CHECKIN_ENDPOINT,
        API_ERROR_CODES.HTTP_403,
        SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinAlreadyDone,
      )
      expect(getSub2ApiRedeemCheckInErrorReason(error)).toBe(
        SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinAlreadyDone,
      )
    })

    it("returns undefined for a non-ApiError", () => {
      expect(getSub2ApiRedeemCheckInErrorReason(new Error("boom"))).toBe(
        undefined,
      )
    })

    it("returns undefined when upstreamCode is not a known reason", () => {
      const error = new ApiError(
        "x",
        500,
        SUB2API_REDEEM_CHECKIN_STATUS_ENDPOINT,
        API_ERROR_CODES.HTTP_OTHER,
        "UNRECOGNIZED",
      )
      expect(getSub2ApiRedeemCheckInErrorReason(error)).toBeUndefined()
    })
  })
})
