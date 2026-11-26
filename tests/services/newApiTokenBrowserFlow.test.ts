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

it.each([false, true])("owned OAuth callback (%s)", async (cancelled) => {
  const { verifyNewApiTokenOAuth } =
    await import("~/services/apiService/newApiFamily/accessTokens/oauthBrowser")
  const origin = "https://oauth-token.example"
  let exchanged = false
  let marker: { requestId: string } | undefined
  let listener:
    | ((
        message: unknown,
        sender: browser.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
      ) => unknown)
    | undefined
  vi.spyOn(browser.tabs, "get").mockResolvedValue({
    id: 9,
    url: `${origin}/`,
    windowId: 2,
  } as browser.tabs.Tab)
  vi.spyOn(browser.tabs, "create").mockResolvedValue({
    id: 10,
    url: `${origin}/`,
    status: "loading",
  } as browser.tabs.Tab)
  vi.spyOn(browser.tabs, "remove").mockResolvedValue()
  vi.spyOn(browser.scripting, "executeScript").mockImplementation(
    async (details) => {
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
      queueMicrotask(() => {
        listener?.(
          {
            action: "newApiTokenOAuthCallback",
            requestId: marker!.requestId,
            ...(cancelled
              ? { error: "OAUTH_CANCELLED" }
              : { callback: { state: "flow-state", code: "one-use-code" } }),
          },
          {
            tab: { id: 10 },
            frameId: 0,
            url: `${origin}/oauth/github`,
          } as browser.runtime.MessageSender,
          () => undefined,
        )
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
          flow_token: "flow-state",
          expires_at: Date.now() / 1000 + 300,
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
      directRequestReason: "provider_protocol",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "original-session",
      },
    },
  )
  if (cancelled) await expect(result).rejects.toThrow("OAUTH_CANCELLED")
  else await expect(result).resolves.toMatchObject({ method: "oauth" })
  expect(exchanged).toBe(!cancelled)
  expect(browser.tabs.remove).toHaveBeenCalledWith(10)
})

it.each([false, true])("owning tab Passkey prompt (%s)", async (dismissed) => {
  const origin = "https://passkey.example"
  let finished = false
  vi.spyOn(browser.tabs, "get").mockResolvedValue({
    id: 9,
    url: `${origin}/`,
    windowId: 2,
  } as browser.tabs.Tab)
  vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue({
    success: true,
    data: dismissed
      ? null
      : { id: "credential", response: { signature: "signed" } },
  })
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
        })
        return HttpResponse.json({
          success: true,
          data: {
            flow_token: "challenge-flow",
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
  const result = interaction.verify({ method: METHODS.PASSKEY }, operation, {
    baseUrl: origin,
    directRequestReason: "provider_protocol",
    auth: { authType: AuthTypeEnum.AccessToken, accessToken: "session" },
  })
  if (dismissed) await expect(result).rejects.toThrow("PASSKEY_CANCELLED")
  else await expect(result).resolves.toMatchObject({ method: "passkey" })
  expect(finished).toBe(!dismissed)
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
})
