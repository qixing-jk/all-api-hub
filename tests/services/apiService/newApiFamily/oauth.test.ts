// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://gateway.example/login"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildNewApiAuthorizationUrl,
  discoverNewApiLoginMethods,
} from "~/services/apiService/newApiFamily/oauth/discovery"
import {
  handleClearNewApiOAuthEvidence,
  handleCompleteNewApiOAuth,
  handlePrepareNewApiOAuth,
} from "~/services/apiService/newApiFamily/oauth/newApiContent"

const request = {
  requestId: "login-1",
  origin: "https://gateway.example",
  loginProvider: "github",
  userIdHeader: "New-Api-User",
  completionPaths: ["/console", "/console/token", "/dashboard"],
}

const storeFlow = (modern: boolean, requestId = request.requestId) =>
  sessionStorage.setItem(
    "all-api-hub:oauth",
    JSON.stringify({
      requestId,
      modern,
      userIdHeader: request.userIdHeader,
      completionPaths: request.completionPaths,
    }),
  )
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status })
const ok = (data?: unknown) => json({ success: true, data })
const status = { github_oauth: true, github_client_id: "test-client" }
const run = (
  handler: typeof handlePrepareNewApiOAuth,
  input: Parameters<typeof handlePrepareNewApiOAuth>[0] = request,
) => new Promise((resolve) => handler(input, resolve))

