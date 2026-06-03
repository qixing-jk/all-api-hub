import type { BrowserContext, Route, Worker } from "@playwright/test"

import { SITE_TYPES } from "~/constants/siteType"
import { OPTIONAL_PERMISSION_IDS } from "~/services/permissions/permissionManager"
import { AuthTypeEnum } from "~/types"
import { extractSessionCookieHeader } from "~/utils/browser/cookieString"
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
  expectPermissionOnboardingHidden,
  getManifestOptionalPermissions,
  getServiceWorker,
  requestAndExpectOptionalPermissions,
} from "~~/e2e/utils/extensionState"

const MOCKED_MULTI_ACCOUNT_SITE_URL = "https://multi-account.example.com"
const MOCKED_ACCOUNT_BY_ACCESS_TOKEN = {
  "e2e-access-token-a": {
    id: "101",
    username: "token-user-a",
    quota: 11_000,
  },
  "e2e-access-token-b": {
    id: "102",
    username: "token-user-b",
    quota: 22_000,
  },
  "permission-probe-token": {
    id: "200",
    username: "permission-probe-user",
    quota: 1_000,
  },
} as const
const MOCKED_ACCOUNT_BY_SESSION_COOKIE = {
  "session=user-a": {
    id: "201",
    username: "cookie-user-a",
    quota: 33_000,
  },
  "session=user-b": {
    id: "202",
    username: "cookie-user-b",
    quota: 44_000,
  },
} as const
const COOKIE_AUTH_OPTIONAL_PERMISSION_IDS = new Set<string>([
  OPTIONAL_PERMISSION_IDS.Cookies,
  OPTIONAL_PERMISSION_IDS.declarativeNetRequestWithHostAccess,
  OPTIONAL_PERMISSION_IDS.WebRequest,
  OPTIONAL_PERMISSION_IDS.WebRequestBlocking,
])

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page, {
    ignoreConsoleErrorPatterns: [
      /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/u,
    ],
  })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubCredentialIsolatedNewApiSiteRoutes(context)
})

test("saves two access-token accounts on the same mocked site", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [])
  await seedUserPreferences(serviceWorker, {
    tempWindowFallback: {
      enabled: false,
    },
    warnOnDuplicateAccountAdd: false,
  })

  await saveManualAccountFromApp({
    page,
    extensionId,
    serviceWorker,
    baseUrl: MOCKED_MULTI_ACCOUNT_SITE_URL,
    siteType: SITE_TYPES.NEW_API,
    account: {
      authType: AuthTypeEnum.AccessToken,
      siteName: "Mocked Multi Account",
      username: "token-user-a",
      userId: "101",
      accessToken: "e2e-access-token-a",
    },
  })
  await saveManualAccountFromApp({
    page,
    extensionId,
    serviceWorker,
    baseUrl: MOCKED_MULTI_ACCOUNT_SITE_URL,
    siteType: SITE_TYPES.NEW_API,
    account: {
      authType: AuthTypeEnum.AccessToken,
      siteName: "Mocked Multi Account",
      username: "token-user-b",
      userId: "102",
      accessToken: "e2e-access-token-b",
    },
  })

  await expectPermissionOnboardingHidden(page)

  const accounts = (await readStoredAccounts(serviceWorker)).filter(
    (account) => account.site_url === MOCKED_MULTI_ACCOUNT_SITE_URL,
  )
  expect(accounts).toHaveLength(2)
  expect(accounts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        authType: AuthTypeEnum.AccessToken,
        account_info: expect.objectContaining({
          id: "101",
          access_token: "e2e-access-token-a",
        }),
      }),
      expect.objectContaining({
        authType: AuthTypeEnum.AccessToken,
        account_info: expect.objectContaining({
          id: "102",
          access_token: "e2e-access-token-b",
        }),
      }),
    ]),
  )

  const refreshedAccounts = await refreshAccountRowsAndReadStorage({
    page,
    serviceWorker,
    accountIds: accounts.map((account) => account.id),
    expectedQuotas: [11_000, 22_000],
  })
  expect(refreshedAccounts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        account_info: expect.objectContaining({
          id: "101",
          username: "token-user-a",
          quota: 11_000,
        }),
      }),
      expect.objectContaining({
        account_info: expect.objectContaining({
          id: "102",
          username: "token-user-b",
          quota: 22_000,
        }),
      }),
    ]),
  )
})

