import { http, HttpResponse } from "msw"
import { expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { createNewApiTokenInteraction } from "~/services/apiService/newApiFamily/accessTokens/browser"
import * as client from "~/services/apiService/newApiFamily/accessTokens/client"
import {
  NEW_API_TOKEN_ACCESS_SCOPES as ACCESS_SCOPES,
  NEW_API_TOKEN_VERIFICATION_METHODS as METHODS,
  NEW_API_TOKEN_OPERATION_SCOPES as OPERATION_SCOPES,
} from "~/services/apiService/newApiFamily/accessTokens/protocol"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { createDeferred } from "~~/tests/test-utils/deferred"

const tokenSite = "https://session-token.example"

function mockOwningSiteTab() {
  const tokenTab = {
    id: 9,
    url: `${tokenSite}/profile`,
    incognito: false,
    windowId: 2,
    status: "complete",
  } as browser.tabs.Tab
  vi.spyOn(browser.tabs, "getCurrent").mockResolvedValue(tokenTab)
  vi.spyOn(browser.tabs, "query").mockResolvedValue([tokenTab])
  vi.spyOn(browser.tabs, "get").mockResolvedValue(tokenTab)
  vi.spyOn(browser.runtime, "getManifest").mockReturnValue({
    content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"] }],
  } as browser._manifest.WebExtensionManifest)
  return tokenTab
}

it.each(["ready", "exhausted", "injection-failed"] as const)(
  "handles a missing website receiver when reinjection is %s",
  async (outcome) => {
    mockOwningSiteTab()
    const missing = new Error(
      "Could not establish connection. Receiving end does not exist.",
    )
    const inject = vi
      .spyOn(browser.scripting, "executeScript")
      .mockResolvedValue(
        outcome === "injection-failed" ? [] : [{ result: true, frameId: 0 }],
      )
    let preparations = 0
    vi.spyOn(browser.tabs, "sendMessage").mockImplementation(
      async (_tabId, message) => {
        if (
          message.action !== RuntimeActionIds.ContentPrepareNewApiTokenSession
        )
          throw missing
        preparations++
        if (preparations < 3 || outcome !== "ready") throw missing
        return {
          success: true,
          data: {
            token: "session",
            sessionId: "sid",
            expiresAt: Date.now() / 1000 + 900,
            user: { id: 42 },
          },
        }
      },
    )
    const open = client.openNewApiAccessTokenCreation(tokenSite, "42")
    if (outcome === "ready") {
      const session = await open
      session.cancel()
    } else {
      await expect(open).rejects.toMatchObject({
        code: "TAB_RELOAD_REQUIRED",
        tabId: 9,
      })
    }
    expect(inject).toHaveBeenCalledOnce()
    expect(preparations).toBe(outcome === "injection-failed" ? 0 : 3)
  },
)

it("reinjects when a stale content listener closes the session probe without a reply", async () => {
  mockOwningSiteTab()
  const inject = vi
    .spyOn(browser.scripting, "executeScript")
    .mockResolvedValue([])
  vi.spyOn(browser.tabs, "sendMessage").mockRejectedValueOnce(
    new Error("The message port closed before a response was received."),
  )
  await expect(
    client.openNewApiAccessTokenCreation(tokenSite, "42"),
  ).rejects.toMatchObject({
    code: "TAB_RELOAD_REQUIRED",
    tabId: 9,
  })
  expect(inject).toHaveBeenCalledOnce()
})

it.each(["probe", "prepare"] as const)(
  "preserves a non-receiver failure during the session %s",
  async (stage) => {
    mockOwningSiteTab()
    const denied = new Error("Missing host permission")
    const send = vi.spyOn(browser.tabs, "sendMessage")
    if (stage === "prepare") send.mockResolvedValueOnce({ success: true })
    send.mockRejectedValueOnce(denied)
    const inject = vi.spyOn(browser.scripting, "executeScript")
    await expect(
      client.openNewApiAccessTokenCreation(tokenSite, "42"),
    ).rejects.toBe(denied)
    expect(inject).not.toHaveBeenCalled()
  },
)

it("needs an account identity before opening the site session", async () => {
  const open = vi.spyOn(browser.tabs, "create")
  const send = vi.spyOn(browser.tabs, "sendMessage")
  await expect(
    client.openNewApiAccessTokenCreation(tokenSite, ""),
  ).rejects.toThrow("INVALID_TOKEN_CONTEXT")
  expect(open).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
})

it("opens a session only after a newly created tab commits the requested origin", async () => {
  const tab = mockOwningSiteTab()
  vi.mocked(browser.tabs.query).mockResolvedValue([])
  const open = vi.spyOn(browser.tabs, "create").mockResolvedValue(tab)
  const send = vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue({
    success: true,
    passed: true,
    data: {
      token: "session",
      sessionId: "sid",
      expiresAt: Date.now() / 1000 + 900,
      user: { id: 42 },
    },
  })
  const session = await client.openNewApiAccessTokenCreation(tokenSite, "42")
  expect(open).toHaveBeenCalledExactlyOnceWith({
    url: tokenSite,
    active: true,
    windowId: tab.windowId,
  })
  expect(send).toHaveBeenLastCalledWith(
    tab.id,
    {
      action: RuntimeActionIds.ContentPrepareNewApiTokenSession,
      expectedOrigin: tokenSite,
      expectedIdentity: "42",
    },
    { frameId: 0 },
  )
  expect(send).toHaveBeenCalledWith(
    tab.id,
    expect.objectContaining({ action: RuntimeActionIds.ContentCheckCapGuard }),
  )
  session.cancel()
})

it("reads token creation capabilities with the session header inside the owning tab", async () => {
  const tab = mockOwningSiteTab()
  const reads: string[] = []
  vi.spyOn(browser.tabs, "sendMessage").mockImplementation(
    async (tabId, message) => {
      if (message.action !== RuntimeActionIds.ContentPerformTempWindowFetch)
        return {
          success: true,
          data: {
            token: "transient",
            sessionId: "sid",
            expiresAt: Date.now() / 1000 + 900,
            user: { id: 42 },
          },
        }
      expect(tabId).toBe(tab.id)
      expect(
        new Headers(message.fetchOptions.headers).get("X-Auth-Session"),
      ).toBe("sid")
      const path = new URL(message.fetchUrl).pathname
      reads.push(path)
      const data =
        path === "/api/user/self"
          ? { id: 42 }
          : path.includes("catalog")
            ? {
                creation_uncertain: false,
                default_expiry_days: 7,
                max_tokens: 1,
                groups: [],
              }
            : {
                scope: OPERATION_SCOPES.GENERATE,
                methods: [],
                oauth_providers: [],
                password_encryption_enabled: false,
              }
      return { success: true, status: 200, data: { success: true, data } }
    },
  )
  const session = await client.openNewApiAccessTokenCreation(tokenSite, "42")
  try {
    expect((await session.flow.load()).catalog.max_tokens).toBe(1)
    expect(reads).toHaveLength(3)
  } finally {
    session.cancel()
  }
})

it("focuses the verified existing site tab when asked to restore the session", async () => {
  const tab = mockOwningSiteTab()
  const focus = vi.spyOn(browser.tabs, "update").mockResolvedValue(tab)
  await client.focusNewApiTokenTab(tokenSite, tab.id)
  expect(focus).toHaveBeenCalledExactlyOnceWith(tab.id, { active: true })
})

it.each([
  "ACCOUNT_IDENTITY_MISMATCH",
  "SCOPED_TOKEN_UNSUPPORTED",
  "AUTH_SESSION_UNAVAILABLE",
])("preserves the site tab's %s response", async (code) => {
  mockOwningSiteTab()
  vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue({
    success: false,
    code,
  })
  await expect(
    client.openNewApiAccessTokenCreation(tokenSite, "42"),
  ).rejects.toMatchObject({ code, tabId: 9 })
})

it.each([
  ["no reply", undefined, "AUTH_SESSION_UNAVAILABLE"],
  [
    "expired bundle",
    { token: "session", expiresAt: 1 },
    "AUTH_SESSION_UNAVAILABLE",
  ],
  ["non-finite deadline", { expiresAt: NaN }, "AUTH_SESSION_UNAVAILABLE"],
  ["missing session ID", { sessionId: "" }, "AUTH_SESSION_UNAVAILABLE"],
  ["missing account ID", { user: {} }, "AUTH_SESSION_UNAVAILABLE"],
  ["another account", { user: { id: 11 } }, "ACCOUNT_IDENTITY_MISMATCH"],
] as const)(
  "rejects a content session with %s",
  async (_case, change, code) => {
    mockOwningSiteTab()
    vi.spyOn(browser.tabs, "sendMessage")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        change
          ? {
              success: true,
              data: {
                token: "session",
                expiresAt: Date.now() / 1000 + 1000,
                sessionId: "sid",
                user: { id: 42 },
                ...change,
              },
            }
          : undefined,
      )
    await expect(
      client.openNewApiAccessTokenCreation(tokenSite, "42"),
    ).rejects.toMatchObject({ code, tabId: 9 })
  },
)

