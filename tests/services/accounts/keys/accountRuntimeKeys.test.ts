import { describe, expect, it, vi } from "vitest"

import {
  appendOrReplaceAccountRuntimeKey,
  buildAccountKeyResourceRuntimeKey,
  buildAccountKeyResourceRuntimeKeyFromFacts,
  buildAccountKeyResourceRuntimeKeyId,
  buildServiceCredentialRuntimeKey,
  buildTargetScopedAccountKeyResourceId,
  collectAccountRuntimeKeySecrets,
  findDefaultSelectableAccountRuntimeKey,
  formatAccountRuntimeKeyMaskForSite,
  formatAccountRuntimeKeySecretForSite,
  getAccountRuntimeKeyExportId,
  getAccountRuntimeKeyLocator,
  getAccountRuntimeKeyLocatorAccountId,
  hasUsableAccountRuntimeKeySecret,
  isAccountRuntimeKeyCompatibleWithModel,
  isAccountRuntimeKeyLocatorEqual,
  isInferenceCapableAccountRuntimeKey,
  isSelectableAccountRuntimeKey,
  sortAccountRuntimeKeysActiveFirst,
} from "~/services/accounts/keys/accountRuntimeKeys"
import * as siteDefinitions from "~/services/accountSiteDefinitions/registry"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const account = buildDisplaySiteData({
  id: "account-1",
  name: "Account",
  siteType: "new-api",
  token: "access-secret",
  cookieAuthSessionCookie: "session=cookie",
})
const ref = {
  accountId: account.id,
  siteType: account.siteType,
  scopeKey: "account",
  resourceId: "42",
}
const native = (status: "active" | "inactive" | "unknown" = "active") =>
  buildAccountKeyResourceRuntimeKey(account, {
    ref,
    label: "Native key",
    secret: "",
    status,
    legacyTokenId: 42,
  })
const service = (authenticated = true) =>
  buildServiceCredentialRuntimeKey(account, {
    kind: "singleton_service_key",
    service: "openai",
    label: "Service",
    key: "service-secret",
    isAuthenticated: authenticated,
    baseUrl: "https://runtime.example/api/v1",
  })

