import { describe, expect, it } from "vitest"

import {
  createAccountKeyResourceCreatedRuntimeSecret,
  createUnattributedAccountCreatedRuntimeSecret,
  getCreatedRuntimeSecretLocator,
} from "~/services/accounts/createdRuntimeSecret"

const ref = {
  accountId: "account",
  siteType: "openrouter" as const,
  scopeKey: "workspace",
  resourceId: "opaque",
}
const credential = {
  accountName: "Account",
  baseUrl: "https://runtime.example/api/v1",
  apiType: "openai-compatible" as const,
  siteType: "openrouter",
  tagIds: ["tag"],
}

describe("created runtime secrets", () => {
  it("keeps the exact resource identity and explicit credential endpoint", () => {
    const result = createAccountKeyResourceCreatedRuntimeSecret({
      ref,
      displayName: "Created",
      secret: "  test-secret  ",
      credential,
    })
    expect(result).toMatchObject({
      secret: "test-secret",
      secretAvailability: "create-response-only",
      credential,
    })
    expect(getCreatedRuntimeSecretLocator(result)).toEqual({
      source: "account_key_resource",
      ref,
    })
  })
  it("retains an unattributed successful creation without guessing an identity", () => {
    const result = createUnattributedAccountCreatedRuntimeSecret({
      accountId: "account",
      displayName: "Created",
      secret: "test-secret",
      credential,
    })
    expect(result.correlation).toEqual({
      kind: "account-create",
      accountId: "account",
    })
    expect(getCreatedRuntimeSecretLocator(result)).toBeUndefined()
  })
  it.each(["", " ", "masked-***", "masked-•••"])(
    "rejects unusable creation secret %s",
    (secret) => {
      expect(() =>
        createAccountKeyResourceCreatedRuntimeSecret({
          ref,
          displayName: "Key",
          secret,
          credential,
        }),
      ).toThrow()
    },
  )
  it.each(["accountId", "siteType", "scopeKey", "resourceId"])(
    "rejects a blank %s in a confirmed reference",
    (field) => {
      expect(() =>
        createAccountKeyResourceCreatedRuntimeSecret({
          ref: { ...ref, [field]: "" },
          displayName: "Key",
          secret: "test-secret",
          credential,
        }),
      ).toThrow()
    },
  )
})
