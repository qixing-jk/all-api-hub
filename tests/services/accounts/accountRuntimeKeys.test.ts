import { describe, expect, it } from "vitest"

import {
  appendOrReplaceAccountRuntimeKey,
  buildAccountKeyResourceRuntimeKey,
  buildAccountKeyResourceRuntimeKeyFromFacts,
  buildAccountKeyResourceRuntimeKeyId,
  buildServiceCredentialRuntimeKey,
  buildTargetScopedAccountKeyResourceId,
  collectAccountRuntimeKeySecrets,
  findDefaultSelectableAccountRuntimeKey,
  formatAccountRuntimeKeySecretForSite,
  getAccountRuntimeKeyExportId,
  getAccountRuntimeKeyLocator,
  getAccountRuntimeKeyLocatorAccountId,
  hasUsableAccountRuntimeKeySecret,
  isAccountRuntimeKeyLocatorEqual,
  isSelectableAccountRuntimeKey,
  sortAccountRuntimeKeysActiveFirst,
} from "~/services/accounts/accountRuntimeKeys"
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
  it.each(["new-api", "sub2api", "voapi-v2", "AIHubMix"] as const)(
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
