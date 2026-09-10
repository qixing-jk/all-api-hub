import { describe, expect, it } from "vitest"

import { decodeVoApiV2ResponseError } from "~/services/apiService/voapiV2/responseError"
import type { ApiTransportResponse } from "~/services/apiTransport/type"

const response = (
  body: unknown,
  status = 400,
): ApiTransportResponse<unknown> => ({
  ok: false,
  status,
  headers: {},
  body,
})

describe("decodeVoApiV2ResponseError", () => {
  it("prefers the verified msg field and keeps a safe provider code", () => {
    expect(
      decodeVoApiV2ResponseError(
        response(
          {
            code: 41,
            msg: "  VoAPI request rejected  ",
            message: "secondary provider message",
          },
          403,
        ),
        { endpoint: "/api/user/info" },
      ),
    ).toEqual({
      kind: "business",
      message: "VoAPI request rejected",
      upstreamCode: "41",
    })
  })

  it("uses the verified message fallback when msg is blank", () => {
    expect(
      decodeVoApiV2ResponseError(
        response({ code: 41, msg: "  ", message: "  Request denied  " }),
        { endpoint: "/api/keys" },
      ),
    ).toEqual({
      kind: "business",
      message: "Request denied",
      upstreamCode: "41",
    })
  })

  it.each([
    { code: 0, msg: "success is not a failure envelope" },
    { code: "41", msg: "wrong code type" },
    { code: 41, msg: " ", message: " " },
    { error: "unrelated shape", message: "must not be inferred" },
  ])("uses the fixed status fallback for an unusable envelope: %#", (body) => {
    expect(
      decodeVoApiV2ResponseError(response(body, 503), {
        endpoint: "/api/user/info",
      }),
    ).toEqual({
      kind: "http",
      message: "VoAPI v2 request failed: 503",
    })
  })
})
