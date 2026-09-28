import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import type { AddressInfo } from "node:net"
import type { BrowserContext, Page } from "@playwright/test"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

const requestId = "internal-sub2api-oauth"
const pendingPath = "/api/v1/auth/oauth/pending/exchange"
const htmlType = "text/html; charset=utf-8"
const loginHtml =
  "<html><head><title>Sub2API OAuth fixture</title></head><body>Login</body></html>"

// The website consumes legacy fragments or the pending-cookie exchange, persists
// its own tokens, loads /me and redirects. Extension messages contain no tokens.
const callbackHtml = [
  "<html><head><title>Sub2API callback fixture</title></head><body><script>",
  "(async () => {",
  "  const query = new URLSearchParams(location.search);",
  "  if (query.has('code')) {",
  "    const provider = sessionStorage.getItem('email_oauth_pending_provider');",
  "    if (provider !== 'google') throw new Error('Missing frontend provider hint');",
  "    location.replace('/api/v1/auth/oauth/' + provider + '/callback' + location.search);",
  "    return;",
  "  }",
  "  const fragment = new URLSearchParams(location.hash.slice(1));",
  "  const tokens = fragment.has('access_token')",
  "    ? Object.fromEntries(fragment)",
  "    : (await (await fetch('/api/v1/auth/oauth/pending/exchange', {",
  "        method: 'POST', credentials: 'include',",
  "        headers: {'Content-Type': 'application/json'}, body: '{}'",
  "      })).json()).data;",
  "  localStorage.setItem('auth_token', tokens.access_token);",
  "  localStorage.setItem('refresh_token', tokens.refresh_token);",
  "  localStorage.setItem('token_expires_at', String(Date.now() + Number(tokens.expires_in) * 1000));",
  "  const me = await (await fetch('/api/v1/auth/me', {",
  "    headers: {Authorization: 'Bearer ' + tokens.access_token}",
  "  })).json();",
  "  localStorage.setItem('auth_user', JSON.stringify(me.data));",
  "  localStorage.removeItem('pending_auth_session');",
  "  sessionStorage.removeItem('email_oauth_pending_provider');",
  "  history.replaceState(null, '', tokens.redirect);",
  "  document.body.textContent = 'Signed in';",
  "})()",
  "</script></body></html>",
].join("\n")

type FixtureRequest = {
  method: string | undefined
  url: URL
  headers: IncomingHttpHeaders
  body: string
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })
  return (server.address() as AddressInfo).port
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
    server.closeAllConnections()
  })
}

function json(response: ServerResponse, data: unknown) {
  response.writeHead(200, { "Content-Type": "application/json" })
  response.end(JSON.stringify({ code: 0, message: "success", data }))
}

/**
 * Real loopback servers exercise every redirect hop, which route.fulfill(302)
 * cannot fully intercept. Different hostnames also exercise SameSite=Lax cookies.
 */
