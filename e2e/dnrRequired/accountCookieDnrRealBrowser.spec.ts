import http from "node:http"
import type { AddressInfo, Socket } from "node:net"
import type { BrowserContext, Page } from "@playwright/test"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { OPTIONAL_PERMISSION_IDS } from "~/services/permissions/permissionManager"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  E2E_BUILD_VARIANT_ENV,
  E2E_BUILD_VARIANTS,
} from "~~/e2e/utils/e2eBuildVariants"
import {
  closeOtherPages,
  expectPermissionOnboardingHidden,
  getManifestOptionalPermissions,
  getManifestRequiredPermissions,
  requestAndExpectOptionalPermissions,
} from "~~/e2e/utils/extensionState"
import { openAccountManagementPage } from "~~/e2e/utils/realSite/accountAdd"

const BROWSER_CURRENT_SESSION_COOKIE = "session=browser-current"
const ACCOUNT_A_SESSION_COOKIE = "session=user-a"
const ACCOUNT_B_SESSION_COOKIE = "session=user-b"
const ACCESS_TOKEN_A = "access-token-user-a"
const ACCESS_TOKEN_B = "access-token-user-b"
const COOKIE_DNR_PERMISSIONS = [
  OPTIONAL_PERMISSION_IDS.Cookies,
  OPTIONAL_PERMISSION_IDS.declarativeNetRequestWithHostAccess,
]

test.describe.configure({ mode: "serial" })

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page, {
    ignoreConsoleErrorPatterns: [
      /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/u,
    ],
  })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("grants the Chromium cookie/DNR optional permissions needed for cookie auth", async ({
  extensionId,
  page,
}) => {
  skipUnlessDnrRequiredVariant()

  const localSite = await startDnrCaptureNewApiServer()
  try {
    await openAccountManagementPage({ page, extensionId })
    await expectPermissionOnboardingHidden(page)
    await grantCookieDnrPermissions(page, localSite.origin)
  } finally {
    await localSite.close()
  }
})