describe("New API OAuth protocol", () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    history.replaceState({}, "", "/login")
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(["Veloera-User", "Rix-Api-User", "neo-api-user"])(
    "verifies a fork session using its registered %s identity header",
    async (userIdHeader) => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(ok(status))
        .mockResolvedValueOnce(json({}, 404))
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok("state"))
        .mockResolvedValueOnce(ok({ id: 17 }))
      expect(
        await run(handlePrepareNewApiOAuth, {
          ...request,
          userIdHeader,
          completionPaths: ["/app/tokens"],
        }),
      ).toMatchObject({ success: true })
      history.replaceState({}, "", "/app/tokens")
      localStorage.setItem("user", JSON.stringify({ id: 17 }))
      expect(await run(handleCompleteNewApiOAuth)).toEqual({
        success: true,
        userId: "17",
      })
      expect(fetch).toHaveBeenLastCalledWith(
        "/api/user/self",
        expect.objectContaining({
          headers: { Accept: "application/json", [userIdHeader]: "17" },
        }),
      )
    },
  )

  it("does not permit identity-header configuration to replace authorization", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
    expect(
      await run(handlePrepareNewApiOAuth, {
        ...request,
        userIdHeader: "Authorization",
      }),
    ).toMatchObject({ success: false })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    [],
    ["https://other.example/done"],
    ["//other.example"],
    ["/done?from=login"],
  ])(
    "rejects missing or invalid completion configuration before logout (%j)",
    async (completionPaths) => {
      const fetch = vi.spyOn(globalThis, "fetch")
      expect(
        await run(handlePrepareNewApiOAuth, { ...request, completionPaths }),
      ).toMatchObject({ success: false })
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it("keeps the prepared completion paths across navigation and ignores caller overrides", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok(status))
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok("state"))
      .mockResolvedValueOnce(ok({ id: 17 }))
    expect(
      await run(handlePrepareNewApiOAuth, {
        ...request,
        completionPaths: ["/oauth-ready"],
      }),
    ).toMatchObject({ success: true })
    localStorage.setItem("user", JSON.stringify({ id: 17 }))
    history.replaceState({}, "", "/dashboard")
    expect(
      await run(handleCompleteNewApiOAuth, {
        ...request,
        completionPaths: ["/dashboard"],
      }),
    ).toEqual({ success: false, reason: "unexpected_page" })
    expect(fetch).toHaveBeenCalledTimes(4)
    history.replaceState({}, "", "/oauth-ready")
    expect(await run(handleCompleteNewApiOAuth)).toEqual({
      success: true,
      userId: "17",
    })
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it("uses explicit login intent and the modern flow token without legacy requests", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok(status))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok({ flow_token: "signed-state" }))
    expect(await run(handlePrepareNewApiOAuth)).toEqual({
      success: true,
      authorizationUrl:
        "https://github.com/login/oauth/authorize?client_id=test-client&state=signed-state&scope=user%3Aemail",
    })
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "/api/status",
      "/api/user/auth/logout",
      "/api/oauth/state",
    ])
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/oauth/state",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ provider: "github", intent: "login" }),
        credentials: "include",
        redirect: "error",
      }),
    )
  })

  it.each([404, 405])(
    "uses legacy session logout only after a definitive %s",
    async (code) => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(ok(status))
        .mockResolvedValueOnce(json({}, code))
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok("legacy-state"))
      expect(await run(handlePrepareNewApiOAuth)).toMatchObject({
        success: true,
      })
      expect(
        fetch.mock.calls.map((call) => [call[0], call[1]?.method]),
      ).toEqual([
        ["/api/status", "GET"],
        ["/api/user/auth/logout", "POST"],
        ["/api/user/logout", "GET"],
        ["/api/oauth/state", "GET"],
      ])
    },
  )

  it.each([401, 409, 429, 500])(
    "does not fall back or create state after logout failure %s",
    async (code) => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(ok(status))
        .mockResolvedValueOnce(json({}, code))
      expect(await run(handlePrepareNewApiOAuth)).toEqual({
        success: false,
        reason: "request_failed",
      })
      expect(fetch).toHaveBeenCalledTimes(2)
    },
  )

  it("does not replay a lost state creation response", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok(status))
      .mockResolvedValueOnce(ok())
      .mockRejectedValueOnce(new Error("network"))
    expect(await run(handlePrepareNewApiOAuth)).toEqual({
      success: false,
      reason: "uncertain",
    })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(sessionStorage.length).toBe(0)
  })

  it("bounds protocol requests with an abort signal", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok(status))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok({ flow_token: "signed-state" }))

    await run(handlePrepareNewApiOAuth)

    for (const [, init] of fetch.mock.calls) {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it("rejects unsupported methods before logging out", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ github_oauth: false }))
    expect(await run(handlePrepareNewApiOAuth)).toEqual({
      success: false,
      reason: "unsupported",
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("rejects a different origin before issuing requests", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
    expect(
      await run(handlePrepareNewApiOAuth, {
        ...request,
        origin: "https://other.example",
      }),
    ).toMatchObject({ success: false })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    "verifies modern identity with a transient bearer (matching=%s)",
    async (matching) => {
      history.replaceState({}, "", "/dashboard")
      storeFlow(true)
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          ok({
            access_token: "transient-secret",
            token_type: "Bearer",
            access_expires_at: Date.now() / 1000 + 300,
            user: { id: 17 },
            session: { sid: "session-id", current: true },
          }),
        )
        .mockResolvedValueOnce(ok({ id: matching ? 17 : 18 }))
      const result = await run(handleCompleteNewApiOAuth)
      expect(result).toEqual(
        matching
          ? { success: true, userId: "17" }
          : { success: false, reason: "identity_mismatch" },
      )
      expect(fetch).toHaveBeenLastCalledWith(
        "/api/user/self",
        expect.objectContaining({
          headers: {
            Accept: "application/json",
            Authorization: "Bearer transient-secret",
          },
        }),
      )
      expect(JSON.stringify(result)).not.toContain("transient-secret")
      expect(localStorage.length).toBe(0)
      expect(sessionStorage.getItem("all-api-hub:oauth")).not.toContain(
        "transient-secret",
      )
    },
  )

  it("does not accept malformed modern bundles or fall back to stale localStorage", async () => {
    history.replaceState({}, "", "/dashboard")
    storeFlow(true)
    localStorage.setItem("user", JSON.stringify({ id: 17 }))
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ access_token: "invalid", user: { id: 17 } }))
    expect(await run(handleCompleteNewApiOAuth)).toMatchObject({
      success: false,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("verifies legacy callbacks using the callback identity header", async () => {
    history.replaceState({}, "", "/console/token")
    storeFlow(false)
    localStorage.setItem("user", JSON.stringify({ id: 17, checked_in: true }))
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ id: 17 }))
    expect(await run(handleCompleteNewApiOAuth)).toEqual({
      success: true,
      userId: "17",
    })
    expect(fetch).toHaveBeenCalledWith(
      "/api/user/self",
      expect.objectContaining({
        headers: { Accept: "application/json", "New-Api-User": "17" },
      }),
    )
  })

  it("does not accept another request's callback", async () => {
    history.replaceState({}, "", "/dashboard")
    storeFlow(true, "old")
    const fetch = vi.spyOn(globalThis, "fetch")
    expect(await run(handleCompleteNewApiOAuth)).toMatchObject({
      success: false,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("rejects a modern callback whose bundle has no user ID before reading self", async () => {
    history.replaceState({}, "", "/dashboard")
    storeFlow(true)
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      ok({
        access_token: "token",
        token_type: "Bearer",
        access_expires_at: Date.now() / 1000 + 300,
        user: {},
        session: { sid: "session", current: true },
      }),
    )
    expect(await run(handleCompleteNewApiOAuth)).toEqual({
      success: false,
      reason: "identity_mismatch",
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("rejects an empty OAuth state before storing a callback flow", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok(status))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok({ flow_token: "" }))
    expect(await run(handlePrepareNewApiOAuth)).toEqual({
      success: false,
      reason: "request_failed",
    })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(sessionStorage.getItem("all-api-hub:oauth")).toBeNull()
  })

  it("revokes only the unchanged modern session after failed verification", async () => {
    history.replaceState({}, "", "/dashboard")
    storeFlow(true)
    const bundle = (sessionId: string) =>
      ok({
        access_token: `token-${sessionId}`,
        token_type: "Bearer",
        access_expires_at: Date.now() / 1000 + 300,
        user: { id: 17 },
        session: { sid: sessionId, current: true },
      })
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(bundle("failed-session"))
      .mockResolvedValueOnce(ok({ id: 18 }))
      .mockResolvedValueOnce(bundle("failed-session"))
      .mockResolvedValueOnce(ok())

    await expect(run(handleCompleteNewApiOAuth)).resolves.toEqual({
      success: false,
      reason: "identity_mismatch",
    })
    await expect(run(handleClearNewApiOAuthEvidence)).resolves.toEqual({
      success: true,
    })

    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/user/auth/refresh",
      "/api/user/self",
      "/api/user/auth/refresh",
      "/api/user/auth/logout",
    ])
    expect(sessionStorage.getItem("all-api-hub:oauth")).toBeNull()
  })

  it("preserves a newer modern session established before failure cleanup", async () => {
    history.replaceState({}, "", "/dashboard")
    storeFlow(true)
    const bundle = (sessionId: string) =>
      ok({
        access_token: `token-${sessionId}`,
        token_type: "Bearer",
        access_expires_at: Date.now() / 1000 + 300,
        user: { id: 17 },
        session: { sid: sessionId, current: true },
      })
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(bundle("failed-session"))
      .mockResolvedValueOnce(ok({ id: 18 }))
      .mockResolvedValueOnce(bundle("newer-session"))

    await run(handleCompleteNewApiOAuth)
    await run(handleClearNewApiOAuthEvidence)

    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/user/auth/refresh",
      "/api/user/self",
      "/api/user/auth/refresh",
    ])
    expect(sessionStorage.getItem("all-api-hub:oauth")).toBeNull()
  })

  it("clears local evidence when the rejected modern session has expired", async () => {
    history.replaceState({}, "", "/dashboard")
    storeFlow(true)
    localStorage.setItem("user", JSON.stringify({ id: 17 }))
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        ok({
          access_token: "token",
          token_type: "Bearer",
          access_expires_at: Date.now() / 1000 + 300,
          user: { id: 17 },
          session: { sid: "failed-session", current: true },
        }),
      )
      .mockResolvedValueOnce(ok({ id: 18 }))
      .mockResolvedValueOnce(json({}, 401))

    expect(await run(handleCompleteNewApiOAuth)).toMatchObject({
      success: false,
      reason: "identity_mismatch",
    })
    expect(await run(handleClearNewApiOAuthEvidence)).toEqual({ success: true })
    expect(localStorage.getItem("user")).toBeNull()
    expect(sessionStorage.getItem("all-api-hub:oauth")).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it("clears local evidence even when modern revocation fails", async () => {
    history.replaceState({}, "", "/dashboard")
    storeFlow(true)
    localStorage.setItem("user", JSON.stringify({ id: 17 }))
    const bundle = ok({
      access_token: "token",
      token_type: "Bearer",
      access_expires_at: Date.now() / 1000 + 300,
      user: { id: 17 },
      session: { sid: "failed-session", current: true },
    })
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(bundle)
      .mockResolvedValueOnce(ok({ id: 18 }))
      .mockResolvedValueOnce(bundle.clone())
      .mockResolvedValueOnce(json({}, 500))

    expect(await run(handleCompleteNewApiOAuth)).toMatchObject({
      success: false,
    })
    expect(await run(handleClearNewApiOAuthEvidence)).toEqual({
      success: false,
      reason: "request_failed",
    })
    expect(localStorage.getItem("user")).toBeNull()
    expect(sessionStorage.getItem("all-api-hub:oauth")).toBeNull()
  })

  it("revokes only the observed legacy session after failed identity verification", async () => {
    history.replaceState({}, "", "/dashboard")
    storeFlow(false)
    localStorage.setItem("user", JSON.stringify({ id: 17 }))
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ id: 18 }))
      .mockResolvedValueOnce(ok())

    expect(await run(handleCompleteNewApiOAuth)).toMatchObject({
      success: false,
    })
    expect(await run(handleClearNewApiOAuthEvidence)).toEqual({ success: true })
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/user/self",
      "/api/user/logout",
    ])
    expect(localStorage.getItem("user")).toBeNull()
  })
})