async function oauthFixture(options: {
  modern: boolean
  matching: boolean
  blockedBy?: "captcha" | "truncated-logout"
}) {
  const provider = options.modern ? "google" : "linuxdo"
  const callbackPath = options.modern
    ? "/auth/oauth/callback"
    : "/auth/linuxdo/callback"
  const backendCallback = "/api/v1/auth/oauth/" + provider + "/callback"
  const stateCookie = options.modern
    ? "email_oauth_state"
    : "linuxdo_oauth_state"
  const requests: FixtureRequest[] = []
  const errors: string[] = []
  let origin = ""
  let redirect = ""
  let meCalls = 0

  const idpServer = createServer((_request, response) => {
    const callback = new URL(
      options.modern ? callbackPath : backendCallback,
      origin,
    )
    callback.searchParams.set("code", "provider-code")
    callback.searchParams.set("state", "backend-signed-state")
    response.writeHead(200, { "Content-Type": htmlType })
    response.end(
      '<html><body><a href="' +
        callback.href.replaceAll("&", "&amp;") +
        '">Authorize</a></body></html>',
    )
  })
  const idpOrigin = "http://localhost:" + (await listen(idpServer))

  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    const url = new URL(request.url ?? "/", origin)
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    requests.push({
      method: request.method,
      url,
      headers: request.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    })
    response.setHeader("Cache-Control", "no-store")
    if (url.pathname === "/api/v1/settings/public") {
      return json(response, {
        [provider + "_oauth_enabled"]: true,
        tencent_captcha_enabled: options.blockedBy === "captcha",
      })
    }
    if (url.pathname === "/api/v1/auth/logout") {
      if (options.blockedBy === "truncated-logout") {
        // A bare socket reset can trigger Chromium's stale-connection retry.
        // Truncation after response headers models an already-executed logout
        // whose result is lost, and tests the extension's no-replay boundary.
        response.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Length": "128",
          Connection: "close",
        })
        response.end('{"code":0,')
        return
      }
      response.setHeader(
        "Set-Cookie",
        "oauth_pending_session=; Path=/api/v1/auth; Max-Age=0; HttpOnly; SameSite=Lax",
      )
      return json(response, {})
    }
    if (url.pathname === "/api/v1/auth/oauth/" + provider + "/start") {
      redirect = url.searchParams.get("redirect")!
      const authorize = new URL("/authorize", idpOrigin)
      authorize.searchParams.set("client_id", "backend-configured-client")
      authorize.searchParams.set("state", "backend-signed-state")
      response.writeHead(302, {
        Location: authorize.href,
        "Set-Cookie":
          stateCookie +
          "=backend-signed-state; Path=/api/v1/auth/oauth; HttpOnly; SameSite=Lax",
      })
      response.end()
      return
    }
    if (url.pathname === backendCallback) {
      if (
        url.searchParams.get("state") !== "backend-signed-state" ||
        !request.headers.cookie?.includes(stateCookie + "=backend-signed-state")
      ) {
        response.writeHead(400)
        response.end("Missing state cookie")
        return
      }
      const callback = new URL(callbackPath, origin)
      if (!options.modern) {
        callback.hash = new URLSearchParams({
          access_token: "browser-access",
          refresh_token: "browser-refresh",
          expires_in: "300",
          redirect,
        }).toString()
      }
      response.writeHead(302, {
        Location: callback.href,
        "Set-Cookie":
          "oauth_pending_session=callback-pending; Path=/api/v1/auth; HttpOnly; SameSite=Lax",
      })
      response.end()
      return
    }
    if (url.pathname === pendingPath) {
      return json(response, {
        access_token: "browser-access",
        refresh_token: "browser-refresh",
        expires_in: 300,
        redirect,
      })
    }
    if (url.pathname === "/api/v1/auth/me") {
      meCalls += 1
      return json(response, { id: meCalls === 1 || options.matching ? 17 : 18 })
    }
    response.writeHead(200, { "Content-Type": htmlType })
    response.end(url.pathname === callbackPath ? callbackHtml : loginHtml)
  }
  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      errors.push(String(error))
      response.destroy()
    })
  })
  try {
    origin = "http://127.0.0.1:" + (await listen(server))
  } catch (error) {
    await closeServer(idpServer)
    throw error
  }
  return {
    origin,
    idpOrigin,
    provider,
    requests,
    errors,
    close: () => Promise.all([closeServer(server), closeServer(idpServer)]),
  }
}

async function contentActions(context: BrowserContext, page: Page) {
  const worker = await getServiceWorker(context)
  const tabId = await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url })
    if (typeof tab?.id !== "number") throw new Error("OAuth tab missing")
    return tab.id
  }, page.url())
  const send = (action: string, details: Record<string, unknown> = {}) =>
    worker.evaluate(
      async ({ tabId, action, details }) =>
        chrome.tabs.sendMessage(tabId, { ...details, action }),
      { tabId, action, details },
    )
  const ready = async () => {
    await expect
      .poll(async () => {
        try {
          await send(RuntimeActionIds.ContentGetRenderedTitle)
          return true
        } catch {
          return false
        }
      })
      .toBe(true)
  }
  await ready()
  return { send, ready }
}