it.each([true, false])(
  "reloads the preferred tab only while it still belongs to the site (%s)",
  async (preferredMatches) => {
    const siteTab = mockOwningSiteTab()
    const preferred = {
      ...siteTab,
      id: 10,
      url: preferredMatches ? tokenSite : "https://other.example",
    }
    vi.mocked(browser.tabs.query).mockResolvedValue(
      preferredMatches ? [siteTab, preferred] : [siteTab],
    )
    vi.mocked(browser.tabs.get).mockImplementation(async (id) =>
      id === 10 ? preferred : siteTab,
    )
    const reload = vi.spyOn(browser.tabs, "reload").mockResolvedValue()
    const watch = vi.spyOn(browser.tabs.onUpdated, "addListener")
    const { promise, resolve } = createDeferred<void>()
    const adapter =
      await import("~/services/browsingContext/tempPage/browserAdapter")
    const wait = vi
      .spyOn(adapter, "waitForTabComplete")
      .mockReturnValueOnce(promise)
    let settled = false
    const target = preferredMatches ? 10 : 9
    const reloading = client
      .reloadNewApiTokenTab(tokenSite, 10)
      .then((tabId) => {
        settled = true
        return tabId
      })
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(reload).toHaveBeenCalledExactlyOnceWith(target)
    expect(settled).toBe(false)
    expect(wait).not.toHaveBeenCalled()
    watch.mock.lastCall![0](
      target,
      { status: "loading" },
      preferredMatches ? preferred : siteTab,
    )
    await vi.waitFor(() =>
      expect(wait).toHaveBeenCalledWith(target, { origin: tokenSite }),
    )
    resolve()
    await expect(reloading).resolves.toBe(target)
  },
)