test("isolates same-site cookie and access-token accounts through production temp-window fetch", async ({
  context,
  extensionId,
  page,
}) => {
  test.slow()
  skipUnlessDnrRequiredVariant()

  const localSite = await startDnrCaptureNewApiServer()
  try {
    await test.step("open extension and verify cookie/DNR permissions", async () => {
      await openAccountManagementPage({ page, extensionId })
      await expectPermissionOnboardingHidden(page)
      await grantCookieDnrPermissions(page, localSite.origin)
    })

    await test.step("seed browser login cookie that must not leak into account requests", async () => {
      await seedBrowserCurrentLoginCookie(context, localSite.origin)
    })

    await test.step("fetch account A with real Chromium DNR cookie injection", async () => {
      const response = await runTempWindowAccountFetch(page, {
        originUrl: localSite.origin,
        accountId: "e2e-cookie-account-a",
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: ACCOUNT_A_SESSION_COOKIE,
        fetchOptions: { credentials: "include" },
      })
      expect(response).toMatchObject({
        success: true,
        status: 200,
        data: expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: "201",
            username: "cookie-user-a",
            quota: 33_000,
          }),
        }),
      })
      await localSite.waitForAuthenticatedSelfRequest(ACCOUNT_A_SESSION_COOKIE)
    })

    await test.step("fetch account B with real Chromium DNR cookie injection", async () => {
      const response = await runTempWindowAccountFetch(page, {
        originUrl: localSite.origin,
        accountId: "e2e-cookie-account-b",
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: ACCOUNT_B_SESSION_COOKIE,
        fetchOptions: { credentials: "include" },
      })
      expect(response).toMatchObject({
        success: true,
        status: 200,
        data: expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: "202",
            username: "cookie-user-b",
            quota: 44_000,
          }),
        }),
      })
      await localSite.waitForAuthenticatedSelfRequest(ACCOUNT_B_SESSION_COOKIE)
    })

    await test.step("fetch access-token accounts without cookie auth contamination", async () => {
      const responseA = await runTempWindowAccountFetch(page, {
        originUrl: localSite.origin,
        accountId: "e2e-access-token-account-a",
        authType: AuthTypeEnum.AccessToken,
        fetchOptions: {
          credentials: "omit",
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN_A}`,
          },
        },
      })
      const responseB = await runTempWindowAccountFetch(page, {
        originUrl: localSite.origin,
        accountId: "e2e-access-token-account-b",
        authType: AuthTypeEnum.AccessToken,
        fetchOptions: {
          credentials: "omit",
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN_B}`,
          },
        },
      })

      expect(responseA).toMatchObject({
        success: true,
        status: 200,
        data: expect.objectContaining({
          data: expect.objectContaining({
            id: "301",
            username: "token-user-a",
            quota: 55_000,
          }),
        }),
      })
      expect(responseB).toMatchObject({
        success: true,
        status: 200,
        data: expect.objectContaining({
          data: expect.objectContaining({
            id: "302",
            username: "token-user-b",
            quota: 66_000,
          }),
        }),
      })
    })

    const authenticatedSelfRequests = localSite.selfRequests.filter(
      (request) => request.matchedSessionCookie || request.matchedAccessToken,
    )
    expect(authenticatedSelfRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          matchedSessionCookie: ACCOUNT_A_SESSION_COOKIE,
        }),
        expect.objectContaining({
          matchedSessionCookie: ACCOUNT_B_SESSION_COOKIE,
        }),
        expect.objectContaining({
          matchedAccessToken: ACCESS_TOKEN_A,
        }),
        expect.objectContaining({
          matchedAccessToken: ACCESS_TOKEN_B,
        }),
      ]),
    )
    for (const request of authenticatedSelfRequests) {
      expect(request.cookieHeader).not.toContain(BROWSER_CURRENT_SESSION_COOKIE)
    }
  } finally {
    await closeOtherPages(context, page)
    await localSite.close()
  }
})

function skipUnlessDnrRequiredVariant() {
  test.skip(
    process.env[E2E_BUILD_VARIANT_ENV] !== E2E_BUILD_VARIANTS.DnrRequired,
    [
      "Real Chromium DNR cookie isolation requires the E2E-only dnr-required manifest variant.",
      `Run with ${E2E_BUILD_VARIANT_ENV}=${E2E_BUILD_VARIANTS.DnrRequired}.`,
    ].join(" "),
  )
}

async function grantCookieDnrPermissions(page: Page, origin: string) {
  const optionalPermissions = await getManifestOptionalPermissions(page)
  const requiredPermissions = await getManifestRequiredPermissions(page)
  for (const permission of COOKIE_DNR_PERMISSIONS) {
    expect([...optionalPermissions, ...requiredPermissions]).toContain(
      permission,
    )
  }

  const missingOptionalPermissions = COOKIE_DNR_PERMISSIONS.filter(
    (permission) => !requiredPermissions.includes(permission),
  )
  await requestAndExpectOptionalPermissions(page, missingOptionalPermissions)
  const originPattern = `${origin}/*`
  const hasOriginPermission = await page.evaluate(async (originPattern) => {
    const chromeApi = (
      globalThis as typeof globalThis & { chrome?: typeof chrome }
    ).chrome

    if (!chromeApi?.permissions) {
      throw new Error("chrome.permissions is unavailable in extension context")
    }

    return await chromeApi.permissions.contains({
      origins: [originPattern],
    })
  }, originPattern)

  expect(hasOriginPermission, `${originPattern} host access`).toBe(true)
}

