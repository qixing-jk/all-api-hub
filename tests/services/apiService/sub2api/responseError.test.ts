import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { fetchCurrentUser } from "~/services/apiService/sub2api/account/accountData"
import { SUB2API_SESSION_BINDING_MISMATCH_CODE } from "~/services/apiService/sub2api/auth/browserAuth"
import { decodeSub2ApiResponseError } from "~/services/apiService/sub2api/responseError"
import { mapCompatibilityResponse } from "~/services/apiTransport/compatibilityResponse"
import {
  API_ERROR_CODES,
  ApiError,
  isAuthenticationRequiredError,
} from "~/services/apiTransport/errors"
import type { ApiTransportResponse } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const response = (
  body: unknown,
  status = 400,
): ApiTransportResponse<unknown> => ({
  ok: false,
  status,
  headers: {},
  body,
})

describe("decodeSub2ApiResponseError", () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it.each([
    {
      name: "expired token",
      body: { code: 401, message: "JWT expired" },
      contentType: "application/json",
      expected: true,
    },
    {
      name: "session binding without a message",
      body: { code: SUB2API_SESSION_BINDING_MISMATCH_CODE },
      contentType: "application/json",
      expected: true,
    },
    {
      name: "HTML protection",
      body: "<html>Verify browser</html>",
      contentType: "text/html",
      expected: false,
    },
    {
      name: "unknown proxy JSON",
      body: { error: "proxy authorization required" },
      contentType: "application/json",
      expected: false,
    },
    {
      name: "empty JSON",
      body: {},
      contentType: "application/json",
      expected: false,
    },
    {
      name: "plain text",
      body: "Unauthorized",
      contentType: "text/plain",
      expected: false,
    },
  ])(
    "only admits recognized authentication failures: $name",
    ({ body, contentType, expected }) => {
      let failure: unknown
      try {
        mapCompatibilityResponse(
          {
            ok: false,
            status: 401,
            headers: { "content-type": contentType },
            body,
          },
          {
            endpoint: "/api/v1/auth/me",
            responseType: "json",
            onlyData: true,
            decodeApplicationError: true,
            errorResponseDecoder: decodeSub2ApiResponseError,
          },
        )
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(ApiError)
      expect(isAuthenticationRequiredError(failure)).toBe(expected)
    },
  )

  it("uses only a valid failed Sub2API envelope message", () => {
    expect(
      decodeSub2ApiResponseError(
        response({ code: 401, message: "  JWT expired  ", data: null }, 401),
        { endpoint: "/api/v1/auth/me" },
      ),
    ).toEqual({
      kind: "business",
      message: "JWT expired",
      upstreamCode: "401",
    })
  })

  it("prefers the deployment machine reason over the numeric HTTP code", () => {
    expect(
      decodeSub2ApiResponseError(
        response(
          {
            code: 403,
            message:
              "custom keys, IP restrictions, and rate limits are restricted to administrators",
            reason: "API_KEY_ADVANCED_SETTINGS_ADMIN_ONLY",
          },
          403,
        ),
        { endpoint: "/api/v1/keys" },
      ),
    ).toEqual({
      kind: "business",
      message:
        "custom keys, IP restrictions, and rate limits are restricted to administrators",
      upstreamCode: "API_KEY_ADVANCED_SETTINGS_ADMIN_ONLY",
    })
  })

  it.each(["invalid reason!", "line\nbreak", "A".repeat(65)])(
    "preserves the numeric code when the deployment reason is invalid: %#",
    (reason) => {
      expect(
        decodeSub2ApiResponseError(
          response({ code: 403, message: "Rejected", reason }, 403),
          { endpoint: "/api/v1/keys" },
        ),
      ).toEqual({
        kind: "business",
        message: "Rejected",
        upstreamCode: "403",
      })
    },
  )

  it("preserves the verified session-binding mismatch code", () => {
    expect(
      decodeSub2ApiResponseError(
        response(
          {
            code: SUB2API_SESSION_BINDING_MISMATCH_CODE,
            message: "Session network fingerprint changed",
          },
          401,
        ),
        { endpoint: "/api/v1/auth/me" },
      ),
    ).toEqual({
      kind: "business",
      message: "Session network fingerprint changed",
      upstreamCode: SUB2API_SESSION_BINDING_MISMATCH_CODE,
    })
  })

  it("preserves the session-binding mismatch code when its message is unusable", () => {
    expect(
      decodeSub2ApiResponseError(
        response(
          { code: SUB2API_SESSION_BINDING_MISMATCH_CODE, message: "   " },
          401,
        ),
        { endpoint: "/api/v1/auth/me" },
      ),
    ).toEqual({
      kind: "business",
      message: "Sub2API request failed: 401",
      upstreamCode: SUB2API_SESSION_BINDING_MISMATCH_CODE,
    })
  })

  it("keeps the authentication code authoritative when a deployment adds a reason", () => {
    expect(
      decodeSub2ApiResponseError(
        response(
          {
            code: SUB2API_SESSION_BINDING_MISMATCH_CODE,
            reason: "NETWORK_CHANGED",
            message: "Session network fingerprint changed",
          },
          401,
        ),
        { endpoint: "/api/v1/auth/me" },
      ),
    ).toEqual({
      kind: "business",
      message: "Session network fingerprint changed",
      upstreamCode: SUB2API_SESSION_BINDING_MISMATCH_CODE,
    })
  })

  it.each([
    { code: 0, message: "legacy success message" },
    { code: 41, message: "   ", msg: "legacy msg must not be inferred" },
    { code: "41", message: "wrong code type" },
    { message: "missing code" },
  ])("falls back for an unknown or unusable envelope: %#", (body) => {
    expect(
      decodeSub2ApiResponseError(response(body, 503), {
        endpoint: "/api/v1/keys",
      }),
    ).toEqual({
      kind: "http",
      message: "Sub2API request failed: 503",
      unattributedMessage: true,
    })
  })

  it("owns unusable non-2xx responses at the Sub2API request seam", async () => {
    server.use(
      http.get("https://sub2.example.invalid/api/v1/auth/me", () =>
        HttpResponse.json(
          {
            code: 41,
            message: "   ",
            msg: "legacy msg must not be inferred",
          },
          { status: 503 },
        ),
      ),
    )

    await expect(
      fetchCurrentUser({
        baseUrl: "https://sub2.example.invalid",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "example-jwt",
        },
      }),
    ).rejects.toMatchObject({
      message: "Sub2API request failed: 503",
      statusCode: 503,
      code: API_ERROR_CODES.HTTP_OTHER,
    })
  })
})