it.each([false, true])(
  "adopts only the owning partition session (sidepanel=%s)",
  async (sidepanel) => {
    const { openNewApiAccessTokenCreation } =
      await import("~/services/apiService/newApiFamily/accessTokens/client")
    const origin = "https://session-token.example"
    vi.spyOn(browser.tabs, "getCurrent").mockResolvedValue(
      sidepanel
        ? undefined
        : ({
            windowId: 2,
            incognito: false,
          } as browser.tabs.Tab),
    )
    vi.spyOn(browser.tabs, "query").mockImplementation(async (query) =>
      query.currentWindow
        ? [
            {
              id: 8,
              windowId: 2,
              incognito: true,
              cookieStoreId: "firefox-private",
            } as browser.tabs.Tab,
          ]
        : [
            {
              id: 10,
              windowId: 1,
              url: origin,
              incognito: false,
            } as browser.tabs.Tab,
            {
              id: 9,
              windowId: 2,
              url: origin,
              incognito: sidepanel,
              ...(sidepanel ? { cookieStoreId: "firefox-private" } : {}),
            } as browser.tabs.Tab,
          ],
    )
    vi.spyOn(browser.tabs, "get").mockResolvedValue({
      id: 9,
      windowId: 2,
      url: origin,
    } as browser.tabs.Tab)
    vi.spyOn(browser.runtime, "getManifest").mockReturnValue({
      content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"] }],
    } as browser._manifest.WebExtensionManifest)
    vi.spyOn(browser.scripting, "executeScript").mockResolvedValue([
      { result: true, frameId: 0 },
    ])
    vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue({
      success: true,
      data: {
        token: "transient",
        sessionId: "session",
        expiresAt: Date.now() / 1000 + 900,
        user: { id: 42 },
      },
    })
    const session = await openNewApiAccessTokenCreation(origin, "42")
    expect(session.flow).toBeDefined()
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        expectedOrigin: origin,
        expectedIdentity: "42",
      }),
      { frameId: 0 },
    )
    session.cancel()
  },
)

