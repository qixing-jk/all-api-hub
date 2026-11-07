import { describe, expect, it } from "vitest"

import { ACCOUNT_LOGIN_CONFIGURATION_KINDS } from "~/constants/accountLogin"
import { isAccountLoginConfigured } from "~/services/accountLogin/configCodec"

describe("adapter-owned login configuration", () => {
  it("accepts a configured custom method declared by the adapter", () => {
    expect(
      isAccountLoginConfigured({ methodId: "oidc:company" }, [
        {
          id: "oidc:company",
          label: "Company SSO",
          configuration: { kind: ACCOUNT_LOGIN_CONFIGURATION_KINDS.None },
        },
      ]),
    ).toBe(true)
  })
  it("rejects undeclared methods and incomplete password inputs", () => {
    const methods = [
      {
        id: "password",
        label: "Password",
        configuration: {
          kind: ACCOUNT_LOGIN_CONFIGURATION_KINDS.Password,
          identity: "email" as const,
        },
      },
    ]
    expect(isAccountLoginConfigured({ methodId: "github" }, methods)).toBe(
      false,
    )
    expect(isAccountLoginConfigured({ methodId: "password" }, methods)).toBe(
      false,
    )
    expect(
      isAccountLoginConfigured(
        {
          methodId: "password",
          credentials: { username: "member@example.com", password: "secret" },
        },
        methods,
      ),
    ).toBe(true)
  })
})
