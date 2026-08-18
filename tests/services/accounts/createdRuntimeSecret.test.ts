import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/accountRuntimeKeys"
import {
  createAccountKeyResourceCreatedRuntimeSecret,
  createAccountRuntimeKeyCreatedRuntimeSecret,
  createLegacyCreatedRuntimeSecret,
  getCreatedRuntimeSecretLocator,
} from "~/services/accounts/createdRuntimeSecret"
import { API_TYPES } from "~/services/verification/aiApiVerification"

describe("createLegacyCreatedRuntimeSecret", () => {
  it("creates a create-response-only secret without leaking it into correlation or display data", () => {
    const result = createLegacyCreatedRuntimeSecret({
      account: {
        id: "account-example",
        name: "Example account",
        baseUrl: "https://api.example.invalid",
        siteType: SITE_TYPES.NEW_API,
        tagIds: ["tag-example"],
      },
      token: { name: "Example key", key: "sk-example-secret" },
    })

    expect(result).toEqual({
      correlation: { kind: "legacy-create", accountId: "account-example" },
      displayName: "Example key",
      secret: "sk-example-secret",
      secretAvailability: "create-response-only",
      credential: {
        accountName: "Example account",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://api.example.invalid",
        siteType: SITE_TYPES.NEW_API,
        tagIds: ["tag-example"],
      },
    })
    expect(
      JSON.stringify({
        correlation: result.correlation,
        displayName: result.displayName,
      }),
    ).not.toContain(result.secret)
  })

  it.each([
    ["blank secret", { id: "account-example", key: "   " }],
    ["star-masked secret", { id: "account-example", key: "sk-***-masked" }],
    ["bullet-masked secret", { id: "account-example", key: "sk-•••-masked" }],
    ["blank account id", { id: "   ", key: "sk-example-secret" }],
  ])("rejects %s", (_label, values) => {
    expect(() =>
      createLegacyCreatedRuntimeSecret({
        account: {
          id: values.id,
          name: "Example account",
          baseUrl: "https://api.example.invalid",
          siteType: SITE_TYPES.NEW_API,
        },
        token: { name: "Example key", key: values.key },
      }),
    ).toThrow()
  })

  it.each(["accountId", "siteType", "scopeKey", "resourceId"])(
    "rejects a blank account-key-resource correlation %s",
    (field) => {
      expect(() =>
        createAccountKeyResourceCreatedRuntimeSecret({
          ref: {
            accountId: "account-example",
            siteType: SITE_TYPES.NEW_API,
            scopeKey: "scope-example",
            resourceId: "resource-example",
            [field]: "   ",
          },
          displayName: "Example key",
          secret: "sk-example-secret",
          credential: {
            accountName: "Example account",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: "https://api.example.invalid",
            tagIds: [],
          },
        }),
      ).toThrow()
    },
  )

  it.each([
    ["blank", "   "],
    ["star-masked", "sk-***-masked"],
    ["bullet-masked", "sk-•••-masked"],
  ])("rejects a %s account-key-resource secret", (_label, secret) => {
    expect(() =>
      createAccountKeyResourceCreatedRuntimeSecret({
        ref: {
          accountId: "account-example",
          siteType: SITE_TYPES.NEW_API,
          scopeKey: "scope-example",
          resourceId: "resource-example",
        },
        displayName: "Example key",
        secret,
        credential: {
          accountName: "Example account",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://api.example.invalid",
          tagIds: [],
        },
      }),
    ).toThrow()
  })

  it("accepts a plaintext account-key-resource secret", () => {
    const result = createAccountKeyResourceCreatedRuntimeSecret({
      ref: {
        accountId: "account-example",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "scope-example",
        resourceId: "resource-example",
      },
      displayName: "Example key",
      secret: "  opaque-example-secret  ",
      credential: {
        accountName: "Example account",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://api.example.invalid",
        tagIds: [],
      },
    })

    expect(result.secret).toBe("opaque-example-secret")
    expect(getCreatedRuntimeSecretLocator(result)).toEqual({
      source: "account_key_resource",
      ref: {
        accountId: "account-example",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "scope-example",
        resourceId: "resource-example",
      },
    })
  })

  it("preserves an account-runtime-key locator in a created secret", () => {
    const result = createAccountRuntimeKeyCreatedRuntimeSecret({
      locator: {
        source: "account_token",
        accountId: "account-example",
        siteType: SITE_TYPES.AIHUBMIX,
        tokenId: 42,
      },
      displayName: "Example key",
      secret: "sk-example-secret",
      credential: {
        accountName: "Example account",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://api.example.invalid",
        tagIds: [],
      },
    })

    expect(getCreatedRuntimeSecretLocator(result)).toEqual({
      source: "account_token",
      accountId: "account-example",
      siteType: SITE_TYPES.AIHUBMIX,
      tokenId: 42,
    })
  })

  it.each([
    [
      "account-key-resource ref",
      {
        source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
        ref: {
          accountId: "account-example",
          siteType: SITE_TYPES.NEW_API,
          scopeKey: " ",
          resourceId: "resource-example",
        },
      },
    ],
    [
      "account id",
      {
        source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
        accountId: " ",
        siteType: SITE_TYPES.NEW_API,
        tokenId: 1,
      },
    ],
    [
      "site type",
      {
        source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
        accountId: "account-example",
        siteType: " ",
        tokenId: 1,
      },
    ],
    [
      "token id",
      {
        source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
        accountId: "account-example",
        siteType: SITE_TYPES.NEW_API,
        tokenId: 0,
      },
    ],
    [
      "service",
      {
        source: ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential,
        accountId: "account-example",
        siteType: SITE_TYPES.SHAREDCHAT,
        service: " ",
      },
    ],
  ])("rejects an invalid account-runtime-key locator %s", (_label, locator) => {
    expect(() =>
      createAccountRuntimeKeyCreatedRuntimeSecret({
        locator: locator as any,
        displayName: "Example key",
        secret: "sk-example-secret",
        credential: {
          accountName: "Example account",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://api.example.invalid",
          tagIds: [],
        },
      }),
    ).toThrow("Created runtime secret requires a valid locator")
  })

  it("accepts account-key-resource and service-credential locators", () => {
    const credential = {
      accountName: "Example account",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.example.invalid",
      tagIds: [],
    }
    const accountKeyResource = createAccountRuntimeKeyCreatedRuntimeSecret({
      locator: {
        source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
        ref: {
          accountId: "account-example",
          siteType: SITE_TYPES.OPENROUTER,
          scopeKey: "scope-example",
          resourceId: "resource-example",
        },
      },
      displayName: "Native key",
      secret: "sk-native-secret",
      credential,
    })
    const serviceCredential = createAccountRuntimeKeyCreatedRuntimeSecret({
      locator: {
        source: ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential,
        accountId: "account-example",
        siteType: SITE_TYPES.SHAREDCHAT,
        service: "codex",
      },
      displayName: "Service key",
      secret: "sk-service-secret",
      credential,
    })

    expect(getCreatedRuntimeSecretLocator(accountKeyResource)).toEqual({
      source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
      ref: {
        accountId: "account-example",
        siteType: SITE_TYPES.OPENROUTER,
        scopeKey: "scope-example",
        resourceId: "resource-example",
      },
    })
    expect(getCreatedRuntimeSecretLocator(serviceCredential)).toEqual({
      source: ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential,
      accountId: "account-example",
      siteType: SITE_TYPES.SHAREDCHAT,
      service: "codex",
    })
  })

  it("reports no locator for a legacy created secret", () => {
    expect(
      getCreatedRuntimeSecretLocator(
        createLegacyCreatedRuntimeSecret({
          account: {
            id: "legacy-account",
            name: "Legacy account",
            baseUrl: "https://legacy.example.invalid",
          },
          token: { name: "Legacy", key: "sk-legacy-secret" },
        }),
      ),
    ).toBeUndefined()
  })
})