test("grants cookie-auth optional permissions and saves two cookie accounts on the same mocked site", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [])
  await seedUserPreferences(serviceWorker, {
    tempWindowFallback: {
      enabled: true,
    },
    warnOnDuplicateAccountAdd: false,
  })

  await saveManualAccountFromApp({
    page,
    extensionId,
    serviceWorker,
    baseUrl: MOCKED_MULTI_ACCOUNT_SITE_URL,
    siteType: SITE_TYPES.NEW_API,
    account: {
      authType: AuthTypeEnum.AccessToken,
      siteName: "Mocked Multi Account",
      username: "permission-probe-user",
      userId: "200",
      accessToken: "permission-probe-token",
    },
  })

  const optionalPermissions = await getManifestOptionalPermissions(page)
  const cookieAuthPermissions =
    getCookieAuthOptionalPermissions(optionalPermissions)
  expect(cookieAuthPermissions).toContain("cookies")
  await requestAndExpectOptionalPermissions(page, cookieAuthPermissions)
  await seedStoredAccounts(serviceWorker, [])
  await installMockedTempWindowCookieAuthBridge(serviceWorker)

  await saveManualAccountFromApp({
    page,
    extensionId,
    serviceWorker,
    baseUrl: MOCKED_MULTI_ACCOUNT_SITE_URL,
    siteType: SITE_TYPES.NEW_API,
    account: {
      authType: AuthTypeEnum.Cookie,
      siteName: "Mocked Multi Account",
      username: "cookie-user-a",
      userId: "201",
      cookieAuthSessionCookie: "session=user-a; uid=201",
    },
  })
  await saveManualAccountFromApp({
    page,
    extensionId,
    serviceWorker,
    baseUrl: MOCKED_MULTI_ACCOUNT_SITE_URL,
    siteType: SITE_TYPES.NEW_API,
    account: {
      authType: AuthTypeEnum.Cookie,
      siteName: "Mocked Multi Account",
      username: "cookie-user-b",
      userId: "202",
      cookieAuthSessionCookie: "session=user-b; uid=202",
    },
  })

  await expectPermissionOnboardingHidden(page)

  const accounts = (await readStoredAccounts(serviceWorker)).filter(
    (account) => account.site_url === MOCKED_MULTI_ACCOUNT_SITE_URL,
  )
  expect(accounts).toHaveLength(2)
  expect(accounts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        authType: AuthTypeEnum.Cookie,
        cookieAuth: { sessionCookie: "session=user-a" },
      }),
      expect.objectContaining({
        authType: AuthTypeEnum.Cookie,
        cookieAuth: { sessionCookie: "session=user-b" },
      }),
    ]),
  )

  const refreshedAccounts = await refreshAccountRowsAndReadStorage({
    page,
    serviceWorker,
    accountIds: accounts.map((account) => account.id),
    expectedQuotas: [33_000, 44_000],
  })
  expect(refreshedAccounts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        authType: AuthTypeEnum.Cookie,
        cookieAuth: { sessionCookie: "session=user-a" },
        account_info: expect.objectContaining({
          id: "201",
          username: "cookie-user-a",
          quota: 33_000,
        }),
      }),
      expect.objectContaining({
        authType: AuthTypeEnum.Cookie,
        cookieAuth: { sessionCookie: "session=user-b" },
        account_info: expect.objectContaining({
          id: "202",
          username: "cookie-user-b",
          quota: 44_000,
        }),
      }),
    ]),
  )
})

function getCookieAuthOptionalPermissions(optionalPermissions: string[]) {
  return optionalPermissions.filter((permission) =>
    COOKIE_AUTH_OPTIONAL_PERMISSION_IDS.has(permission),
  )
}

