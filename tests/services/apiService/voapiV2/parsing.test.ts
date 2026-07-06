import { describe, expect, it } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import {
  amountToQuota,
  isVoApiV2AuthExpiredError,
  parseVoApiV2Envelope,
  quotaToAmountString,
} from "~/services/apiService/voapiV2/parsing"
import { ApiError } from "~/services/apiTransport/errors"

describe("VoAPI v2 parsing", () => {
  it("unwraps code zero data envelopes", () => {
    expect(
      parseVoApiV2Envelope({ code: 0, data: { id: 1 } }, "/api/user/info"),
    ).toEqual({ id: 1 })
  })

  it("unwraps top-level token reveal envelopes", () => {
    expect(
      parseVoApiV2Envelope(
        { code: 0, token: "example-revealed-api-key" },
        "/api/keys/1/token",
        { allowTopLevelToken: true },
      ),
    ).toBe("example-revealed-api-key")
  })

  it("throws ApiError for business errors", () => {
    expect(() =>
      parseVoApiV2Envelope(
        { code: 1, data: null, msg: "Signed in today" },
        "/api/check_in",
      ),
    ).toThrow(ApiError)
  })

  it("uses message and default fallback text for business errors", () => {
    expect(() =>
      parseVoApiV2Envelope(
        { code: 1, data: null, message: "Backend says no" },
        "/api/example",
      ),
    ).toThrow("Backend says no")
    expect(() =>
      parseVoApiV2Envelope({ code: 1, data: null }, "/api/example"),
    ).toThrow("VoAPI v2 request failed")
  })

  it("rejects invalid or empty success envelopes", () => {
    expect(() => parseVoApiV2Envelope({}, "/api/example")).toThrow(ApiError)
    expect(() =>
      parseVoApiV2Envelope({ code: 0, data: null }, "/api/example"),
    ).toThrow("Missing VoAPI v2 response data")
  })

  it("classifies auth-expired business errors", () => {
    expect.assertions(1)

    try {
      parseVoApiV2Envelope(
        { code: 2, data: null, msg: "Auth expire" },
        "/api/user/info",
      )
    } catch (error) {
      expect(isVoApiV2AuthExpiredError(error)).toBe(true)
    }
  })

  it("converts decimal amounts to internal quota points", () => {
    expect(amountToQuota(1.25)).toBe(
      Math.round(1.25 * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR),
    )
    expect(amountToQuota("1.25")).toBe(
      Math.round(1.25 * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR),
    )
    expect(amountToQuota("invalid")).toBe(0)
    expect(
      quotaToAmountString(UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR),
    ).toBe("1")
  })
})