describe("account runtime keys", () => {
  it("excludes denied models even when the key otherwise permits all models", () => {
    const key = {
      ...native(),
      modelAccess: {
        groups: null,
        allowedModelIds: null,
        deniedModelIds: ["blocked-model"],
        suggestedModelIds: [],
      },
    }
    expect(
      isAccountRuntimeKeyCompatibleWithModel(key, { id: "blocked-model" }),
    ).toBe(false)
    expect(
      isAccountRuntimeKeyCompatibleWithModel(key, { id: "allowed-model" }),
    ).toBe(true)
  })
  it.each([
    ["sk-abcd", "sk-abcd"],
    ["", "sk-"],
    ["s", "sk-"],
    ["sk", "sk-"],
    ["abcd", "sk-abcd"],
  ])(
    "retains only guaranteed auth bytes for mask prefix %s",
    (prefix, expected) => {
      const keyMask = { prefix, suffix: "tail" }
      const runtimeKey = { ...native(), keyMask }
      expect(formatAccountRuntimeKeyMaskForSite(runtimeKey)).toEqual({
        prefix: expected,
        suffix: "tail",
      })
      expect(runtimeKey.keyMask).toEqual(keyMask)
      expect(
        formatAccountRuntimeKeyMaskForSite({ ...runtimeKey, siteType: "dahl" }),
      ).toEqual(keyMask)
      expect(formatAccountRuntimeKeyMaskForSite(native())).toBeUndefined()
    },
  )
  it("preserves released token associations when the current adapter family changes", () => {
    const definition = siteDefinitions.getAccountSiteDefinition("new-api")!
    const lookup = vi.spyOn(siteDefinitions, "getAccountSiteDefinition")
    lookup.mockReturnValue({ ...definition, adapterFamily: "unsupported" })
    try {
      expect(
        isAccountRuntimeKeyLocatorEqual(
          {
            source: "account_token",
            accountId: account.id,
            siteType: "new-api",
            tokenId: 42,
          },
          { source: "account_key_resource", ref },
        ),
      ).toBe(true)
    } finally {
      lookup.mockRestore()
    }
  })

  it.each([
    "one-api",
    "new-api",
    "apiyi",
    "laozhang",
    "ModelFlare",
    "anyrouter",
    "Veloera",
    "one-hub",
    "done-hub",
    "v-api",
    "voapi-v2",
    "VoAPI",
    "Super-API",
    "Rix-Api",
    "neo-Api",
    "wong-gongyi",
    "sub2api",
    "AIHubMix",
    "unknown",
  ] as const)(
    "preserves historical %s associations without a legacy runtime variant",
    (siteType) => {
      const old = {
        source: "account_token" as const,
        accountId: account.id,
        siteType,
        tokenId: 42,
      }
      const current = {
        source: "account_key_resource" as const,
        ref: { ...ref, siteType },
      }
      expect(isAccountRuntimeKeyLocatorEqual(old, current)).toBe(true)
      expect(
        isAccountRuntimeKeyLocatorEqual(old, {
          ...current,
          ref: { ...current.ref, scopeKey: "other" },
        }),
      ).toBe(false)
      expect(
        isAccountRuntimeKeyLocatorEqual(old, {
          ...current,
          ref: { ...current.ref, accountId: "other" },
        }),
      ).toBe(false)
    },
  )

  it.each([
    "sharedchat",
    "freemodel",
    "RightCode",
    "openrouter",
    "kimi",
    "kimi-global",
    "grsai",
  ] as const)(
    "does not invent a released numeric-token association for %s",
    (siteType) => {
      expect(
        isAccountRuntimeKeyLocatorEqual(
          {
            source: "account_token",
            accountId: account.id,
            siteType,
            tokenId: 42,
          },
          { source: "account_key_resource", ref: { ...ref, siteType } },
        ),
      ).toBe(false)
    },
  )

  it.each([
    ["enabled", "active"],
    ["unknown", "unknown"],
    ["disabled", "inactive"],
    ["expired", "inactive"],
  ] as const)(
    "preserves %s resource status without recovering a secret",
    (status, expected) => {
      const key = buildAccountKeyResourceRuntimeKeyFromFacts(account, {
        ref: {
          accountId: account.id,
          siteType: account.siteType,
          scopeKey: "account",
          resourceId: "opaque-key",
        },
        displayName: "Native key",
        maskedLabel: "***",
        status,
        fields: [],
        actions: { canUpdate: false, canDelete: false },
      })
      expect(key.status).toBe(expected)
      expect(key.secret).toBe("")
      expect(getAccountRuntimeKeyExportId(key)).toBe(key.id)
    },
  )

  it("keeps opaque identities and target scopes collision safe", () => {
    expect(buildAccountKeyResourceRuntimeKeyId(ref)).not.toBe(
      buildAccountKeyResourceRuntimeKeyId({
        ...ref,
        scopeKey: "account:42",
        resourceId: "",
      }),
    )
    expect(buildTargetScopedAccountKeyResourceId("target-a", ref)).not.toBe(
      buildTargetScopedAccountKeyResourceId("target-b", ref),
    )
    expect(getAccountRuntimeKeyLocator(native())).toEqual({
      source: "account_key_resource",
      ref,
    })
    expect(
      getAccountRuntimeKeyLocatorAccountId(
        getAccountRuntimeKeyLocator(native()),
      ),
    ).toBe(account.id)
    expect(getAccountRuntimeKeyExportId(native())).toBe("42")
  })

  it("projects safe policy facts without fabricating token fields or plaintext", () => {
    const modelAccess = {
      groups: ["vip"],
      allowedModelIds: [],
      suggestedModelIds: ["model-a"],
    }
    const key = buildAccountKeyResourceRuntimeKeyFromFacts(account, {
      ref,
      displayName: "Key",
      maskedLabel: "masked",
      status: "enabled",
      fields: [],
      actions: { canUpdate: true, canDelete: true },
      runtimeKey: { modelAccess, legacyTokenId: 42 },
    })
    expect(key).toMatchObject({
      source: "account_key_resource",
      secret: "",
      status: "active",
      modelAccess,
    })
    expect(key).not.toHaveProperty("token")
    expect(key).not.toHaveProperty("tokenId")
    expect(isSelectableAccountRuntimeKey(key)).toBe(true)
    expect(hasUsableAccountRuntimeKeySecret(key)).toBe(false)
  })

  it("preserves service endpoint and authentication status", () => {
    expect(service()).toMatchObject({
      source: "service_credential",
      secret: "service-secret",
      baseUrl: "https://runtime.example/api/v1",
      status: "active",
    })
    expect(service(false)).toMatchObject({ secret: "", status: "inactive" })
    expect(isSelectableAccountRuntimeKey(service(false))).toBe(false)
    expect(getAccountRuntimeKeyLocator(service())).toEqual({
      source: "service_credential",
      accountId: account.id,
      siteType: account.siteType,
      service: "openai",
    })
  })

  it("sorts active keys first and retains unavailable native keys for explicit recovery", () => {
    const inactive = native("inactive")
    const active = service()
    const keys = [inactive, active]
    expect(sortAccountRuntimeKeysActiveFirst(keys)).toEqual([active, inactive])
    expect(keys[0]).toBe(inactive)
    expect(findDefaultSelectableAccountRuntimeKey(keys)).toBe(active)
    expect(findDefaultSelectableAccountRuntimeKey([inactive])).toBe(inactive)
    expect(findDefaultSelectableAccountRuntimeKey([service(false)])).toBeNull()
  })

  it("replaces only the same resource and formats a transient secret", () => {
    const old = native()
    const replacement = { ...old, secret: "key-value" }
    expect(
      appendOrReplaceAccountRuntimeKey([old, service()], replacement),
    ).toEqual([service(), replacement])
    expect(formatAccountRuntimeKeySecretForSite(replacement).secret).toBe(
      "sk-key-value",
    )
    expect(replacement.secret).toBe("key-value")
  })

  it("redacts both runtime and stale service secrets alongside account credentials", () => {
    expect(
      collectAccountRuntimeKeySecrets([
        { ...native(), secret: "key-value" },
        service(false),
      ]),
    ).toEqual(
      expect.arrayContaining([
        "key-value",
        "service-secret",
        "access-secret",
        "session=cookie",
      ]),
    )
  })
})

