import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import {
  discoverAccountLoginMethods,
  loginAccount,
} from "~/services/accountLogin"
import * as siteDefinitions from "~/services/accountSiteDefinitions"
import { getAccountLoginCapability } from "~/services/apiAdapters/registry"
import { sub2ApiAccountLogin } from "~/services/apiAdapters/sub2api/accountLogin"
import { createSub2ApiOAuthFlow } from "~/services/apiAdapters/sub2api/browserOAuth"
import { buildSub2ApiOAuthStartUrl } from "~/services/apiService/sub2api/oauth/protocol"
import { AuthTypeEnum } from "~/types/auth"

const dependencies = vi.hoisted(() => ({
  request: vi.fn(),
  createBrowser: vi.fn(),
  authenticate: vi.fn(),
}))
vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApi: dependencies.request,
}))
vi.mock("~/services/browserOAuth/browserOAuth", () => ({
  createBrowserOAuthContext: dependencies.createBrowser,
}))

const origin = "https://sub2api.example"
const account = {
  site_url: origin + "/keys",
  site_type: SITE_TYPES.SUB2API,
  account_info: { id: "17", username: "display-name" },
}

describe("Sub2API adapter-owned OAuth login", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    dependencies.request.mockResolvedValue({
      code: 0,
      message: "success",
      data: {
        linuxdo_oauth_enabled: true,
        google_oauth_enabled: true,
        oidc_oauth_enabled: true,
        oidc_oauth_provider_name: "Company SSO",
      },
    })
    dependencies.createBrowser.mockReturnValue({
      authenticate: dependencies.authenticate,
    })
    dependencies.authenticate.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      evidence: {},
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it("does not offer OAuth on a split-origin deployment whose content flow needs same-origin API routes", async () => {
    const target = { ...account, site_url: "https://ai-router.dev/dashboard" }
    expect(sub2ApiAccountLogin.supports(target)).toBe(false)
    expect(await sub2ApiAccountLogin.discover(target)).toEqual([])
    expect(
      await sub2ApiAccountLogin.login({
        account: target,
        methodId: "google",
        requestId: "split-origin",
      }),
    ).toEqual({ status: "unsupported" })
    expect(dependencies.request).not.toHaveBeenCalled()
    expect(dependencies.createBrowser).not.toHaveBeenCalled()
  })

  it("preserves a non-authenticated browser result", async () => {
    dependencies.authenticate.mockResolvedValue({
      status: "interaction_required",
    })
    expect(
      await sub2ApiAccountLogin.login({
        account,
        methodId: "google",
        requestId: "needs-interaction",
      }),
    ).toEqual({ status: "interaction_required" })
  })

  it("rejects an unparsable Sub2API account URL", () => {
    expect(
      sub2ApiAccountLogin.supports({ ...account, site_url: "not a URL" }),
    ).toBe(false)
  })

  it("registers the real native capability without New API protocol metadata", () => {
    expect(getAccountLoginCapability(account)).toBe(sub2ApiAccountLogin)
    expect(
      siteDefinitions.getAccountSiteDefinition(SITE_TYPES.SUB2API)
        ?.accountLogin,
    ).toEqual({
      methods: ["github", "google", "linuxdo", "oidc", "dingtalk", "wechat"],
    })
  })

  it("discovers public native settings through the business entrypoint without starting login", async () => {
    expect(await discoverAccountLoginMethods(account)).toEqual([
      { id: "google", label: "Google" },
      { id: "linuxdo", label: "Linux DO" },
      { id: "oidc", label: "Company SSO" },
    ])
    expect(dependencies.request).toHaveBeenCalledExactlyOnceWith(
      { baseUrl: origin, auth: { authType: AuthTypeEnum.None } },
      expect.objectContaining({
        endpoint: "/api/v1/settings/public",
        options: { method: "GET", cache: "no-store" },
      }),
    )
    expect(dependencies.createBrowser).not.toHaveBeenCalled()
  })

  it.each(["google", "linuxdo", "wechat"])(
    "dispatches %s with Sub2API actions and the saved ID",
    async (methodId) => {
      const before = structuredClone(account)
      expect(
        await loginAccount({ account, methodId, requestId: "native-login" }),
      ).toEqual({
        status: "authenticated",
        identity: "17",
      })
      expect(dependencies.createBrowser).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          id: "sub2api-" + methodId,
          concurrencyKey: "sub2api-session",
          loginPath: "/login",
          prepareAction: RuntimeActionIds.ContentPrepareSub2ApiOAuth,
          prepareDetails: { loginProvider: methodId },
          completeAction: RuntimeActionIds.ContentCompleteSub2ApiOAuth,
        }),
      )
      expect(dependencies.authenticate).toHaveBeenCalledExactlyOnceWith({
        origin,
        expectedIdentity: "17",
        requestId: "native-login",
      })
      expect(account).toEqual(before)
      expect(dependencies.request).not.toHaveBeenCalled()
    },
  )

  it("honors the site definition's adopted methods and login route", async () => {
    const definition = siteDefinitions.getAccountSiteDefinition(
      SITE_TYPES.SUB2API,
    )!
    definition.accountLogin = { methods: ["google"] }
    definition.onboarding!.routes.loginPath = "/sign-in"
    vi.spyOn(siteDefinitions, "getAccountSiteDefinition").mockReturnValue(
      definition,
    )
    expect(await sub2ApiAccountLogin.discover(account)).toEqual([
      { id: "google", label: "Google" },
    ])
    expect(
      await sub2ApiAccountLogin.login({
        account,
        methodId: "github",
        requestId: "one",
      }),
    ).toEqual({
      status: "unsupported",
    })
    await sub2ApiAccountLogin.login({
      account,
      methodId: "google",
      requestId: "two",
    })
    expect(dependencies.createBrowser).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        loginPath: "/sign-in",
        prepareDetails: { loginProvider: "google" },
      }),
    )
  })

  it.each(["", " ", "display-name", "0", "-1", "1.5"])(
    "requires a valid saved Sub2API ID: %j",
    async (id) => {
      expect(
        await loginAccount({
          account: { ...account, account_info: { id, username: "17" } },
          methodId: "linuxdo",
          requestId: "login",
        }),
      ).toEqual({ status: "failed" })
      expect(dependencies.createBrowser).not.toHaveBeenCalled()
    },
  )

  it.each([
    "not a URL",
    "ftp://sub2api.example",
    "https://user:secret@sub2api.example",
  ])(
    "rejects unsupported URL %s without browser or API requests",
    async (site_url) => {
      const target = { ...account, site_url }
      expect(await discoverAccountLoginMethods(target)).toEqual([])
      expect(
        await loginAccount({
          account: target,
          methodId: "google",
          requestId: "login",
        }),
      ).toEqual({ status: "unsupported" })
      expect(dependencies.request).not.toHaveBeenCalled()
      expect(dependencies.createBrowser).not.toHaveBeenCalled()
    },
  )

  it("keeps other adapters and non-OAuth methods outside its capability", async () => {
    expect(
      sub2ApiAccountLogin.supports({
        ...account,
        site_type: SITE_TYPES.NEW_API,
      }),
    ).toBe(false)
    for (const methodId of ["password", "discord", "custom-oidc", "../bind"]) {
      expect(
        await loginAccount({ account, methodId, requestId: "login" }),
      ).toEqual({ status: "unsupported" })
    }
    expect(dependencies.createBrowser).not.toHaveBeenCalled()
  })

  it("fails discovery on a malformed native envelope without protocol fallback", async () => {
    dependencies.request.mockResolvedValue({
      success: true,
      data: { linuxdo_oauth: true },
    })
    await expect(discoverAccountLoginMethods(account)).rejects.toThrow()
    expect(dependencies.request).toHaveBeenCalledTimes(1)
    expect(dependencies.createBrowser).not.toHaveBeenCalled()
  })

  it("accepts only its bound backend start and final redirect", () => {
    const flow = createSub2ApiOAuthFlow({
      origin,
      provider: "google",
      requestId: "login",
      loginPath: "/login",
    })
    const startUrl = new URL(
      buildSub2ApiOAuthStartUrl(origin, "google", "login"),
    )
    expect(flow.isAuthorizationUrl(startUrl)).toBe(true)
    for (const replacement of [
      origin + "/api/v1/auth/oauth/google/bind/start",
      buildSub2ApiOAuthStartUrl("https://other.example", "google", "login"),
      buildSub2ApiOAuthStartUrl(origin, "github", "login"),
      buildSub2ApiOAuthStartUrl(origin, "google", "another"),
      startUrl.href + "&intent=bind_current_user",
    ])
      expect(flow.isAuthorizationUrl(new URL(replacement))).toBe(false)

    expect(
      flow.isCompletionUrl(
        new URL("/dashboard?all_api_hub_login=login", origin),
        origin,
      ),
    ).toBe(true)
    for (const path of [
      "/dashboard",
      "/dashboard?all_api_hub_login=another",
      "/auth/oauth/callback",
    ]) {
      expect(flow.isCompletionUrl(new URL(path, origin), origin)).toBe(false)
    }
    expect(
      flow.isCompletionUrl(
        new URL("/dashboard?all_api_hub_login=login", "https://other.example"),
        origin,
      ),
    ).toBe(false)
  })

  it("maps Sub2API preparation and completion outcomes without accepting malformed identity", () => {
    const flow = createSub2ApiOAuthFlow({
      origin,
      provider: "google",
      requestId: "login",
      loginPath: "/login",
    })
    expect(
      flow.parsePreparation({
        success: true,
        authorizationUrl: "https://idp.example/start",
      }),
    ).toEqual({ authorizationUrl: "https://idp.example/start" })
    expect(flow.parsePreparation({ success: true })).toBeNull()
    expect(
      flow.parsePreparation({ reason: "interaction_required" }),
    ).toMatchObject({ status: "interaction_required" })
    expect(flow.parsePreparation({ reason: "unsupported" })).toEqual({
      status: "unsupported",
    })
    expect(flow.parsePreparation({ reason: "uncertain" })).toMatchObject({
      status: "uncertain",
    })
    expect(flow.parsePreparation({ success: false })).toBeNull()
    expect(flow.parseCompletion({ reason: "identity_mismatch" })).toEqual({
      status: "identity_mismatch",
    })
    expect(flow.parseCompletion({ reason: "interaction_required" })).toEqual({
      status: "interaction_required",
    })
    expect(
      flow.parseCompletion({ success: true, identity: "display-name" }),
    ).toEqual({ status: "invalid" })
    expect(flow.parseCompletion({ success: true, identity: "17" })).toEqual({
      status: "verified",
      identity: "17",
      evidence: undefined,
    })
  })
})
