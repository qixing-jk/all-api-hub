import { describe, expect, it } from "vitest"

import { decodeRelayForResponseError } from "~/services/apiService/relayfor/responseError"

describe("RelayFor response error decoding", () => {
  it.each([null, "offline", [], {}, { error: " " }])(
    "leaves unrecognized bodies to transport handling: %j",
    (body) => {
      expect(
        decodeRelayForResponseError(
          { body, status: 400, headers: {}, ok: false },
          { endpoint: "/api/user/self" },
        ),
      ).toBeNull()
    },
  )

  it.each([
    [{ error: " Denied " }, { message: "Denied", upstreamCode: undefined }],
    [
      { message: " Try later " },
      { message: "Try later", upstreamCode: undefined },
    ],
    [
      { error: { type: "totp_required" } },
      { message: "totp_required", upstreamCode: "totp_required" },
    ],
    [
      { error: { type: "rate_limit", message: " Slow down " } },
      { message: "Slow down", upstreamCode: "rate_limit" },
    ],
  ])("preserves upstream error meaning: %j", (body, expected) => {
    expect(
      decodeRelayForResponseError(
        { body, status: 400, headers: {}, ok: false },
        { endpoint: "/api/user/self" },
      ),
    ).toEqual({ kind: "http", ...expected })
  })
})