describe("inference capability", () => {
  const inferenceKey = (inference: boolean | undefined, id = "native") =>
    buildAccountKeyResourceRuntimeKey(account, {
      ref: { ...ref, resourceId: id },
      label: "Native key",
      secret: "sk-native",
      ...(inference === undefined ? {} : { inference }),
    })

  it("treats a key without a provider opinion as an inference credential", () => {
    expect(inferenceKey(undefined).capabilities.inference).toBe(true)
  })

  it("excludes a management key from inference selection", () => {
    const manageKey = inferenceKey(false)
    expect(manageKey.capabilities.inference).toBe(false)
    expect(isInferenceCapableAccountRuntimeKey(manageKey)).toBe(false)
    expect(isInferenceCapableAccountRuntimeKey(inferenceKey(true))).toBe(true)
  })

  it("prefers an inference key over a management key for default selection", () => {
    const manageKey = inferenceKey(false, "manage")
    const plainKey = inferenceKey(true, "plain")
    expect(findDefaultSelectableAccountRuntimeKey([manageKey, plainKey])).toBe(
      plainKey,
    )
  })

  it("never falls back to a management key for default selection", () => {
    // A management key that is the only, or only-active, credential must not be
    // proposed as the default inference key by any fallback branch.
    const inactiveInferenceKey = buildAccountKeyResourceRuntimeKey(account, {
      ref: { ...ref, resourceId: "inactive" },
      label: "Inactive",
      secret: "sk-inactive",
      status: "inactive",
      inference: true,
    })
    expect(findDefaultSelectableAccountRuntimeKey([inferenceKey(false)])).toBe(
      null,
    )
    expect(
      findDefaultSelectableAccountRuntimeKey([
        inferenceKey(false, "first"),
        inactiveInferenceKey,
      ]),
    ).toBe(inactiveInferenceKey)
  })
})

it("preserves the account-credential marker when projecting provider facts", () => {
  const key = buildAccountKeyResourceRuntimeKeyFromFacts(account, {
    ref,
    displayName: "Management key",
    maskedLabel: "***",
    status: "enabled",
    accountCredentialIdentity: { status: "confirmed", source: "provider" },
    fields: [],
    actions: { canUpdate: false, canDelete: true },
  })
  expect(key.accountCredential).toBe(true)
})