async function runTempWindowAccountFetch(
  page: Page,
  params: {
    originUrl: string
    accountId: string
    authType: AuthTypeEnum
    cookieAuthSessionCookie?: string
    fetchOptions: RequestInit
  },
) {
  return await page.evaluate(
    async ({
      action,
      accountId,
      authType,
      cookieAuthSessionCookie,
      fetchOptions,
      originUrl,
    }) => {
      const chromeApi = (
        globalThis as typeof globalThis & { chrome?: typeof chrome }
      ).chrome

      if (!chromeApi?.runtime?.sendMessage) {
        throw new Error("chrome.runtime.sendMessage is unavailable")
      }

      const requestId = `e2e-temp-window-${accountId}-${Date.now()}`
      const message = {
        action,
        originUrl,
        fetchUrl: `${originUrl}/api/user/self`,
        fetchOptions,
        requestId,
        responseType: "json",
        suppressMinimize: true,
        accountId,
        authType,
        cookieAuthSessionCookie,
      }

      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(`Timed out waiting for tempWindowFetch ${requestId}`),
          )
        }, 30_000)
      })

      const response = new Promise((resolve, reject) => {
        chromeApi.runtime.sendMessage(message, (result) => {
          const error = chromeApi.runtime.lastError
          if (error) {
            reject(new Error(error.message))
            return
          }
          resolve(result)
        })
      })

      return await Promise.race([response, timeout])
    },
    {
      action: RuntimeActionIds.TempWindowFetch,
      accountId: params.accountId,
      authType: params.authType,
      cookieAuthSessionCookie: params.cookieAuthSessionCookie,
      fetchOptions: params.fetchOptions,
      originUrl: params.originUrl,
    },
  )
}

type CapturedSelfRequest = {
  cookieHeader: string
  matchedSessionCookie: string | null
  matchedAccessToken: string | null
}

type DnrCaptureNewApiServer = {
  origin: string
  selfRequests: CapturedSelfRequest[]
  waitForAuthenticatedSelfRequest: (
    sessionCookie: string,
  ) => Promise<CapturedSelfRequest>
  close: () => Promise<void>
}

async function startDnrCaptureNewApiServer(): Promise<DnrCaptureNewApiServer> {
  const selfRequests: CapturedSelfRequest[] = []
  const sockets = new Set<Socket>()
  const waiters: Array<{
    sessionCookie: string
    resolve: (request: CapturedSelfRequest) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  }> = []

  const resolveMatchingWaiters = (captured: CapturedSelfRequest) => {
    for (const waiter of [...waiters]) {
      if (captured.matchedSessionCookie !== waiter.sessionCookie) {
        continue
      }
      clearTimeout(waiter.timeout)
      waiters.splice(waiters.indexOf(waiter), 1)
      waiter.resolve(captured)
    }
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    const method = request.method ?? "GET"

    const sendJson = (status: number, body: unknown) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
      })
      response.end(JSON.stringify(body))
    }

    if (method === "GET" && url.pathname === "/") {
      response.writeHead(200, {
        "Content-Type": "text/html",
      })
      response.end(
        "<!doctype html><html><head><title>Local DNR New API</title></head><body>Local DNR New API</body></html>",
      )
      return
    }

    if (method === "GET" && url.pathname === "/favicon.ico") {
      response.writeHead(204)
      response.end()
      return
    }

    if (method === "GET" && url.pathname === "/api/status") {
      sendJson(200, {
        success: true,
        message: "ok",
        data: {
          system_name: "Local DNR New API",
          price: 7,
          checkin_enabled: false,
        },
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/user/self") {
      const cookieHeader = request.headers.cookie ?? ""
      const authorizationHeader = request.headers.authorization ?? ""
      const matchedSessionCookie = matchAccountSessionCookie(cookieHeader)
      const matchedAccessToken = matchAccessToken(authorizationHeader)
      const captured: CapturedSelfRequest = {
        cookieHeader,
        matchedSessionCookie,
        matchedAccessToken,
      }
      selfRequests.push(captured)
      resolveMatchingWaiters(captured)

      const account =
        (matchedSessionCookie
          ? ACCOUNT_BY_SESSION_COOKIE[matchedSessionCookie]
          : null) ??
        (matchedAccessToken
          ? ACCOUNT_BY_ACCESS_TOKEN[matchedAccessToken]
          : null)
      if (!account) {
        sendJson(401, {
          success: false,
          message: "missing account session cookie",
        })
        return
      }

      sendJson(200, {
        success: true,
        message: "ok",
        data: {
          id: account.id,
          username: account.username,
          access_token: "",
          quota: account.quota,
        },
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/log/self/stat") {
      sendJson(200, {
        success: true,
        message: "ok",
        data: {
          quota: 0,
          rpm: 0,
          tpm: 0,
        },
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/log/self") {
      sendJson(200, {
        success: true,
        message: "ok",
        data: {
          page: Number(url.searchParams.get("p") ?? "1"),
          page_size: Number(url.searchParams.get("page_size") ?? "100"),
          total: 0,
          items: [],
        },
      })
      return
    }

    sendJson(404, {
      success: false,
      message: `Unhandled local DNR route: ${method} ${url.pathname}`,
    })
  })

  server.on("connection", (socket) => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
  })

  const origin = await new Promise<string>((resolve, reject) => {
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })

  const waitForAuthenticatedSelfRequest = async (sessionCookie: string) => {
    const existing = selfRequests.find(
      (request) => request.matchedSessionCookie === sessionCookie,
    )
    if (existing) return existing

    return await new Promise<CapturedSelfRequest>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const seen = selfRequests
          .map((request) => request.cookieHeader || "<empty>")
          .join(", ")
        reject(
          new Error(
            `Timed out waiting for ${sessionCookie}; seen Cookie headers: ${seen}`,
          ),
        )
      }, 15_000)

      waiters.push({
        sessionCookie,
        resolve,
        reject,
        timeout,
      })
    })
  }

  const close = async () => {
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timeout)
      waiter.reject(new Error("Local DNR server closed"))
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
      for (const socket of sockets) {
        socket.destroy()
      }
    })
  }

  return {
    origin,
    selfRequests,
    waitForAuthenticatedSelfRequest,
    close,
  }
}

