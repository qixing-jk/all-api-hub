// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://sub2api.example/login"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  handleClearSub2ApiOAuthEvidence,
  handleCompleteSub2ApiOAuth,
  handlePrepareSub2ApiOAuth,
} from "~/services/apiService/sub2api/oauth/content"
import {
  discoverSub2ApiOAuthMethods,
  type Sub2ApiOAuthProvider,
} from "~/services/apiService/sub2api/oauth/protocol"

const origin = "https://sub2api.example"
const flowKey = "all-api-hub:sub2api-oauth"
const settingsPath = "/api/v1/settings/public"
const logoutPath = "/api/v1/auth/logout"
const mePath = "/api/v1/auth/me"
const request = { origin, requestId: "login-1", loginProvider: "linuxdo" }
const providers = [
  "github",
  "google",
  "linuxdo",
  "oidc",
  "dingtalk",
  "wechat",
] satisfies Sub2ApiOAuthProvider[]
const enabledSettings = {
  github_oauth_enabled: true,
  google_oauth_enabled: true,
  linuxdo_oauth_enabled: true,
  oidc_oauth_enabled: true,
  oidc_oauth_provider_name: " Company SSO ",
  dingtalk_oauth_enabled: true,
  wechat_oauth_open_enabled: true,
}
const fetchMock = vi.fn<typeof fetch>()

function json(data: unknown) {
  return Response.json({ code: 0, message: "success", data })
}

function invoke(
  handler: typeof handlePrepareSub2ApiOAuth,
  details: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    handler({ ...request, ...details }, (value) =>
      resolve(value as Record<string, unknown>),
    )
  })
}

function storeSession(token = "fresh-access", id: unknown = 17) {
  localStorage.setItem("auth_token", token)
  localStorage.setItem("refresh_token", "website-refresh")
  localStorage.setItem("token_expires_at", String(Date.now() + 300_000))
  localStorage.setItem("auth_user", JSON.stringify({ id, username: "cached" }))
}

async function reachCompletion() {
  const prepared = await invoke(handlePrepareSub2ApiOAuth)
  const startUrl = new URL(prepared.authorizationUrl as string)
  history.replaceState(null, "", startUrl.searchParams.get("redirect")!)
  storeSession()
  fetchMock.mockClear()
}

