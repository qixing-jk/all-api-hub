import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { buildAccountKeyResourceRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import {
  resolveDisplayAccountRuntimeKeySecret,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  createAccountRuntimeKeyExportSource,
  createAccountTokenExportSource,
} from "~/services/accounts/utils/credentialExport"
import { resolveCredentialExport } from "~/services/integrations/credentialExport"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountRuntimeKeySecret: vi.fn(),
  resolveDisplayAccountTokenForSecret: vi.fn(),
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

describe("account credential exports", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("exports a usable inventory secret without a provider read or inventory mutation", async () => {
    const token = buildApiToken({
      key: " current-test-key ",
      note: "Key notes",
    })
    const source = createAccountTokenExportSource(account, token)

    expect(source.notes).toBe("Key notes")
    await expect(resolveCredentialExport(source)).resolves.toEqual({
      providerId: account.id,
      providerName: account.name,
      baseUrl: account.baseUrl,
      apiKey: "sk-current-test-key",
    })
    expect(resolveDisplayAccountTokenForSecret).not.toHaveBeenCalled()
    expect(token.key).toBe(" current-test-key ")
  })

  it("defers masked inventory secret recovery until the credential is needed", async () => {
    const token = buildApiToken({ key: "sk-********" })
    vi.mocked(resolveDisplayAccountTokenForSecret).mockResolvedValue({
      ...token,
      key: "resolved-test-key",
    })
    const source = createAccountTokenExportSource(account, token)

    expect(resolveDisplayAccountTokenForSecret).not.toHaveBeenCalled()
    await expect(source.resolveApiKey()).resolves.toBe("resolved-test-key")
    expect(resolveDisplayAccountTokenForSecret).toHaveBeenCalledWith(
      account,
      token,
      {},
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
    expect(resolveDisplayAccountTokenForSecret).not.toHaveBeenCalled()
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
})