async function installMockedTempWindowCookieAuthBridge(serviceWorker: Worker) {
  await serviceWorker.evaluate((cookieAccounts) => {
    const chromeApi = (globalThis as any).chrome
    if (!chromeApi?.declarativeNetRequest || !chromeApi?.tabs) {
      throw new Error("Chrome DNR/tabs APIs are unavailable")
    }

    const cookieHeaderByTabId = new Map<number, string>()
    const originalUpdateSessionRules =
      chromeApi.declarativeNetRequest.updateSessionRules?.bind(
        chromeApi.declarativeNetRequest,
      )
    const originalSendMessage = chromeApi.tabs.sendMessage?.bind(chromeApi.tabs)

    chromeApi.declarativeNetRequest.updateSessionRules = (
      update: {
        addRules?: Array<{
          condition?: { tabIds?: number[] }
          action?: {
            requestHeaders?: Array<{
              header?: string
              operation?: string
              value?: string
            }>
          }
        }>
      },
      callback?: () => void,
    ) => {
      for (const rule of update.addRules ?? []) {
        const tabId = rule.condition?.tabIds?.[0]
        const cookieHeader = rule.action?.requestHeaders?.find(
          (header) =>
            header.header?.toLowerCase() === "cookie" &&
            header.operation === "set" &&
            typeof header.value === "string",
        )?.value

        if (typeof tabId === "number" && cookieHeader) {
          cookieHeaderByTabId.set(tabId, cookieHeader)
        }
      }

      callback?.()
      return Promise.resolve()
    }

    chromeApi.tabs.sendMessage = (
      tabId: number,
      message: { action?: string },
      optionsOrCallback?: unknown,
      maybeCallback?: (response: unknown) => void,
    ) => {
      const callback =
        typeof optionsOrCallback === "function"
          ? optionsOrCallback
          : maybeCallback

      const respond = (response: unknown) => {
        callback?.(response)
        return Promise.resolve(response)
      }

      if (
        message?.action === "checkCapGuard" ||
        message?.action === "checkCloudflareGuard"
      ) {
        return respond({
          success: true,
          passed: true,
          detection: { isChallenge: false },
        })
      }

      if (message?.action === "showShieldBypassUi") {
        return respond({ success: true })
      }

      if (message?.action === "performTempWindowFetch") {
        const cookieHeader = cookieHeaderByTabId.get(tabId) ?? ""
        const sessionCookie =
          cookieHeader.match(/(?:^|;\s*)(session=[^;]+)/iu)?.[1] ?? ""
        const account =
          cookieAccounts[sessionCookie as keyof typeof cookieAccounts]

        if (!account) {
          return respond({
            success: false,
            status: 401,
            data: { success: false, message: "mock auth failed" },
            error: "mock auth failed",
          })
        }

        return respond({
          success: true,
          status: 200,
          headers: { "content-type": "application/json" },
          data: {
            success: true,
            message: "ok",
            data: {
              id: account.id,
              username: account.username,
              access_token: "",
              quota: account.quota,
            },
          },
        })
      }

      if (originalSendMessage) {
        return originalSendMessage(
          tabId,
          message,
          optionsOrCallback as never,
          maybeCallback,
        )
      }

      return respond(undefined)
    }
    ;(globalThis as any).__aahRestoreMockedTempWindowCookieAuthBridge = () => {
      if (originalUpdateSessionRules) {
        chromeApi.declarativeNetRequest.updateSessionRules =
          originalUpdateSessionRules
      }
      if (originalSendMessage) {
        chromeApi.tabs.sendMessage = originalSendMessage
      }
      cookieHeaderByTabId.clear()
    }
  }, MOCKED_ACCOUNT_BY_SESSION_COOKIE)
}

async function stubCredentialIsolatedNewApiSiteRoutes(context: BrowserContext) {
  const origin = new URL(MOCKED_MULTI_ACCOUNT_SITE_URL).origin
  const routePattern = new RegExp(`^${escapeRegExp(origin)}(?:/.*)?$`, "u")

  await context.route(routePattern, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const fulfillJson = async (status: number, body: unknown) => {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      })
    }

    if (method === "GET" && url.pathname === "/") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><head><title>E2E Multi Account New API</title></head><body>E2E Multi Account New API</body></html>",
      })
      return
    }

    if (method === "GET" && url.pathname === "/favicon.ico") {
      await route.fulfill({
        status: 204,
        body: "",
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/status") {
      await fulfillJson(200, {
        success: true,
        message: "ok",
        data: {
          system_name: "E2E Multi Account New API",
          price: 7,
          checkin_enabled: false,
        },
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/user/self") {
      const account = resolveMockedAuthenticatedAccount(request.headers())

      if (!account) {
        await fulfillJson(401, {
          success: false,
          message: "mock auth failed",
        })
        return
      }

      await fulfillJson(200, {
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
      await fulfillJson(200, {
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
      await fulfillJson(200, {
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

    await fulfillJson(404, {
      success: false,
      message: `Unhandled credential-isolated route: ${method} ${url.pathname}`,
    })
  })
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

function resolveMockedAuthenticatedAccount(headers: Record<string, string>) {
  const bearerToken = headers.authorization?.match(/^Bearer\s+(.+)$/iu)?.[1]
  if (bearerToken && bearerToken in MOCKED_ACCOUNT_BY_ACCESS_TOKEN) {
    return MOCKED_ACCOUNT_BY_ACCESS_TOKEN[
      bearerToken as keyof typeof MOCKED_ACCOUNT_BY_ACCESS_TOKEN
    ]
  }

  const cookieHeader = headers.cookie ?? ""
  const sessionCookie = extractSessionCookieHeader(cookieHeader)
  if (sessionCookie && sessionCookie in MOCKED_ACCOUNT_BY_SESSION_COOKIE) {
    return MOCKED_ACCOUNT_BY_SESSION_COOKIE[
      sessionCookie as keyof typeof MOCKED_ACCOUNT_BY_SESSION_COOKIE
    ]
  }

  return null
}