describe("Sub2API OAuth protocol", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (path) => {
      if (path === settingsPath) return json(enabledSettings)
      if (path === logoutPath) return json({})
      if (path === mePath) return json({ id: "17" })
      throw new Error("Unexpected protocol request")
    })
    localStorage.clear()
    sessionStorage.clear()
    history.replaceState(null, "", "/login")
  })
  afterEach(() => vi.unstubAllGlobals())

  it("discovers native flags and the configured OIDC label without client IDs", () => {
    expect(discoverSub2ApiOAuthMethods(enabledSettings, providers)).toEqual([
      { id: "github", label: "GitHub" },
      { id: "google", label: "Google" },
      { id: "linuxdo", label: "Linux DO" },
      { id: "oidc", label: "Company SSO" },
      { id: "dingtalk", label: "DingTalk" },
      { id: "wechat", label: "WeChat" },
    ])
    expect(
      discoverSub2ApiOAuthMethods(
        {
          ...enabledSettings,
          linuxdo_oauth_enabled: false,
          oidc_oauth_provider_name: " ",
        },
        ["linuxdo", "oidc"],
      ),
    ).toEqual([{ id: "oidc", label: "OIDC" }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not infer WeChat browser support from aggregate, MP or native-app flags", () => {
    const settings = {
      wechat_oauth_enabled: true,
      wechat_oauth_mp_enabled: true,
      wechat_oauth_mobile_enabled: true,
      wechat_oauth_open_enabled: false,
    }
    expect(discoverSub2ApiOAuthMethods(settings, providers)).toEqual([])
    expect(
      discoverSub2ApiOAuthMethods(
        { ...settings, wechat_oauth_open_enabled: undefined },
        providers,
      ),
    ).toEqual([])
  })

  it.each(providers)(
    "prepares %s through the backend start route, without making a start request",
    async (provider) => {
      storeSession("old-access")
      localStorage.setItem("pending_auth_session", '{"provider":"oidc"}')
      localStorage.setItem("theme", "dark")
      sessionStorage.setItem("email_oauth_pending_provider", "stale-provider")

      const prepared = await invoke(handlePrepareSub2ApiOAuth, {
        loginProvider: provider,
      })

      expect(prepared.success).toBe(true)
      const startUrl = new URL(prepared.authorizationUrl as string)
      expect(startUrl.origin).toBe(origin)
      expect(startUrl.pathname).toBe(
        "/api/v1/auth/oauth/" + provider + "/start",
      )
      expect(startUrl.searchParams.get("intent")).toBe("login")
      expect(startUrl.searchParams.get("state")).toBeNull()
      expect(startUrl.searchParams.get("mode")).toBe(
        provider === "wechat" ? "open" : null,
      )
      expect(startUrl.searchParams.get("redirect")).toBe(
        "/dashboard?all_api_hub_login=login-1",
      )
      expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
        settingsPath,
        logoutPath,
      ])
      expect(fetchMock).toHaveBeenLastCalledWith(
        logoutPath,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ refresh_token: "website-refresh" }),
          credentials: "include",
          redirect: "error",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }),
      )
      expect(localStorage.length).toBe(1)
      expect(localStorage.getItem("theme")).toBe("dark")
      expect(sessionStorage.getItem("email_oauth_pending_provider")).toBe(
        provider === "github" || provider === "google" ? provider : null,
      )
      expect(JSON.stringify(prepared)).not.toContain("website-refresh")
      expect(JSON.stringify(prepared)).not.toContain("old-access")
      expect(sessionStorage.getItem(flowKey)).not.toContain("website-refresh")
    },
  )

  it("clears pending server cookies via logout even without a refresh token", async () => {
    await invoke(handlePrepareSub2ApiOAuth)
    expect(fetchMock).toHaveBeenLastCalledWith(
      logoutPath,
      expect.objectContaining({
        method: "POST",
        body: "{}",
        credentials: "include",
      }),
    )
  })

  it.each(["tencent_captcha_enabled", "aliyun_captcha_enabled"])(
    "reports %s before logging out or replacing existing evidence",
    async (flag) => {
      storeSession("old-access")
      fetchMock.mockResolvedValueOnce(
        json({ ...enabledSettings, [flag]: true }),
      )
      expect(await invoke(handlePrepareSub2ApiOAuth)).toEqual({
        success: false,
        reason: "interaction_required",
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem("auth_token")).toBe("old-access")
      expect(sessionStorage.getItem(flowKey)).toBeNull()
    },
  )

  it("does not conflate ordinary Turnstile with Sub2API's OAuth action CAPTCHA", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ ...enabledSettings, turnstile_enabled: true }),
    )
    expect(await invoke(handlePrepareSub2ApiOAuth)).toMatchObject({
      success: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    { origin: "https://other.example" },
    { requestId: "" },
    { requestId: " " },
    { loginProvider: "../bind" },
  ])(
    "rejects invalid context before protocol requests: %j",
    async (details) => {
      expect(await invoke(handlePrepareSub2ApiOAuth, details)).toMatchObject({
        success: false,
      })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it("rechecks the selected provider before disturbing the website session", async () => {
    storeSession("old-access")
    fetchMock.mockResolvedValueOnce(json({ linuxdo_oauth_enabled: false }))
    expect(await invoke(handlePrepareSub2ApiOAuth)).toEqual({
      success: false,
      reason: "unsupported",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem("auth_token")).toBe("old-access")
  })

  it.each([
    {
      success: true,
      data: { linuxdo_oauth: true, linuxdo_client_id: "client" },
    },
    { code: 0, data: null },
    { code: 0, data: [] },
    { code: 1, message: "secret" },
  ])(
    "rejects malformed or non-Sub2API discovery envelopes: %j",
    async (payload) => {
      fetchMock.mockResolvedValueOnce(Response.json(payload))
      expect(await invoke(handlePrepareSub2ApiOAuth)).toEqual({
        success: false,
        reason: "request_failed",
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    [401, "request_failed"],
    [404, "request_failed"],
    [429, "request_failed"],
    [500, "uncertain"],
  ])(
    "never falls back or replays logout after HTTP %s",
    async (status, reason) => {
      fetchMock
        .mockResolvedValueOnce(json(enabledSettings))
        .mockResolvedValueOnce(
          new Response("secret", { status: Number(status) }),
        )
      expect(await invoke(handlePrepareSub2ApiOAuth)).toEqual({
        success: false,
        reason,
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(sessionStorage.getItem(flowKey)).toBeNull()
    },
  )

  it.each(["network", "invalid-json", "invalid-envelope"])(
    "retains uncertainty when logout has an unconfirmed %s response",
    async (failure) => {
      fetchMock.mockResolvedValueOnce(json(enabledSettings))
      if (failure === "network")
        fetchMock.mockRejectedValueOnce(new Error("secret"))
      else
        fetchMock.mockResolvedValueOnce(
          failure === "invalid-json"
            ? new Response("secret")
            : Response.json({ success: true }),
        )
      expect(await invoke(handlePrepareSub2ApiOAuth)).toEqual({
        success: false,
        reason: "uncertain",
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it("verifies a fresh website Bearer token and returns identity only", async () => {
    await reachCompletion()
    expect(await invoke(handleCompleteSub2ApiOAuth)).toEqual({
      success: true,
      identity: "17",
    })
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      mePath,
      expect.objectContaining({
        credentials: "include",
        redirect: "error",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer fresh-access",
        },
      }),
    )
  })

  it.each([
    "/dashboard",
    "/dashboard?all_api_hub_login=other-request",
    "/auth/linuxdo/callback#access_token=untrusted",
    "/auth/oauth/callback",
  ])(
    "rejects an old, mismatched or unfinished callback at %s",
    async (path) => {
      await reachCompletion()
      history.replaceState(null, "", path)
      expect(await invoke(handleCompleteSub2ApiOAuth)).toEqual({
        success: false,
        reason: "unexpected_page",
      })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it("requires the prepared request and origin even on the final redirect", async () => {
    await reachCompletion()
    expect(
      await invoke(handleCompleteSub2ApiOAuth, { requestId: "another" }),
    ).toMatchObject({ success: false })
    expect(
      await invoke(handleCompleteSub2ApiOAuth, {
        origin: "https://elsewhere.example",
      }),
    ).toMatchObject({ success: false })
    sessionStorage.removeItem(flowKey)
    expect(await invoke(handleCompleteSub2ApiOAuth)).toMatchObject({
      success: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([18, "", null, {}, "not-a-user-id"])(
    "rejects server identity %j instead of trusting cached auth_user",
    async (id) => {
      await reachCompletion()
      fetchMock.mockResolvedValueOnce(json({ id }))
      expect(await invoke(handleCompleteSub2ApiOAuth)).toEqual({
        success: false,
        reason: "identity_mismatch",
      })
    },
  )

  it.each(["missing-token", "expired", "expired-jwt", "pending-account"])(
    "does not refresh or complete a %s session",
    async (state) => {
      await reachCompletion()
      if (state === "missing-token") localStorage.removeItem("auth_token")
      if (state === "expired") localStorage.setItem("token_expires_at", "1")
      if (state === "expired-jwt") {
        localStorage.setItem(
          "auth_token",
          "header." + btoa('{"exp":1}') + ".signature",
        )
      }
      if (state === "pending-account")
        localStorage.setItem("pending_auth_session", '{"provider":"linuxdo"}')
      expect(await invoke(handleCompleteSub2ApiOAuth)).toEqual({
        success: false,
        reason: "interaction_required",
      })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it("does not replay verification or rotate a refresh token after auth/me rejects", async () => {
    await reachCompletion()
    fetchMock.mockResolvedValueOnce(
      Response.json({ message: "sensitive-token" }, { status: 401 }),
    )
    expect(await invoke(handleCompleteSub2ApiOAuth)).toEqual({
      success: false,
      reason: "request_failed",
    })
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([mePath])
  })

  it("cleans up only the failed flow and the session it actually observed", async () => {
    await reachCompletion()
    fetchMock.mockResolvedValueOnce(json({ id: 18 }))
    await invoke(handleCompleteSub2ApiOAuth)
    await invoke(handleClearSub2ApiOAuthEvidence, { requestId: "unrelated" })
    expect(localStorage.getItem("auth_token")).toBe("fresh-access")
    expect(sessionStorage.getItem(flowKey)).not.toBeNull()
    await invoke(handleClearSub2ApiOAuthEvidence)
    expect(localStorage.getItem("auth_token")).toBeNull()
    expect(localStorage.getItem("refresh_token")).toBeNull()
    expect(sessionStorage.getItem(flowKey)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not verify or clear a session replaced by another tab during auth/me", async () => {
    await reachCompletion()
    fetchMock.mockImplementationOnce(async () => {
      storeSession("another-tab-access", 18)
      return json({ id: 17 })
    })
    expect(await invoke(handleCompleteSub2ApiOAuth)).toEqual({
      success: false,
      reason: "interaction_required",
    })
    await invoke(handleClearSub2ApiOAuthEvidence)
    expect(localStorage.getItem("auth_token")).toBe("another-tab-access")
    expect(sessionStorage.getItem(flowKey)).toBeNull()
  })
})