const ACCOUNT_BY_SESSION_COOKIE: Record<
  string,
  { id: string; username: string; quota: number }
> = {
  [ACCOUNT_A_SESSION_COOKIE]: {
    id: "201",
    username: "cookie-user-a",
    quota: 33_000,
  },
  [ACCOUNT_B_SESSION_COOKIE]: {
    id: "202",
    username: "cookie-user-b",
    quota: 44_000,
  },
}

const ACCOUNT_BY_ACCESS_TOKEN: Record<
  string,
  { id: string; username: string; quota: number }
> = {
  [ACCESS_TOKEN_A]: {
    id: "301",
    username: "token-user-a",
    quota: 55_000,
  },
  [ACCESS_TOKEN_B]: {
    id: "302",
    username: "token-user-b",
    quota: 66_000,
  },
}

function matchAccountSessionCookie(cookieHeader: string) {
  if (cookieHeader.includes(ACCOUNT_A_SESSION_COOKIE)) {
    return ACCOUNT_A_SESSION_COOKIE
  }
  if (cookieHeader.includes(ACCOUNT_B_SESSION_COOKIE)) {
    return ACCOUNT_B_SESSION_COOKIE
  }
  return null
}

function matchAccessToken(authorizationHeader: string) {
  const match = /^Bearer\s+(.+)$/iu.exec(authorizationHeader.trim())
  const token = match?.[1] ?? authorizationHeader.trim()
  if (token === ACCESS_TOKEN_A) {
    return ACCESS_TOKEN_A
  }
  if (token === ACCESS_TOKEN_B) {
    return ACCESS_TOKEN_B
  }
  return null
}

async function seedBrowserCurrentLoginCookie(
  context: BrowserContext,
  origin: string,
) {
  const url = new URL(origin)
  await context.addCookies([
    {
      name: "session",
      value: "browser-current",
      domain: url.hostname,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ])
}