it.each([
  "success",
  "marker-retry",
  "cancelled",
  "expired",
  "invalid",
  "state-expired",
  "state-without-token",
  "no-tab",
  "closed-tab",
  "navigation-failed",
  "aborted",
  "response-timeout",
] as const)("owned OAuth callback (%s)", async (outcome) => {
  const { verifyNewApiTokenOAuth } =
    await import("~/services/apiService/newApiFamily/accessTokens/oauthBrowser")
  const origin = "https://oauth-token.example"
  let exchanged = false
  const acknowledge = vi.fn()
  let marker: { requestId: string } | undefined
  let installs = 0
  let listener:
    | ((
        message: unknown,
        sender: browser.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
      ) => unknown)
    | undefined
  const sourceTab = {
    id: 9,
    url: `${origin}/`,
    windowId: 2,
  } as browser.tabs.Tab
  const getTab = vi.spyOn(browser.tabs, "get").mockResolvedValue(sourceTab)
  const now = Date.now()
  if (outcome === "response-timeout")
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  if (outcome === "expired") {
    getTab.mockResolvedValueOnce(sourceTab).mockImplementationOnce(async () => {
      vi.spyOn(Date, "now").mockReturnValue(now + 301_000)
      return sourceTab
    })
  }
  const owned = {
    id: 10,
    url: `${origin}/`,
    status: "loading",
  } as browser.tabs.Tab
  vi.spyOn(browser.tabs, "create").mockResolvedValue(
    outcome === "no-tab" ? ({} as browser.tabs.Tab) : owned,
  )
  vi.spyOn(browser.tabs, "remove").mockResolvedValue()
  const abort = new AbortController()
  const navigated = createDeferred<void>()
  let tabRemoved:
    ((id: number, info: browser.tabs._OnRemovedRemoveInfo) => void) | undefined
  vi.spyOn(browser.tabs.onRemoved, "addListener").mockImplementation(
    (callback) => {
      tabRemoved = callback
    },
  )
  vi.spyOn(browser.scripting, "executeScript").mockImplementation(
    async (details) => {
      if (outcome === "marker-retry" && ++installs === 1)
        throw new Error("Document starting")
      marker = (details as unknown as { args: [string, { requestId: string }] })
        .args[1]
      return [{ result: true, frameId: 0 }]
    },
  )
  vi.spyOn(browser.runtime.onMessage, "addListener").mockImplementation(
    (callback) => {
      listener = callback
    },
  )
  vi.spyOn(browser.tabs, "update").mockImplementation(async (id, change) => {
    if (id === 10 && change.url?.startsWith("https://github.com")) {
      if (outcome === "navigation-failed")
        throw new Error("The verification tab became unavailable")
      navigated.resolve()
      queueMicrotask(() => {
        if (outcome === "response-timeout") return
        if (outcome === "closed-tab") {
          tabRemoved?.(10, { windowId: 2, isWindowClosing: false })
          return
        }
        if (outcome === "aborted") {
          abort.abort()
          return
        }
        const message = {
          action: "newApiTokenOAuthCallback",
          requestId: marker!.requestId,
          ...(outcome === "cancelled"
            ? { error: "OAUTH_CANCELLED" }
            : {
                callback: {
                  state: "flow-state",
                  code: outcome === "invalid" ? "" : "one-use-code",
                },
              }),
        }
        const sender = {
          tab: { id: 10 },
          frameId: 0,
          url: `${origin}/oauth/github`,
        } as browser.runtime.MessageSender
        listener?.(
          { ...message, requestId: "unrelated-operation" },
          sender,
          acknowledge,
        )
        listener?.(message, { ...sender, frameId: 1 }, acknowledge)
        listener?.(
          message,
          { ...sender, url: `${origin}/oauth/other` },
          acknowledge,
        )
        listener?.(message, sender, acknowledge)
      })
    }
    return { id, url: change.url } as browser.tabs.Tab
  })
  server.use(
    http.get(`${origin}/api/status`, () =>
      HttpResponse.json({
        success: true,
        data: { github_oauth: true, github_client_id: "client" },
      }),
    ),
    http.post(`${origin}/api/oauth/state`, async ({ request }) => {
      expect(await request.json()).toMatchObject({
        provider: "github",
        intent: "verify",
        scope: "access_token.generate",
      })
      return HttpResponse.json({
        success: true,
        data: {
          flow_token: outcome === "state-without-token" ? "" : "flow-state",
          expires_at: outcome === "state-expired" ? 1 : now / 1000 + 300,
        },
      })
    }),
    http.get(`${origin}/api/oauth/github`, ({ request }) => {
      exchanged = true
      expect(request.headers.get("Authorization")).toBe(
        "Bearer original-session",
      )
      expect(new URL(request.url).searchParams.get("code")).toBe("one-use-code")
      return HttpResponse.json({
        success: true,
        data: {
          proof_token: "proof",
          scope: "access_token.generate",
          method: "oauth",
          expires_at: Date.now() / 1000 + 300,
        },
      })
    }),
  )
  const result = verifyNewApiTokenOAuth(
    9,
    origin,
    "github",
    {
      scope: "access_token.generate",
      context: { scopes: ["profile:read"], expires_at: 0 },
    },
    {
      baseUrl: origin,
      abortSignal: abort.signal,
      directRequestReason: "provider_protocol",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "original-session",
      },
    },
  )
  const succeeds = outcome === "success" || outcome === "marker-retry"
  try {
    if (succeeds)
      await expect(result).resolves.toMatchObject({ method: "oauth" })
    else {
      const rejection = expect(result).rejects.toThrow(
        {
          expired: "OAUTH_TIMEOUT",
          cancelled: "OAUTH_CANCELLED",
          invalid: "OAUTH_CALLBACK_INVALID",
          "state-expired": "OAUTH_STATE_INVALID",
          "state-without-token": "OAUTH_STATE_INVALID",
          "no-tab": "OAUTH_TAB_UNAVAILABLE",
          "closed-tab": "OAUTH_CANCELLED",
          "navigation-failed": "OAUTH_NAVIGATION_FAILED",
          aborted: "OAUTH_CANCELLED",
          "response-timeout": "OAUTH_TIMEOUT",
        }[outcome],
      )
      if (outcome === "response-timeout") {
        await navigated.promise
        await vi.advanceTimersByTimeAsync(300_000)
      }
      await rejection
    }
  } finally {
    if (outcome === "expired") vi.mocked(Date.now).mockRestore()
    if (outcome === "response-timeout") vi.useRealTimers()
  }
  if (succeeds || ["cancelled", "expired", "invalid"].includes(outcome))
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith(true)
  else expect(acknowledge).not.toHaveBeenCalled()
  expect(exchanged).toBe(succeeds)
  if (["no-tab", "state-expired", "state-without-token"].includes(outcome))
    expect(browser.tabs.remove).not.toHaveBeenCalled()
  else expect(browser.tabs.remove).toHaveBeenCalledWith(10)
})

