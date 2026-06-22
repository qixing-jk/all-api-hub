import http from "node:http"
import type { AddressInfo, Socket } from "node:net"
import type { BrowserContext, Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import {
  getKeyManagementTokenRowTestId,
  KEY_MANAGEMENT_TEST_IDS,
} from "~/features/KeyManagement/testIds"
import { OPTIONAL_PERMISSION_IDS } from "~/services/permissions/permissionManager"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  readStoredAccounts,
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
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
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
  context,
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
    await closeOtherPages(context, page)
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
        await localSite.waitForAuthenticatedSessionRequest(
          ACCOUNT_A_SESSION_COOKIE,
        )
        await waitForStoredAccountQuota(
          serviceWorker,
          cookieAccountA.id,
          33_000,
        )

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
        await localSite.waitForAuthenticatedSessionRequest(
          ACCOUNT_B_SESSION_COOKIE,
        )
        await waitForStoredAccountQuota(
          serviceWorker,
          cookieAccountB.id,
          44_000,
        )

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
        await localSite.waitForAuthenticatedAccessTokenRequest(ACCESS_TOKEN_A)
        await waitForStoredAccountQuota(serviceWorker, tokenAccountA.id, 55_000)

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
        await localSite.waitForAuthenticatedAccessTokenRequest(ACCESS_TOKEN_B)
        await waitForStoredAccountQuota(serviceWorker, tokenAccountB.id, 66_000)

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

    await test.step("load each cookie account token list from Key Management", async () => {
      localSite.clearTokenRequests()

      await openKeyManagementForAccount({
        page,
        extensionId,
        accountId: savedAccounts[0].id,
      })
      await expect(
        page.getByTestId(
          getKeyManagementTokenRowTestId(
            ACCOUNT_BY_SESSION_COOKIE[ACCOUNT_A_SESSION_COOKIE].tokenId,
          ),
        ),
      ).toBeVisible()
      await expect(
        page.getByTestId(
          getKeyManagementTokenRowTestId(
            ACCOUNT_BY_SESSION_COOKIE[ACCOUNT_B_SESSION_COOKIE].tokenId,
          ),
        ),
      ).toHaveCount(0)

      expectTokenDnrFallbackSequence(
        localSite.tokenRequests,
        ACCOUNT_A_SESSION_COOKIE,
      )
      expectOnlyTargetTokenRequests(
        localSite.tokenRequests,
        ACCOUNT_A_SESSION_COOKIE,
      )
      localSite.clearTokenRequests()

      await openKeyManagementForAccount({
        page,
        extensionId,
        accountId: savedAccounts[1].id,
      })
      await expect(
        page.getByTestId(
          getKeyManagementTokenRowTestId(
            ACCOUNT_BY_SESSION_COOKIE[ACCOUNT_B_SESSION_COOKIE].tokenId,
          ),
        ),
      ).toBeVisible()
      await expect(
        page.getByTestId(
          getKeyManagementTokenRowTestId(
            ACCOUNT_BY_SESSION_COOKIE[ACCOUNT_A_SESSION_COOKIE].tokenId,
          ),
        ),
      ).toHaveCount(0)

      expectTokenDnrFallbackSequence(
        localSite.tokenRequests,
        ACCOUNT_B_SESSION_COOKIE,
      )
      expectOnlyTargetTokenRequests(
        localSite.tokenRequests,
        ACCOUNT_B_SESSION_COOKIE,
      )
    })

    await test.step("load all same-site cookie account token lists from Key Management", async () => {
      localSite.clearTokenRequests()

      await openKeyManagementForAllAccounts({
        page,
        extensionId,
      })
      await page.getByTestId(KEY_MANAGEMENT_TEST_IDS.expandAllButton).click()
      await expect(
        page.getByTestId(
          getKeyManagementTokenRowTestId(
            ACCOUNT_BY_SESSION_COOKIE[ACCOUNT_A_SESSION_COOKIE].tokenId,
          ),
        ),
      ).toBeVisible()
      await expect(
        page.getByTestId(
          getKeyManagementTokenRowTestId(
            ACCOUNT_BY_SESSION_COOKIE[ACCOUNT_B_SESSION_COOKIE].tokenId,
          ),
        ),
      ).toBeVisible()

      expectTokenDnrFallbackSequence(
        localSite.tokenRequests,
        ACCOUNT_A_SESSION_COOKIE,
      )
      expectTokenDnrFallbackSequence(
        localSite.tokenRequests,
        ACCOUNT_B_SESSION_COOKIE,
      )
    })
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

async function waitForStoredAccountQuota(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  accountId: string,
  expectedQuota: number,
) {
  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      const account = accounts.find((candidate) => candidate.id === accountId)
      return account?.account_info.quota ?? null
    })
    .toBe(expectedQuota)
}