for (const modern of [true, false]) {
  for (const matching of [true, false]) {
    test(
      "Sub2API " +
        (modern ? "pending-cookie" : "fragment") +
        " OAuth " +
        (matching ? "verifies" : "rejects") +
        " callback identity",
      async ({ context }) => {
        const fixture = await oauthFixture({ modern, matching })
        const { origin, provider, requests } = fixture
        try {
          await context.addCookies([
            {
              name: "oauth_pending_session",
              value: "stale-pending",
              domain: "127.0.0.1",
              path: "/api/v1/auth",
              httpOnly: true,
              sameSite: "Lax",
            },
          ])
          const page = await context.newPage()
          await page.goto(origin + "/login")
          await page.evaluate(() => {
            localStorage.setItem("auth_token", "old-website-access")
            localStorage.setItem("refresh_token", "old-website-refresh")
            localStorage.setItem("auth_user", '{"id":17}')
          })
          const actions = await contentActions(context, page)
          const request = { origin, requestId, loginProvider: provider }
          const prepared = await actions.send(
            RuntimeActionIds.ContentPrepareSub2ApiOAuth,
            request,
          )
          expect(prepared.success).toBe(true)
          expect(JSON.stringify(prepared)).not.toContain("old-website")
          expect(
            await page.evaluate(() => localStorage.getItem("auth_token")),
          ).toBeNull()
          await page.goto(prepared.authorizationUrl)
          await expect(page).toHaveURL(
            (url) =>
              url.origin === fixture.idpOrigin && url.pathname === "/authorize",
          )
          await page
            .getByRole("link", { name: "Authorize", exact: true })
            .click()
          await page.waitForURL(
            origin + "/dashboard?all_api_hub_login=" + requestId,
          )
          await actions.ready()
          const completed = await actions.send(
            RuntimeActionIds.ContentCompleteSub2ApiOAuth,
            request,
          )
          expect(completed).toEqual(
            matching
              ? { success: true, identity: "17" }
              : { success: false, reason: "identity_mismatch" },
          )
          expect(JSON.stringify(completed)).not.toContain("browser-access")
          expect(JSON.stringify(completed)).not.toContain("browser-refresh")

          const logouts = requests.filter(
            ({ url }) => url.pathname === "/api/v1/auth/logout",
          )
          expect(logouts).toHaveLength(1)
          const logout = logouts[0]!
          expect(logout.method).toBe("POST")
          expect(JSON.parse(logout.body)).toEqual({
            refresh_token: "old-website-refresh",
          })
          expect(logout.headers.authorization).toBeUndefined()
          expect(logout.headers.cookie).toContain(
            "oauth_pending_session=stale-pending",
          )
          const starts = requests.filter(({ url }) =>
            url.pathname.endsWith("/start"),
          )
          expect(starts).toHaveLength(1)
          const start = starts[0]!
          expect(start.method).toBe("GET")
          expect(start.url.searchParams.get("intent")).toBe("login")
          expect(start.headers.cookie ?? "").not.toContain("stale-pending")
          const exchanges = requests.filter(
            ({ url }) => url.pathname === pendingPath,
          )
          expect(exchanges).toHaveLength(modern ? 1 : 0)
          if (modern) {
            const exchange = exchanges[0]!
            expect(exchange.method).toBe("POST")
            expect(JSON.parse(exchange.body)).toEqual({})
            expect(exchange.headers.cookie).toContain(
              "oauth_pending_session=callback-pending",
            )
          }
          const identityReads = requests.filter(
            ({ url }) => url.pathname === "/api/v1/auth/me",
          )
          expect(identityReads).toHaveLength(2)
          for (const read of identityReads) {
            expect(read.headers.authorization).toBe("Bearer browser-access")
            expect(read.headers["new-api-user"]).toBeUndefined()
          }
          expect(
            requests.some(({ url }) => url.pathname === "/api/v1/auth/refresh"),
          ).toBe(false)
          expect(fixture.errors).toEqual([])
          await actions.send(
            RuntimeActionIds.ContentClearSub2ApiOAuthEvidence,
            request,
          )
          expect(
            await page.evaluate(() =>
              sessionStorage.getItem("all-api-hub:sub2api-oauth"),
            ),
          ).toBeNull()
        } finally {
          await fixture.close()
        }
      },
    )
  }
}

for (const blockedBy of ["captcha", "truncated-logout"] as const) {
  test(
    "Sub2API stops on " + blockedBy + " without replay or navigation",
    async ({ context }) => {
      const fixture = await oauthFixture({
        modern: false,
        matching: true,
        blockedBy,
      })
      const { origin } = fixture
      try {
        const page = await context.newPage()
        await page.goto(origin + "/login")
        await page.evaluate(() =>
          localStorage.setItem("auth_token", "existing-session"),
        )
        const actions = await contentActions(context, page)
        expect(
          await actions.send(RuntimeActionIds.ContentPrepareSub2ApiOAuth, {
            origin,
            requestId,
            loginProvider: "linuxdo",
          }),
        ).toEqual({
          success: false,
          reason:
            blockedBy === "captcha" ? "interaction_required" : "uncertain",
        })
        const logouts = fixture.requests.filter(
          ({ url }) => url.pathname === "/api/v1/auth/logout",
        )
        expect(logouts).toHaveLength(blockedBy === "captcha" ? 0 : 1)
        await expect(page).toHaveURL(origin + "/login")
        expect(
          await page.evaluate(() => localStorage.getItem("auth_token")),
        ).toBe("existing-session")
        expect(fixture.errors).toEqual([])
      } finally {
        await fixture.close()
      }
    },
  )
}
