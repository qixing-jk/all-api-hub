import { describe, expect, it } from "vitest"

import { normalizeSub2ApiAuth } from "~/services/apiAdapters/sub2api/authSession"

describe("Sub2API persisted authentication input", () => {
  it.each([null, {}, { refreshToken: 42 }, { refreshToken: "   " }])(
    "rejects absent or malformed refresh credentials: %j",
    (input) => expect(normalizeSub2ApiAuth(input)).toBeUndefined(),
  )

  it("trims refresh credentials while retaining valid expiration metadata", () => {
    expect(
      normalizeSub2ApiAuth({ refreshToken: " refresh ", tokenExpiresAt: 123 }),
    ).toEqual({ refreshToken: "refresh", tokenExpiresAt: 123 })
  })
})
