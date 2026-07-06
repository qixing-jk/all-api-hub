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

  it("classifies auth-expired business errors", () => {
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
    expect(amountToQuota("1.25")).toBe(
      Math.round(1.25 * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR),
    )
    expect(amountToQuota("invalid")).toBe(0)
    expect(
      quotaToAmountString(UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR),
    ).toBe("1")
  })
})