describe("OAuth provider discovery", () => {
  it("intersects implemented and deployment-enabled methods", () => {
    expect(
      discoverNewApiLoginMethods(
        {
          ...status,
          linuxdo_oauth: true,
          linuxdo_client_id: "linux",
          discord_oauth: true,
          discord_client_id: "discord",
        },
        ["linuxdo"],
      ),
    ).toEqual([
      {
        provider: "linuxdo",
        label: "Linux DO",
        clientId: "linux",
        authorizationEndpoint: "https://connect.linux.do/oauth2/authorize",
      },
    ])
  })

  it.each([
    "not a URL",
    "javascript:alert(1)",
    "http://idp.example/auth",
    "https://user:secret@idp.example/auth",
  ])("does not offer unsafe OIDC endpoints %s", (endpoint) => {
    expect(
      discoverNewApiLoginMethods(
        {
          oidc_enabled: true,
          oidc_client_id: "oidc",
          oidc_authorization_endpoint: endpoint,
        },
        ["oidc"],
      ),
    ).toEqual([])
  })

  it("preserves OIDC endpoint parameters and uses the account callback origin", () => {
    const [method] = discoverNewApiLoginMethods(
      {
        oidc_enabled: true,
        oidc_client_id: "oidc",
        oidc_authorization_endpoint: "https://idp.example/auth?audience=test",
      },
      ["oidc"],
    )
    const url = new URL(
      buildNewApiAuthorizationUrl(
        method!,
        "state/+",
        "https://gateway.example",
      ),
    )
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://gateway.example/oauth/oidc",
    )
    expect(url.searchParams.get("state")).toBe("state/+")
    expect(url.searchParams.get("audience")).toBe("test")
  })

  it("sends separate Discord scopes instead of an encoded literal plus", () => {
    const [method] = discoverNewApiLoginMethods(
      { discord_oauth: true, discord_client_id: "discord-client" },
      ["discord"],
    )
    const url = new URL(
      buildNewApiAuthorizationUrl(method!, "signed-state", request.origin),
    )
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      "identify",
      "openid",
    ])
    expect(url.searchParams.get("redirect_uri")).toBe(
      `${request.origin}/oauth/discord`,
    )
  })
})