type CapturedSelfRequest = {
  cookieHeader: string
  matchedSessionCookie: string | null
  matchedAccessToken: string | null
  responseStatus: number
}

type CapturedTokenRequest = CapturedSelfRequest & {
  userIdHeader: string | null
  mismatch: boolean
}

type DnrCaptureNewApiServer = {
  origin: string
  selfRequests: CapturedSelfRequest[]
  tokenRequests: CapturedTokenRequest[]
  clearSelfRequests: () => void
  clearTokenRequests: () => void
  waitForAuthenticatedSessionRequest: (
    sessionCookie: string,
  ) => Promise<CapturedSelfRequest>
  waitForAuthenticatedAccessTokenRequest: (
    accessToken: string,
  ) => Promise<CapturedSelfRequest>
  close: () => Promise<void>
}

async function startDnrCaptureNewApiServer(): Promise<DnrCaptureNewApiServer> {
  const selfRequests: CapturedSelfRequest[] = []
  const tokenRequests: CapturedTokenRequest[] = []
  const sockets = new Set<Socket>()
  const waiters: Array<{
    matches: (request: CapturedSelfRequest) => boolean
    resolve: (request: CapturedSelfRequest) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  }> = []

  const resolveMatchingWaiters = (captured: CapturedSelfRequest) => {
    for (const waiter of [...waiters]) {
      if (!waiter.matches(captured)) {
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

    if (method === "GET" && url.pathname === "/api/token/") {
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
      const userIdHeader = extractCompatUserIdHeader(request.headers)
      const mismatch = Boolean(
        account && userIdHeader && userIdHeader !== account.id,
      )
      const captured: CapturedTokenRequest = {
        cookieHeader,
        matchedSessionCookie,
        matchedAccessToken,
        userIdHeader,
        mismatch,
        responseStatus: account && !mismatch ? 200 : 401,
      }
      tokenRequests.push(captured)

      if (!account) {
        sendJson(401, {
          success: false,
          message: "missing account session cookie",
        })
        return
      }

      if (mismatch) {
        sendJson(401, {
          success: false,
          message: `cookie and userid mismatch: cookie=${account.id} header=${userIdHeader}`,
        })
        return
      }

      sendJson(200, {
        success: true,
        message: "ok",
        data: [
          {
            id: account.tokenId,
            user_id: Number(account.id),
            key: account.tokenKey,
            status: 1,
            name: account.tokenName,
            created_time: 1_700_000_000,
            accessed_time: 1_700_000_000,
            expired_time: -1,
            remain_quota: -1,
            unlimited_quota: true,
            model_limits_enabled: false,
            model_limits: "",
            allow_ips: "",
            used_quota: 0,
            group: "default",
          },
        ],
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

  const waitForAuthenticatedRequest = async (
    label: string,
    matches: (request: CapturedSelfRequest) => boolean,
  ) => {
    const existing = selfRequests.find(matches)
    if (existing) return existing

    return await new Promise<CapturedSelfRequest>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const seen = selfRequests
          .map((request) =>
            [
              `cookie=${request.cookieHeader || "<empty>"}`,
              `token=${request.matchedAccessToken ?? "<none>"}`,
              `status=${request.responseStatus}`,
            ].join(" "),
          )
          .join(", ")
        reject(
          new Error(`Timed out waiting for ${label}; seen requests: ${seen}`),
        )
      }, 15_000)

      waiters.push({
        matches,
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
    tokenRequests,
    clearSelfRequests: () => {
      selfRequests.splice(0)
    },
    clearTokenRequests: () => {
      tokenRequests.splice(0)
    },
    waitForAuthenticatedSessionRequest: (sessionCookie) =>
      waitForAuthenticatedRequest(
        sessionCookie,
        (request) => request.matchedSessionCookie === sessionCookie,
      ),
    waitForAuthenticatedAccessTokenRequest: (accessToken) =>
      waitForAuthenticatedRequest(
        accessToken,
        (request) => request.matchedAccessToken === accessToken,
      ),
    close,
  }
}

const ACCOUNT_BY_SESSION_COOKIE: Record<
  string,
  {
    id: string
    username: string
    quota: number
    tokenId: number
    tokenName: string
    tokenKey: string
  }
> = {
  [ACCOUNT_A_SESSION_COOKIE]: {
    id: "201",
    username: "cookie-user-a",
    quota: 33_000,
    tokenId: 2011,
    tokenName: "Cookie User A Key",
    tokenKey: "sk-cookie-user-a",
  },
  [ACCOUNT_B_SESSION_COOKIE]: {
    id: "202",
    username: "cookie-user-b",
    quota: 44_000,
    tokenId: 2021,
    tokenName: "Cookie User B Key",
    tokenKey: "sk-cookie-user-b",
  },
}

const ACCOUNT_BY_ACCESS_TOKEN: Record<
  string,
  {
    id: string
    username: string
    quota: number
    tokenId: number
    tokenName: string
    tokenKey: string
  }
> = {
  [ACCESS_TOKEN_A]: {
    id: "301",
    username: "token-user-a",
    quota: 55_000,
    tokenId: 3011,
    tokenName: "Token User A Key",
    tokenKey: "sk-token-user-a",
  },
  [ACCESS_TOKEN_B]: {
    id: "302",
    username: "token-user-b",
    quota: 66_000,
    tokenId: 3021,
    tokenName: "Token User B Key",
    tokenKey: "sk-token-user-b",
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

function expectTokenDnrFallbackSequence(
  requests: CapturedTokenRequest[],
  targetSessionCookie: string,
) {
  const account = ACCOUNT_BY_SESSION_COOKIE[targetSessionCookie]
  const success = requests.find(
    (request) =>
      request.responseStatus === 200 &&
      request.matchedSessionCookie === targetSessionCookie &&
      request.userIdHeader === account.id,
  )

  expect(
    success,
    `${targetSessionCookie} token list request with matching cookie/user id`,
  ).toEqual(
    expect.objectContaining({
      cookieHeader: expect.stringContaining(targetSessionCookie),
      mismatch: false,
      userIdHeader: account.id,
    }),
  )

  expect(
    requests.filter((request) => request.mismatch),
    `${targetSessionCookie} token list cookie/user-id mismatches`,
  ).toHaveLength(0)
}

function expectOnlyTargetTokenRequests(
  requests: CapturedTokenRequest[],
  targetSessionCookie: string,
) {
  expect(
    requests.filter(
      (request) =>
        request.responseStatus === 200 &&
        request.matchedSessionCookie &&
        request.matchedSessionCookie !== targetSessionCookie,
    ),
    `${targetSessionCookie} non-target token-list requests`,
  ).toHaveLength(0)
}

function extractCompatUserIdHeader(headers: http.IncomingHttpHeaders) {
  const rawValue =
    headers["new-api-user"] ??
    headers["user-id"] ??
    headers["x-api-user"] ??
    headers["veloera-user"] ??
    headers["voapi-user"]
  if (Array.isArray(rawValue)) {
    return rawValue[0] ?? null
  }
  return rawValue ?? null
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

async function openKeyManagementForAccount(params: {
  page: Page
  extensionId: string
  accountId: string
}) {
  await params.page.goto(
    `chrome-extension://${params.extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=${params.accountId}`,
  )
  await waitForExtensionRoot(params.page)
  await expectPermissionOnboardingHidden(params.page)
}

async function openKeyManagementForAllAccounts(params: {
  page: Page
  extensionId: string
}) {
  await params.page.goto(
    `chrome-extension://${params.extensionId}/${OPTIONS_PAGE_PATH}#keys`,
  )
  await waitForExtensionRoot(params.page)
  await expectPermissionOnboardingHidden(params.page)
  await params.page
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.accountScopeSelect)
    .click()
  await params.page
    .getByTestId(KEY_MANAGEMENT_TEST_IDS.accountScopeAllOption)
    .click()
}
