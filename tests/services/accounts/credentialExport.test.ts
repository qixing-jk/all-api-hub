import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { buildAccountKeyResourceRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import {
  createAccountRuntimeKeyExportSource,
  resolveAccountExternalApiBaseUrl,
} from "~/services/accounts/utils/credentialExport"
import { resolveCredentialExport } from "~/services/integrations/credentialExport"
import { buildNewApiRuntimeKey } from "~~/tests/test-utils/accountKeyFixtures"
import {
  buildDisplaySiteData,
  buildNewApiToken,
} from "~~/tests/test-utils/factories"

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountRuntimeKeySecret: vi.fn(),
}))

const account = buildDisplaySiteData({ siteType: SITE_TYPES.NEW_API })
const runtimeKey = buildAccountKeyResourceRuntimeKey(account, {
  ref: {
    accountId: account.id,
    siteType: account.siteType,
    scopeKey: "workspace:team-a",
    resourceId: "key/opaque-id",
  },
  label: "Native key",
  secret: "",
})

// Exports carry the protocol root: the consumer appends the version segment it
// owns, so a trailing `/v1` here would be appended twice.
describe("account credential exports", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("exports a usable inventory secret without a provider read or inventory mutation", async () => {
    const token = buildNewApiToken({
      key: " current-test-key ",
      note: "Key notes",
    })
    const source = createAccountRuntimeKeyExportSource(
      account,
      buildNewApiRuntimeKey(account, token),
      { preferCurrentSecret: true },
    )

    expect(source.notes).toBe("Key notes")
    await expect(resolveCredentialExport(source)).resolves.toEqual({
      providerId: account.id,
      providerName: account.name,
      baseUrl: "https://example.com",
      apiKey: "sk-current-test-key",
    })
    expect(resolveDisplayAccountRuntimeKeySecret).not.toHaveBeenCalled()
    expect(token.key).toBe(" current-test-key ")
  })

  it("defers masked inventory secret recovery until the credential is needed", async () => {
    const token = buildNewApiToken({ key: "sk-********" })
    vi.mocked(resolveDisplayAccountRuntimeKeySecret).mockResolvedValue({
      ...buildNewApiRuntimeKey(account, token),
      secret: "resolved-test-key",
    })
    const source = createAccountRuntimeKeyExportSource(
      account,
      buildNewApiRuntimeKey(account, token),
      { preferCurrentSecret: true },
    )

    expect(resolveDisplayAccountRuntimeKeySecret).not.toHaveBeenCalled()
    await expect(source.resolveApiKey()).resolves.toBe("resolved-test-key")
    expect(resolveDisplayAccountRuntimeKeySecret).toHaveBeenCalledWith(
      account,
      buildNewApiRuntimeKey(account, token),
    )
    expect(token.key).toBe("sk-********")
  })

  it("retains scoped native identity and resolves through the native runtime key", async () => {
    vi.mocked(resolveDisplayAccountRuntimeKeySecret).mockResolvedValue({
      ...runtimeKey,
      secret: "native-test-key",
    })
    const source = createAccountRuntimeKeyExportSource(account, runtimeKey)

    expect(source.id).toBe(
      "account_key_resource:account-1:new-api:workspace%3Ateam-a:key%2Fopaque-id",
    )
    expect(resolveDisplayAccountRuntimeKeySecret).not.toHaveBeenCalled()
    await expect(source.resolveApiKey()).resolves.toBe("native-test-key")
    expect(resolveDisplayAccountRuntimeKeySecret).toHaveBeenCalledWith(
      account,
      runtimeKey,
    )
  })

  it("retains a creation-only native secret when the exporter prefers its current value", async () => {
    const source = createAccountRuntimeKeyExportSource(
      account,
      { ...runtimeKey, secret: "creation-test-key" },
      { preferCurrentSecret: true },
    )

    await expect(source.resolveApiKey()).resolves.toBe("sk-creation-test-key")
    expect(resolveDisplayAccountRuntimeKeySecret).not.toHaveBeenCalled()
  })

  it("propagates native recovery failures instead of exporting a masked value", async () => {
    const error = new Error("native-secret-unavailable")
    vi.mocked(resolveDisplayAccountRuntimeKeySecret).mockRejectedValue(error)
    const source = createAccountRuntimeKeyExportSource(
      account,
      { ...runtimeKey, secret: "sk-********" },
      { preferCurrentSecret: true },
    )

    await expect(resolveCredentialExport(source)).rejects.toBe(error)
  })

  it.each([
    { baseUrl: "https://other-account.example.invalid" },
    { token: "changed-account-auth" },
    { userId: "2" },
    { cookieAuthSessionCookie: "changed-session" },
  ])(
    "invalidates discovery when account resolution inputs change: %j",
    (change) => {
      const source = createAccountRuntimeKeyExportSource(account, runtimeKey)
      const changed = createAccountRuntimeKeyExportSource(
        { ...account, ...change },
        runtimeKey,
      )

      expect(changed.id).toBe(source.id)
      expect(changed.cacheKey).not.toBe(source.cacheKey)
    },
  )

  // A split-origin deployment answers its API on a different origin than the
  // dashboard, so an exported credential must carry the API origin even though
  // the account keeps the dashboard URL.
  // See .scratch/ai-router-adaptation/research.md.
  it("exports the API origin when the key uses the account endpoint", () => {
    const splitOriginAccount = buildDisplaySiteData({
      id: "ai-router-account",
      name: "Split Origin Account",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://ai-router.dev",
    })
    const splitOriginKey = buildAccountKeyResourceRuntimeKey(
      splitOriginAccount,
      {
        ref: {
          accountId: splitOriginAccount.id,
          siteType: splitOriginAccount.siteType,
          scopeKey: "workspace:team-a",
          resourceId: "key/opaque-id",
        },
        label: "Native key",
        secret: "",
      },
    )

    expect(
      createAccountRuntimeKeyExportSource(splitOriginAccount, splitOriginKey)
        .baseUrl,
    ).toBe("https://api.ai-router.dev")
  })

  it("offers both Kimi inference protocols without changing the browser account address", () => {
    const kimiAccount = buildDisplaySiteData({
      id: "kimi-account",
      name: "Kimi",
      siteType: SITE_TYPES.KIMI_GLOBAL,
      baseUrl: "https://platform.kimi.ai",
    })
    const key = buildAccountKeyResourceRuntimeKey(kimiAccount, {
      ref: {
        accountId: kimiAccount.id,
        siteType: kimiAccount.siteType,
        scopeKey: "organization:test",
        resourceId: "key:test",
      },
      label: "Kimi key",
      secret: "sk-example",
    })
    const source = createAccountRuntimeKeyExportSource(kimiAccount, key)
    expect(source.baseUrl).toBe("https://api.moonshot.ai")
    expect(source.anthropicBaseUrl).toBe("https://api.moonshot.ai/anthropic")
    expect(kimiAccount.baseUrl).toBe("https://platform.kimi.ai")
  })

  it("retains an unusable explicit key endpoint instead of silently exporting another gateway", () => {
    expect(resolveAccountExternalApiBaseUrl(account, "  not a url  ")).toBe(
      "not a url",
    )
  })

  it("keeps an explicit per-key endpoint and unregistered account URLs", () => {
    const explicitEndpointKey = {
      ...runtimeKey,
      baseUrl: "https://custom-endpoint.example.invalid/v1",
    }

    expect(
      createAccountRuntimeKeyExportSource(account, explicitEndpointKey).baseUrl,
    ).toBe("https://custom-endpoint.example.invalid")
    expect(
      createAccountRuntimeKeyExportSource(account, runtimeKey).baseUrl,
    ).toBe("https://example.com")
  })

  // The key carries the endpoint it was created against (account snapshot). If
  // the live account later changes address, the export must follow the account
  // rather than pin the creation-time key URL. The comparison is made against
  // the key's account snapshot, not the live account.
  // See cd032543f regression in KiloCodeExportDialog "runtime facts change".
  it("follows a live account address change when the key inherits the account endpoint", () => {
    const originalBaseUrl = runtimeKey.account.baseUrl
    const movedAccount = {
      ...account,
      baseUrl: "https://new.example.invalid",
    }
    const inheritedKey = {
      ...runtimeKey,
      baseUrl: originalBaseUrl,
      account: { ...runtimeKey.account, baseUrl: originalBaseUrl },
    }

    expect(
      createAccountRuntimeKeyExportSource(movedAccount, inheritedKey).baseUrl,
    ).toBe("https://new.example.invalid")
  })

  // AIHubMix accounts are stored against the console origin, so exports used to
  // hand external callers the dashboard instead of the API origin.
  it("exports the AIHubMix API origin for an account stored on the console", () => {
    const consoleAccount = buildDisplaySiteData({
      id: "aihubmix-console-account",
      name: "AIHubMix",
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://console.aihubmix.com",
    })
    const consoleKey = buildAccountKeyResourceRuntimeKey(consoleAccount, {
      ref: {
        accountId: consoleAccount.id,
        siteType: consoleAccount.siteType,
        scopeKey: "workspace:team-a",
        resourceId: "key/opaque-id",
      },
      label: "Native key",
      secret: "",
    })

    expect(
      createAccountRuntimeKeyExportSource(consoleAccount, consoleKey).baseUrl,
    ).toBe("https://aihubmix.com")
  })

  it("exports the OpenRouter gateway URL for an existing native key", () => {
    const openRouterAccount = buildDisplaySiteData({
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://openrouter.ai",
    })
    const key = buildAccountKeyResourceRuntimeKey(openRouterAccount, {
      ref: {
        accountId: openRouterAccount.id,
        siteType: SITE_TYPES.OPENROUTER,
        scopeKey: "default",
        resourceId: "hash-1",
      },
      label: "Existing key",
      secret: "",
    })

    expect(
      createAccountRuntimeKeyExportSource(openRouterAccount, key).baseUrl,
    ).toBe("https://openrouter.ai/api")
  })

  it("exports the Kimi gateway URL when a native key inherits the console address", () => {
    const kimiAccount = buildDisplaySiteData({
      siteType: SITE_TYPES.KIMI,
      baseUrl: "https://platform.kimi.com",
    })
    const key = buildAccountKeyResourceRuntimeKey(kimiAccount, {
      ref: {
        accountId: kimiAccount.id,
        siteType: SITE_TYPES.KIMI,
        scopeKey: "project-1",
        resourceId: "key-1",
      },
      label: "Kimi key",
      secret: "",
    })

    expect(createAccountRuntimeKeyExportSource(kimiAccount, key).baseUrl).toBe(
      "https://api.moonshot.cn",
    )
  })
})
