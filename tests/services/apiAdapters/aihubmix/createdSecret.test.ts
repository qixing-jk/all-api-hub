import { describe, expect, it } from "vitest"

import { AIHUBMIX_API_ORIGIN, SITE_TYPES } from "~/constants/siteType"
import { createAIHubMixCreatedRuntimeSecret } from "~/services/apiAdapters/aihubmix/createdSecret"
import { API_TYPES } from "~/services/verification/aiApiVerification"

describe("createAIHubMixCreatedRuntimeSecret", () => {
  const account = {
    id: "account-example",
    name: "Example account",
    baseUrl: "https://console.example.invalid",
    siteType: SITE_TYPES.AIHUBMIX,
    tagIds: ["tag-example"],
  }

  it("uses the full create response and canonical API origin", () => {
    expect(
      createAIHubMixCreatedRuntimeSecret({
        account,
        token: { name: "Example key", full_key: "sk-example-secret" },
      }),
    ).toEqual({
      correlation: { kind: "legacy-create", accountId: "account-example" },
      displayName: "Example key",
      secret: "sk-example-secret",
      secretAvailability: "create-response-only",
      credential: {
        accountName: "Example account",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: AIHUBMIX_API_ORIGIN,
        siteType: SITE_TYPES.AIHUBMIX,
        tagIds: ["tag-example"],
      },
    })
  })

  it.each(["", "   ", "sk-example********masked", "sk-example••••masked"])(
    "rejects unusable create response secrets",
    (full_key) => {
      expect(() =>
        createAIHubMixCreatedRuntimeSecret({
          account,
          token: { name: "Example key", full_key },
        }),
      ).toThrow()
    },
  )

  it("rejects a saved account from another site type", () => {
    expect(() =>
      createAIHubMixCreatedRuntimeSecret({
        account: { ...account, siteType: SITE_TYPES.NEW_API },
        token: { name: "Example key", full_key: "sk-example-secret" },
      }),
    ).toThrow()
  })
})
