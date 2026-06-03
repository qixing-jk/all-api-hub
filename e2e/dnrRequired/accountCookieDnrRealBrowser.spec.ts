import http from "node:http"
import type { AddressInfo, Socket } from "node:net"
import type { BrowserContext, Page } from "@playwright/test"

import { SITE_TYPES } from "~/constants/siteType"
import { OPTIONAL_PERMISSION_IDS } from "~/services/permissions/permissionManager"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  refreshAccountRowsAndReadStorage,
  saveManualAccountFromApp,
} from "~~/e2e/scenarios/accountManualAdd"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
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
  getServiceWorker,
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

test("isolates same-site cookie and access-token accounts through account refresh UI", async ({
  context,
  extensionId,
  page,
}) => {
  test.slow()
  skipUnlessDnrRequiredVariant()

  const localSite = await startDnrCaptureNewApiServer()
  try {
    const serviceWorker = await getServiceWorker(context)
    await seedStoredAccounts(serviceWorker, [])
    await seedUserPreferences(serviceWorker, {
      tempWindowFallback: {
        enabled: true,
        useInPopup: true,
        useInSidePanel: true,
        useInOptions: true,
        useForAutoRefresh: true,
        useForManualRefresh: true,
        tempContextMode: "composite",
      },
      tempWindowFallbackReminder: {
        dismissed: true,
      },
      warnOnDuplicateAccountAdd: false,
    })

    await test.step("open extension and verify cookie/DNR permissions", async () => {
      await openAccountManagementPage({ page, extensionId })
      await expectPermissionOnboardingHidden(page)
      await grantCookieDnrPermissions(page, localSite.origin)
    })

    await test.step("seed browser login cookie that must not leak into account requests", async () => {
      await seedBrowserCurrentLoginCookie(context, localSite.origin)
    })

    const savedAccounts =
      await test.step("save cookie and access-token accounts through the account UI", async () => {
        const cookieAccountA = await saveManualAccountFromApp({
          page,
          extensionId,
          serviceWorker,
          baseUrl: localSite.origin,
          siteType: SITE_TYPES.NEW_API,
          account: {
            authType: AuthTypeEnum.Cookie,
            siteName: "Local DNR New API",
            username: "cookie-user-a",
            userId: "201",
            cookieAuthSessionCookie: ACCOUNT_A_SESSION_COOKIE,
          },
        })
        const cookieAccountB = await saveManualAccountFromApp({
          page,
          extensionId,
          serviceWorker,
          baseUrl: localSite.origin,
          siteType: SITE_TYPES.NEW_API,
          account: {
            authType: AuthTypeEnum.Cookie,
            siteName: "Local DNR New API",
            username: "cookie-user-b",
            userId: "202",
            cookieAuthSessionCookie: ACCOUNT_B_SESSION_COOKIE,
          },
        })
        const tokenAccountA = await saveManualAccountFromApp({
          page,
          extensionId,
          serviceWorker,
          baseUrl: localSite.origin,
          siteType: SITE_TYPES.NEW_API,
          account: {
            authType: AuthTypeEnum.AccessToken,
            siteName: "Local DNR New API",
            username: "token-user-a",
            userId: "301",
            accessToken: ACCESS_TOKEN_A,
          },
        })
        const tokenAccountB = await saveManualAccountFromApp({
          page,
          extensionId,
          serviceWorker,
          baseUrl: localSite.origin,
          siteType: SITE_TYPES.NEW_API,
          account: {
            authType: AuthTypeEnum.AccessToken,
            siteName: "Local DNR New API",
            username: "token-user-b",
            userId: "302",
            accessToken: ACCESS_TOKEN_B,
          },
        })

        return [cookieAccountA, cookieAccountB, tokenAccountA, tokenAccountB]
      })

    await test.step("reset captured requests and stored balances before final UI refresh", async () => {
      localSite.clearSelfRequests()
      await seedStoredAccounts(
        serviceWorker,
        savedAccounts.map((account, index) => ({
          ...account,
          account_info: {
            ...account.account_info,
            quota: 1_000 + index,
          },
        })),
      )
    })

    await test.step("refresh the saved accounts from the account management UI", async () => {
      const refreshedAccounts = await refreshAccountRowsAndReadStorage({
        page,
        serviceWorker,
        accountIds: savedAccounts.map((account) => account.id),
        expectedQuotas: [33_000, 44_000, 55_000, 66_000],
      })

      expect(refreshedAccounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            authType: AuthTypeEnum.Cookie,
            account_info: expect.objectContaining({
              id: "201",
              username: "cookie-user-a",
              quota: 33_000,
            }),
          }),
          expect.objectContaining({
            authType: AuthTypeEnum.Cookie,
            account_info: expect.objectContaining({
              id: "202",
              username: "cookie-user-b",
              quota: 44_000,
            }),
          }),
          expect.objectContaining({
            authType: AuthTypeEnum.AccessToken,
            account_info: expect.objectContaining({
              id: "301",
              username: "token-user-a",
              quota: 55_000,
            }),
          }),
          expect.objectContaining({
            authType: AuthTypeEnum.AccessToken,
            account_info: expect.objectContaining({
              id: "302",
              username: "token-user-b",
              quota: 66_000,
            }),
          }),
        ]),
      )
    })

    const authenticatedSelfRequests = localSite.selfRequests.filter(
      (request) => request.matchedSessionCookie || request.matchedAccessToken,
    )
    const cookieAccountASequence = expectCookieDnrFallbackSequence(
      localSite.selfRequests,
      ACCOUNT_A_SESSION_COOKIE,
    )
    expectCookieDnrFallbackSequence(
      localSite.selfRequests,
      ACCOUNT_B_SESSION_COOKIE,
      cookieAccountASequence.successIndex + 1,
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

type CapturedSelfRequest = {
  cookieHeader: string
  matchedSessionCookie: string | null
  matchedAccessToken: string | null
  responseStatus: number
}

type DnrCaptureNewApiServer = {
  origin: string
  selfRequests: CapturedSelfRequest[]
  clearSelfRequests: () => void
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
      const account =
        (matchedSessionCookie
          ? ACCOUNT_BY_SESSION_COOKIE[matchedSessionCookie]
          : null) ??
        (matchedAccessToken
          ? ACCOUNT_BY_ACCESS_TOKEN[matchedAccessToken]
          : null)
      const captured: CapturedSelfRequest = {
        cookieHeader,
        matchedSessionCookie,
        matchedAccessToken,
        responseStatus: account ? 200 : 401,
      }
      selfRequests.push(captured)
      resolveMatchingWaiters(captured)

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
    clearSelfRequests: () => {
      selfRequests.splice(0)
    },
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

function expectCookieDnrFallbackSequence(
  requests: CapturedSelfRequest[],
  targetSessionCookie: string,
  startIndex = 0,
) {
  const successIndex = requests.findIndex(
    (request, index) =>
      index >= startIndex &&
      request.responseStatus === 200 &&
      request.matchedSessionCookie === targetSessionCookie,
  )
  expect(
    successIndex,
    `${targetSessionCookie} DNR success request`,
  ).toBeGreaterThanOrEqual(startIndex)

  const primaryFailureIndex = requests.findIndex(
    (request, index) =>
      index >= startIndex &&
      index < successIndex &&
      request.responseStatus === 401 &&
      request.cookieHeader.includes(BROWSER_CURRENT_SESSION_COOKIE) &&
      !request.matchedSessionCookie &&
      !request.matchedAccessToken,
  )
  expect(
    primaryFailureIndex,
    `${targetSessionCookie} primary browser-cookie 401 request`,
  ).toBeGreaterThanOrEqual(startIndex)

  expect(requests[successIndex].cookieHeader).toContain(targetSessionCookie)
  expect(requests[successIndex].cookieHeader).not.toContain(
    BROWSER_CURRENT_SESSION_COOKIE,
  )

  return {
    primaryFailureIndex,
    successIndex,
  }
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
