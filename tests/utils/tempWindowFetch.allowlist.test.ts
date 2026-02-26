import { describe, expect, it } from "vitest"

import { API_ERROR_CODES } from "~/services/apiService/common/errors"
import { matchesTempWindowFallbackAllowlist } from "~/utils/tempWindowFetch"

describe("matchesTempWindowFallbackAllowlist", () => {
  it("uses global defaults when no allowlist is provided", () => {
    expect(matchesTempWindowFallbackAllowlist({ statusCode: 401 })).toBe(true)
    expect(matchesTempWindowFallbackAllowlist({ statusCode: 403 })).toBe(true)
    expect(matchesTempWindowFallbackAllowlist({ statusCode: 429 })).toBe(true)
    expect(
      matchesTempWindowFallbackAllowlist({
        code: API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
      }),
    ).toBe(true)

    expect(matchesTempWindowFallbackAllowlist({ statusCode: 500 })).toBe(false)
    expect(
      matchesTempWindowFallbackAllowlist({ code: API_ERROR_CODES.HTTP_OTHER }),
    ).toBe(false)
  })

  it("honors a per-request allowlist when provided", () => {
    const allowlist = {
      statusCodes: [403],
      codes: [API_ERROR_CODES.HTTP_403],
    }

    expect(
      matchesTempWindowFallbackAllowlist({ statusCode: 403 }, allowlist),
    ).toBe(true)
    expect(
      matchesTempWindowFallbackAllowlist({ statusCode: 401 }, allowlist),
    ).toBe(false)
    expect(
      matchesTempWindowFallbackAllowlist({ statusCode: 429 }, allowlist),
    ).toBe(false)
    expect(
      matchesTempWindowFallbackAllowlist(
        {
          code: API_ERROR_CODES.HTTP_403,
        },
        allowlist,
      ),
    ).toBe(true)
    expect(
      matchesTempWindowFallbackAllowlist(
        {
          code: API_ERROR_CODES.HTTP_401,
        },
        allowlist,
      ),
    ).toBe(false)
    expect(
      matchesTempWindowFallbackAllowlist(
        {
          statusCode: 200,
          code: API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
        },
        allowlist,
      ),
    ).toBe(false)
  })
})
