import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  discoverAccountLoginMethods,
  loginAccount,
} from "~/services/accountLogin"
import type { AccountSiteLoginConfig } from "~/services/accountSiteDefinitions/contracts"
import type {
  AccountLoginCapability,
  AccountLoginTarget,
} from "~/services/apiAdapters/contracts/accountLogin"

const nativeLogin = vi.hoisted(() => ({
  supports: vi.fn<AccountLoginCapability["supports"]>(),
  discover: vi.fn<AccountLoginCapability["discover"]>(),
  login: vi.fn<AccountLoginCapability["login"]>(),
}))
const createBrowser = vi.hoisted(() => vi.fn())
// Exercise the real adapter registry with a deliberately different implementation.
// This is a contract test double, not an AIHubMix OAuth implementation.
vi.mock("~/services/apiAdapters/aihubmix", () => ({
  aihubmixCapabilities: {
    siteType: "AIHubMix",
    account: { login: nativeLogin },
  },
}))
vi.mock("~/services/browserOAuth/browserOAuth", () => ({
  createBrowserOAuthContext: createBrowser,
}))

// No New API protocol, identity header, callback route or global provider enum is required.
const metadata: AccountSiteLoginConfig = { methods: ["oidc:company"] }
const account: AccountLoginTarget = {
  site_type: SITE_TYPES.AIHUBMIX,
  site_url: "https://console.aihubmix.com",
  account_info: { username: "alice" },
}

describe("login across adapter families", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    nativeLogin.supports.mockReturnValue(true)
    nativeLogin.discover.mockResolvedValue([
      { id: metadata.methods[0]!, label: "Company SSO" },
    ])
    nativeLogin.login.mockImplementation(async ({ account, methodId }) =>
      methodId === metadata.methods[0]
        ? { status: "authenticated", identity: account.account_info.username! }
        : { status: "unsupported" },
    )
  })

  it("discovers and executes an adapter-owned method using its native identity", async () => {
    const methods = await discoverAccountLoginMethods(account)
    expect(methods).toEqual([{ id: "oidc:company", label: "Company SSO" }])
    expect(nativeLogin.login).not.toHaveBeenCalled()

    const request = {
      account,
      methodId: methods[0]!.id,
      requestId: "native-login",
    }
    await expect(loginAccount(request)).resolves.toEqual({
      status: "authenticated",
      identity: "alice",
    })
    expect(nativeLogin.login).toHaveBeenCalledExactlyOnceWith(request)
    expect(createBrowser).not.toHaveBeenCalled()
  })

  it("lets the adapter decide which methods it supports", async () => {
    await expect(
      loginAccount({ account, methodId: "github", requestId: "unsupported" }),
    ).resolves.toEqual({ status: "unsupported" })
    expect(nativeLogin.login).toHaveBeenCalled()
    expect(createBrowser).not.toHaveBeenCalled()
  })

  it("does not execute discovery or login for a target rejected by its adapter", async () => {
    nativeLogin.supports.mockReturnValue(false)
    await expect(discoverAccountLoginMethods(account)).resolves.toEqual([])
    await expect(
      loginAccount({
        account,
        methodId: "oidc:company",
        requestId: "unsupported",
      }),
    ).resolves.toEqual({ status: "unsupported" })
    expect(nativeLogin.discover).not.toHaveBeenCalled()
    expect(nativeLogin.login).not.toHaveBeenCalled()
  })
})
