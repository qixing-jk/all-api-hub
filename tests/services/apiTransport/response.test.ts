import { describe, expect, it } from "vitest"

import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import {
  extractDataFromApiResponseBody,
  isApiResponseBody,
} from "~/services/apiTransport/response"

describe("apiTransport response helpers", () => {
  it("recognizes only complete shared response envelopes", () => {
    expect(
      isApiResponseBody({ success: true, data: null, message: "success" }),
    ).toBe(true)
    expect(isApiResponseBody({ success: true, data: null })).toBe(false)
    expect(
      isApiResponseBody({ success: "true", data: null, message: "success" }),
    ).toBe(false)
  })

  it("rejects invalid response bodies", () => {
    expect(() =>
      extractDataFromApiResponseBody(null, "/api/invalid"),
    ).toThrowError(
      expect.objectContaining({ code: API_ERROR_CODES.JSON_PARSE_ERROR }),
    )
  })

  it("keeps blank business errors classified as business failures", () => {
    expect(() =>
      extractDataFromApiResponseBody(
        { success: false, data: null, message: "" },
        "/api/invalid",
      ),
    ).toThrowError(
      expect.objectContaining({ code: API_ERROR_CODES.BUSINESS_ERROR }),
    )
  })
})
