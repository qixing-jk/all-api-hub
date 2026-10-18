import { describe, expect, it } from "vitest"

import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import { normalizeAccountLogin } from "~/services/accountLogin/configCodec"

describe("internal account login configuration", () => {
  it("retains credentials without the abandoned automatic recovery preference", () => {
    expect(
      normalizeAccountLogin({
        methodId: ACCOUNT_LOGIN_METHODS.Password,
        credentials: { username: "member", password: "secret" },
        automaticReauthentication: true,
      }),
    ).toEqual({
      methodId: ACCOUNT_LOGIN_METHODS.Password,
      credentials: { username: "member", password: "secret" },
    })
  })
})
