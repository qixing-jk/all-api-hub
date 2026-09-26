// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://agentrouter.org/login"}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_LOGIN_PROVIDERS } from "~/constants/accountLogin"
import {
  handleApproveLinuxDoOAuth,
  handleClearAgentRouterOAuthEvidence,
  handleCompleteAgentRouterOAuth,
  handlePrepareAgentRouterOAuth,
} from "~/entrypoints/content/messageHandlers/handlers/agentRouterOAuth"

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })

async function runHandler(
  handler: (sendResponse: (value: unknown) => void) => true,
) {
  return await new Promise<unknown>((resolve) => {
    expect(handler(resolve)).toBe(true)
  })
}

async function runRequestHandler(
  handler: (
    request: Record<string, unknown>,
    sendResponse: (value: unknown) => void,
  ) => true,
  request: Record<string, unknown>,
) {
  return await new Promise<unknown>((resolve) => {
    expect(handler(request, resolve)).toBe(true)
  })
}

describe("AgentRouter OAuth content seam", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    document.body.replaceChildren()
    window.history.replaceState({}, "", "/login")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("clears the previous login before creating a fresh OAuth state", async () => {
    localStorage.setItem("__agwt_rt", "stale-refresh-token")
    localStorage.setItem("i18nextLng", "zh-CN")
    localStorage.setItem(
      "user",
      JSON.stringify({ id: "stale-user", checked_in: true }),
    )
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            github_client_id: "client123",
            github_oauth: true,
            system_name: "Agent Router",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockImplementationOnce(async () => {
        expect(localStorage.getItem("__agwt_rt")).toBeNull()
        return jsonResponse({ success: true, data: "signed-state" })
      })

    await expect(
      runRequestHandler(handlePrepareAgentRouterOAuth, {
        loginProvider: ACCOUNT_LOGIN_PROVIDERS.Github,
      }),
    ).resolves.toEqual({
      success: true,
      clientId: "client123",
      state: "signed-state",
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/status",
      expect.objectContaining({ credentials: "include", redirect: "error" }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/user/logout",
      expect.objectContaining({ credentials: "include", redirect: "error" }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/oauth/state?mode=login",
      expect.objectContaining({ credentials: "include", redirect: "error" }),
    )
    expect(localStorage.getItem("user")).toBeNull()
    expect(localStorage.getItem("__agwt_rt")).toBeNull()
    expect(localStorage.getItem("i18nextLng")).toBe("zh-CN")
  })

  it("rejects an attacker origin before reading or fetching anything", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    vi.stubGlobal("location", {
      origin: "https://attacker.example.invalid",
      hostname: "attacker.example.invalid",
      protocol: "https:",
      pathname: "/console/token",
    })
    localStorage.setItem(
      "user",
      JSON.stringify({ id: "user-1", checked_in: true }),
    )

    await expect(runHandler(handleCompleteAgentRouterOAuth)).resolves.toEqual({
      success: false,
      reason: "unexpected_origin",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("accepts known mirror ps.air-outer.com origin", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        success: true,
        data: { id: "user-1" },
      }),
    )
    vi.stubGlobal("location", {
      origin: "https://ps.air-outer.com",
      href: "https://ps.air-outer.com/console/token",
      pathname: "/console/token",
    })
    localStorage.setItem(
      "user",
      JSON.stringify({ id: "user-1", checked_in: true }),
    )

    await expect(runHandler(handleCompleteAgentRouterOAuth)).resolves.toEqual({
      success: true,
      userId: "user-1",
      checkedIn: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user/self",
      expect.objectContaining({
        headers: expect.objectContaining({ "New-Api-User": "user-1" }),
      }),
    )
  })

  it("clears rejected callback evidence without making a request", async () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ id: "rejected-user", checked_in: true }),
    )
    const fetchMock = vi.spyOn(globalThis, "fetch")

    await expect(
      runHandler(handleClearAgentRouterOAuthEvidence),
    ).resolves.toEqual({ success: true })
    expect(localStorage.getItem("user")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns sanitized callback evidence only after self identity agrees", async () => {
    window.history.replaceState({}, "", "/console/token")
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 17, username: "Example", checked_in: true }),
    )
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) =>
      jsonResponse(
        new Headers(init?.headers).get("New-Api-User") === "17"
          ? { success: true, data: { id: 17, username: "Example" } }
          : {
              success: false,
              message: "无权进行此操作，未提供 New-Api-User",
            },
      ),
    )

    await expect(runHandler(handleCompleteAgentRouterOAuth)).resolves.toEqual({
      success: true,
      userId: "17",
      checkedIn: true,
    })
  })

  it("rejects mismatched local callback and /api/user/self identities", async () => {
    window.history.replaceState({}, "", "/console/token")
    localStorage.setItem(
      "user",
      JSON.stringify({ id: "user-a", checked_in: true }),
    )
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ success: true, data: { id: "user-b" } }),
    )

    await expect(runHandler(handleCompleteAgentRouterOAuth)).resolves.toEqual({
      success: false,
      reason: "identity_mismatch",
    })
    expect(localStorage.getItem("user")).toBeNull()
  })

  it.each([null, "invalid-json", JSON.stringify({ checked_in: true })])(
    "rejects missing callback identity before requesting self (%s)",
    async (storedUser) => {
      window.history.replaceState({}, "", "/console/token")
      if (storedUser !== null) localStorage.setItem("user", storedUser)
      const fetchMock = vi.spyOn(globalThis, "fetch")

      await expect(runHandler(handleCompleteAgentRouterOAuth)).resolves.toEqual(
        {
          success: false,
          reason: "identity_mismatch",
        },
      )
      expect(fetchMock).not.toHaveBeenCalled()
      expect(localStorage.getItem("user")).toBeNull()
    },
  )

  it.each([false, undefined])(
    "verifies login independently of checked_in=%s",
    async (checked_in) => {
      window.history.replaceState({}, "", "/console/token")
      localStorage.setItem("user", JSON.stringify({ id: "user-1", checked_in }))
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonResponse({ success: true, data: { id: "user-1" } }),
      )

      await expect(runHandler(handleCompleteAgentRouterOAuth)).resolves.toEqual(
        {
          success: true,
          userId: "user-1",
          ...(checked_in === undefined ? {} : { checkedIn: checked_in }),
        },
      )
    },
  )

  it("prepares the selected Linux DO login without falling back to GitHub", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            github_client_id: "github-client",
            github_oauth: true,
            linuxdo_client_id: "linuxdo-client",
            linuxdo_oauth: true,
            system_name: "Agent Router",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: "signed-state" }),
      )

    await expect(
      runRequestHandler(handlePrepareAgentRouterOAuth, {
        loginProvider: ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
      }),
    ).resolves.toEqual({
      success: true,
      clientId: "linuxdo-client",
      state: "signed-state",
    })
  })

  it("stops before OAuth state creation when the existing session cannot be cleared", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            system_name: "Agent Router",
            linuxdo_oauth: true,
            linuxdo_client_id: "client",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ success: false, message: "logout failed" }),
      )
    await expect(
      runRequestHandler(handlePrepareAgentRouterOAuth, {
        loginProvider: ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
      }),
    ).resolves.toMatchObject({ success: false, message: "logout failed" })
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/status",
      "/api/user/logout",
    ])
  })

  it("clicks one semantic Linux DO authorization control on the exact requested page", async () => {
    vi.stubGlobal(
      "location",
      new URL(
        "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=linuxdo-client&state=signed-state",
      ),
    )
    const authorize = document.createElement("button")
    authorize.textContent = "Authorize"
    const click = vi.spyOn(authorize, "click")
    document.body.append(authorize)

    await expect(
      runRequestHandler(handleApproveLinuxDoOAuth, {
        authorizationUrl:
          "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=linuxdo-client&state=signed-state",
      }),
    ).resolves.toEqual({ success: true })
    expect(click).toHaveBeenCalledOnce()
  })

  it("refuses Linux DO authorization when the signed state does not match", async () => {
    vi.stubGlobal(
      "location",
      new URL(
        "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=linuxdo-client&state=other-state",
      ),
    )
    const authorize = document.createElement("button")
    authorize.textContent = "Authorize"
    const click = vi.spyOn(authorize, "click")
    document.body.append(authorize)

    await expect(
      runRequestHandler(handleApproveLinuxDoOAuth, {
        authorizationUrl:
          "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=linuxdo-client&state=signed-state",
      }),
    ).resolves.toEqual({ success: false, reason: "unexpected_page" })
    expect(click).not.toHaveBeenCalled()
  })

  it("waits for a matching Linux DO authorization control rendered after page load", async () => {
    vi.stubGlobal(
      "location",
      new URL(
        "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=linuxdo-client&state=signed-state",
      ),
    )
    const authorize = document.createElement("button")
    authorize.textContent = "允许"
    const click = vi.spyOn(authorize, "click")
    queueMicrotask(() => document.body.append(authorize))

    await expect(
      runRequestHandler(handleApproveLinuxDoOAuth, {
        authorizationUrl:
          "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=linuxdo-client&state=signed-state",
      }),
    ).resolves.toEqual({ success: true })
    expect(click).toHaveBeenCalledOnce()
  })
  it.each(["disabled", "hidden", "aria-disabled", "aria-hidden"])(
    "authorizes when an existing control becomes available (%s)",
    async (attribute) => {
      vi.useFakeTimers()
      const authorizationUrl =
        "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=client&state=signed"
      vi.stubGlobal("location", new URL(authorizationUrl))
      const control = document.createElement("button")
      control.textContent = "允许"
      control.setAttribute(attribute, "true")
      document.body.append(control)
      const click = vi.spyOn(control, "click")
      const result = runRequestHandler(handleApproveLinuxDoOAuth, {
        authorizationUrl,
      })
      control.removeAttribute(attribute)
      await vi.advanceTimersByTimeAsync(12_000)
      await expect(result).resolves.toEqual({ success: true })
      expect(click).toHaveBeenCalledOnce()
    },
  )

  it.each([
    handleClearAgentRouterOAuthEvidence,
    (send: (value: unknown) => void) =>
      handlePrepareAgentRouterOAuth({ loginProvider: "github" }, send),
  ])(
    "refuses preparation and cleanup on a foreign origin %#",
    async (handler) => {
      vi.stubGlobal("location", new URL("https://other.invalid/login"))
      const fetchMock = vi.spyOn(globalThis, "fetch")
      localStorage.setItem("user", "keep")
      await expect(runHandler(handler)).resolves.toEqual({
        success: false,
        reason: "unexpected_origin",
      })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(localStorage.getItem("user")).toBe("keep")
    },
  )

  it("rejects completion before the callback page", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    await expect(runHandler(handleCompleteAgentRouterOAuth)).resolves.toEqual({
      success: false,
      reason: "unexpected_page",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([undefined, "github", "linuxdo", "unknown"])(
    "rejects unavailable login providers before logout (%s)",
    async (loginProvider) => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            system_name: "Agent Router",
            github_oauth: false,
            linuxdo_oauth: false,
          },
        }),
      )
      await expect(
        runRequestHandler(handlePrepareAgentRouterOAuth, { loginProvider }),
      ).resolves.toMatchObject({ success: false, reason: "request_failed" })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it("rejects an empty server-signed OAuth state", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            system_name: "Agent Router",
            github_oauth: true,
            github_client_id: "client",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: " " }))
    await expect(
      runRequestHandler(handlePrepareAgentRouterOAuth, {
        loginProvider: "github",
      }),
    ).resolves.toMatchObject({
      success: false,
      message: "AgentRouter returned an invalid OAuth state.",
    })
  })

  it("reports HTTP failure even when the response claims success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 503 }),
    )
    await expect(
      runRequestHandler(handlePrepareAgentRouterOAuth, {
        loginProvider: "github",
      }),
    ).resolves.toMatchObject({
      success: false,
      message: "AgentRouter request failed (503)",
    })
  })

  it.each([undefined, "not a URL"])(
    "rejects malformed Linux DO authorization URLs (%s)",
    async (authorizationUrl) => {
      await expect(
        runRequestHandler(handleApproveLinuxDoOAuth, { authorizationUrl }),
      ).resolves.toEqual({ success: false, reason: "unexpected_page" })
    },
  )

  it("times out when authorization stays ambiguous", async () => {
    vi.useFakeTimers()
    const authorizationUrl =
      "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=client&state=signed"
    vi.stubGlobal("location", new URL(authorizationUrl))
    document.body.innerHTML =
      '<button>Allow</button><input type="submit" value="Allow">'
    const clicks = Array.from(
      document.querySelectorAll<HTMLElement>("button,input"),
    ).map((control) => vi.spyOn(control, "click"))
    const result = runRequestHandler(handleApproveLinuxDoOAuth, {
      authorizationUrl,
    })
    await vi.advanceTimersByTimeAsync(12_000)
    await expect(result).resolves.toEqual({
      success: false,
      reason: "authorization_control_unavailable",
    })
    for (const click of clicks) expect(click).not.toHaveBeenCalled()
  })

  it("recognizes an authorization label updated in an existing text node", async () => {
    const authorizationUrl =
      "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=client&state=signed"
    vi.stubGlobal("location", new URL(authorizationUrl))
    const button = document.createElement("button")
    const label = document.createTextNode("Loading")
    button.append(label)
    document.body.append(button)
    const click = vi.spyOn(button, "click")
    const result = runRequestHandler(handleApproveLinuxDoOAuth, {
      authorizationUrl,
    })
    label.data = "Allow"
    await expect(result).resolves.toEqual({ success: true })
    expect(click).toHaveBeenCalledOnce()
  })

  it("stops an unavailable selected GitHub login instead of switching to Linux DO", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          system_name: "Agent Router",
          github_oauth: false,
          linuxdo_oauth: true,
          linuxdo_client_id: "linuxdo-client",
        },
      }),
    )
    await expect(
      runRequestHandler(handlePrepareAgentRouterOAuth, {
        loginProvider: "github",
      }),
    ).resolves.toMatchObject({
      success: false,
      message: "AgentRouter GitHub login is unavailable.",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith("/api/status", expect.any(Object))
  })

  it("accepts system_name variations matching Agent Router pattern", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            system_name: "AgentRouter",
            github_oauth: true,
            github_client_id: "client",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: "signed-state" }),
      )
    await expect(
      runRequestHandler(handlePrepareAgentRouterOAuth, {
        loginProvider: "github",
      }),
    ).resolves.toEqual({
      success: true,
      clientId: "client",
      state: "signed-state",
    })
  })

  it("rejects prepare when system_name does not match Agent Router pattern", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          system_name: "New API",
          github_oauth: true,
          github_client_id: "client",
        },
      }),
    )
    await expect(
      runRequestHandler(handlePrepareAgentRouterOAuth, {
        loginProvider: "github",
      }),
    ).resolves.toMatchObject({
      success: false,
      reason: "request_failed",
    })
  })
})