it.each([
  "verified",
  "dismissed",
  "invalid-challenge",
  "missing-response",
  "navigated",
] as const)("owning tab Passkey prompt (%s)", async (outcome) => {
  const origin = "https://passkey.example"
  let finished = false
  const tab = {
    id: 9,
    url: `${origin}/`,
    windowId: 2,
  } as browser.tabs.Tab
  const getTab = vi.spyOn(browser.tabs, "get").mockResolvedValue(tab)
  if (outcome === "navigated")
    getTab
      .mockResolvedValueOnce(tab)
      .mockResolvedValueOnce(tab)
      .mockResolvedValueOnce({ ...tab, url: "https://unrelated.example" })
  const send = vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue({
    success: true,
    data:
      outcome === "dismissed"
        ? null
        : { id: "credential", response: { signature: "signed" } },
  })
  if (outcome === "missing-response") send.mockResolvedValueOnce(undefined)
  vi.spyOn(browser.tabs, "update").mockResolvedValue({} as browser.tabs.Tab)
  vi.spyOn(browser.windows, "update").mockResolvedValue(
    {} as browser.windows.Window,
  )
  const operation = {
    scope: OPERATION_SCOPES.GENERATE,
    context: { scopes: [ACCESS_SCOPES.PROFILE_READ], expires_at: 0 },
  }
  server.use(
    http.post(
      `${origin}/api/user/passkey/verify/begin`,
      async ({ request }) => {
        expect(await request.json()).toEqual({
          scope: "access_token.generate",
          context: { scopes: ["profile:read"], expires_at: 0 },
          ...(outcome === "verified" ? { rp_id: "passkey.example" } : {}),
        })
        return HttpResponse.json({
          success: true,
          data: {
            flow_token: outcome === "invalid-challenge" ? "" : "challenge-flow",
            options: {
              publicKey: { challenge: "challenge", rpId: "passkey.example" },
            },
          },
        })
      },
    ),
    http.post(
      `${origin}/api/user/passkey/verify/finish`,
      async ({ request }) => {
        finished = true
        expect(await request.json()).toEqual({
          flow_token: "challenge-flow",
          credential: { id: "credential", response: { signature: "signed" } },
        })
        return HttpResponse.json({
          success: true,
          data: {
            proof_token: "proof",
            scope: operation.scope,
            method: "passkey",
            expires_at: Date.now() / 1000 + 300,
          },
        })
      },
    ),
  )
  const interaction = createNewApiTokenInteraction(9, origin)
  const result = interaction.verify(
    {
      method: METHODS.PASSKEY,
      ...(outcome === "verified" ? { rpId: "passkey.example" } : {}),
    },
    operation,
    {
      baseUrl: origin,
      directRequestReason: "provider_protocol",
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: "session" },
    },
  )
  if (outcome === "verified")
    await expect(result).resolves.toMatchObject({ method: "passkey" })
  else
    await expect(result).rejects.toThrow(
      {
        dismissed: "PASSKEY_CANCELLED",
        "invalid-challenge": "PASSKEY_CHALLENGE_INVALID",
        "missing-response": "PASSKEY_VERIFICATION_FAILED",
        navigated: "SITE_TAB_ORIGIN_CHANGED",
      }[outcome],
    )
  expect(finished).toBe(outcome === "verified")
  if (outcome === "invalid-challenge") {
    expect(send).not.toHaveBeenCalled()
    return
  }
  expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
    9,
    expect.objectContaining({
      expectedOrigin: origin,
      options: {
        publicKey: { challenge: "challenge", rpId: "passkey.example" },
      },
    }),
    { frameId: 0 },
  )
  expect(send).toHaveBeenLastCalledWith(
    9,
    expect.objectContaining({
      action: RuntimeActionIds.ContentCancelNewApiTokenPasskey,
      expectedOrigin: origin,
    }),
    { frameId: 0 },
  )
})
