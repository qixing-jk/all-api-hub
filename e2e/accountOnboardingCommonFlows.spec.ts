import type { BrowserContext, Route } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import {
  OPENROUTER_MANAGEMENT_KEY_TRANSPORT_MARGIN_MS,
  OPENROUTER_MANAGEMENT_KEY_TRANSPORT_TIMEOUT_MS,
} from "~/constants/openRouterBootstrap"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_WEB_ORIGIN,
  OPENROUTER_WEB_ORIGIN,
  SITE_TYPES,
} from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
  getCopyKeyDialogRuntimeKeyItemTestId,
} from "~/features/AccountManagement/testIds"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import enMessages from "~/locales/en/messages.json" with { type: "json" }
import { buildAccountTokenRuntimeKeyId } from "~/services/accounts/accountRuntimeKeys"
import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { ApiToken, SiteAccount } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { runAccountAutoDetectScenario } from "~~/e2e/scenarios/accountAutoDetect"
import { saveExistingAccountTokenToApiProfileScenario } from "~~/e2e/scenarios/accountKeyToApiProfile"
import {
  openApiCredentialProfilesPopupScenario,
  verifyApiCredentialProfileModelsProbeScenario,
} from "~~/e2e/scenarios/apiCredentialProfileVerification"
import { verifyCcSwitchModelExportDeepLink } from "~~/e2e/scenarios/ccSwitchExport"
import {
  createStoredAccount,
  E2E_NEW_API_RC22_AUTH,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { expectAccountListItemVisibleBySite } from "~~/e2e/utils/realSite/accountAdd"

const DEFAULT_AUTO_PROVISION_TOKEN_NAME = "user group (auto)"
const AIHUBMIX_SITE_URL = AIHUBMIX_WEB_ORIGIN
const MANAGED_SITE_BASE_URL = "https://managed-site.example.com"
const MANAGED_SITE_ADMIN_TOKEN = "managed-site-admin-token"
const MANAGED_SITE_USER_ID = "1"
const OPENROUTER_API_PATH = new URL(OPENROUTER_API_BASE_URL).pathname
const OPENROUTER_MANAGEMENT_KEY = "sk-or-e2e-management-key"
const OPENROUTER_CREATOR_USER_ID = "openrouter-user-placeholder"

type OpenRouterManagementKeyFixtureMode = "authenticated" | "logged_out"

async function stubOpenRouterManagementKeyRoutes(
  context: BrowserContext,
  mode: OpenRouterManagementKeyFixtureMode,
) {
  let createCount = 0

  await context.exposeBinding(
    "__aahRecordOpenRouterManagementKeyCreate",
    (_source, label: unknown) => {
      if (typeof label === "string" && label.trim()) {
        createCount += 1
      }
    },
  )

  await context.route(`${OPENROUTER_WEB_ORIGIN}/**`, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (
      request.method() === "GET" &&
      url.pathname === "/settings/management-keys"
    ) {
      const body =
        mode === "logged_out"
          ? `<!doctype html>
            <html>
              <head><title>Sign in | OpenRouter</title></head>
              <body><a href="/auth/login">Sign in</a></body>
            </html>`
          : `<!doctype html>
            <html>
              <head><title>Management Keys | OpenRouter</title></head>
              <body>
                <main>
                  <h1>Management Keys</h1>
                  <button id="new-key" type="button">New Key</button>
                </main>
                <div id="create-dialog" role="dialog" hidden>
                  <label for="name">Name</label>
                  <input id="name" placeholder="e.g. &quot;Management Key&quot;" />
                  <button type="button" data-disabled disabled>Create</button>
                  <button type="button">Close</button>
                </div>
                <script>
                  window.Clerk = {
                    user: {
                      id: "${OPENROUTER_CREATOR_USER_ID}",
                      fullName: "OpenRouter Example",
                      username: "ignored-placeholder",
                      primaryEmailAddress: {
                        emailAddress: "ignored@example.invalid",
                      },
                    },
                  }
                  const createDialog = document.getElementById("create-dialog")
                  const input = createDialog.querySelector("input")
                  const createButton = Array.from(createDialog.querySelectorAll("button"))
                    .find((button) => button.textContent.trim() === "Create")
                  input.addEventListener("input", () => {
                    createButton.disabled = !input.value.trim()
                    createButton.toggleAttribute("data-disabled", createButton.disabled)
                  })
                  document.getElementById("new-key").addEventListener("click", () => {
                    createDialog.hidden = false
                    createDialog.setAttribute("data-open", "")
                  })
                  createButton.addEventListener("click", () => {
                    void window.__aahRecordOpenRouterManagementKeyCreate(input.value)
                    createDialog.remove()
                    const resultDialog = document.createElement("div")
                    resultDialog.setAttribute("role", "dialog")
                    resultDialog.setAttribute("data-open", "")
                    resultDialog.innerHTML = [
                      "<p>Your new management key:</p>",
                      "<code>${OPENROUTER_MANAGEMENT_KEY}</code>",
                      '<button type="button">Close</button>',
                    ].join("")
                    resultDialog.querySelector("button").addEventListener("click", () => {
                      resultDialog.remove()
                    })
                    document.body.append(resultDialog)
                  })
                </script>
              </body>
            </html>`

      await route.fulfill({ status: 200, contentType: "text/html", body })
      return
    }

    if (
      request.method() === "GET" &&
      url.pathname === `${OPENROUTER_API_PATH}/key`
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            is_management_key: true,
            creator_user_id: OPENROUTER_CREATOR_USER_ID,
          },
        }),
      })
      return
    }

    if (
      request.method() === "GET" &&
      url.pathname === `${OPENROUTER_API_PATH}/credits`
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { total_credits: 10, total_usage: 2 },
        }),
      })
      return
    }

    if (request.method() === "GET" && url.pathname === "/favicon.ico") {
      await route.fulfill({ status: 204, body: "" })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: `Unhandled OpenRouter E2E route: ${request.method()} ${url.pathname}`,
      }),
    })
  })

  return {
    getCreateCount: () => createCount,
  }
}

function createCopyDialogToken(overrides: Partial<ApiToken> = {}): ApiToken {
  const nowSeconds = Math.floor(Date.now() / 1000)

  return {
    id: 1,
    user_id: 1,
    key: "sk-copy-dialog-token",
    status: 1,
    name: "Copy Dialog Key",
    created_time: nowSeconds,
    accessed_time: nowSeconds,
    expired_time: -1,
    remain_quota: -1,
    unlimited_quota: true,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
    used_quota: 0,
    group: "default",
    ...overrides,
  }
}

async function readStoredAccounts(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<SiteAccount[]> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
  )

  if (typeof raw !== "string") return []

  try {
    const parsed = JSON.parse(raw) as { accounts?: SiteAccount[] }
    return Array.isArray(parsed.accounts) ? parsed.accounts : []
  } catch {
    return []
  }
}

async function findStoredAccountIdByUsername(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  username: string,
  siteUrl = "https://example.com",
): Promise<string | null> {
  const account = (await readStoredAccounts(serviceWorker)).find(
    (storedAccount) =>
      storedAccount.site_url === siteUrl &&
      storedAccount.account_info.username === username,
  )

  return account?.id ?? null
}

async function stubAIHubMixRoutes(context: BrowserContext) {
  await context.route(`${AIHUBMIX_SITE_URL}/**`, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === "GET" && url.pathname === "/") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><head><title>AIHubMix</title></head><body>AIHubMix</body></html>",
      })
      return
    }

    if (request.method() === "GET" && url.pathname === "/favicon.ico") {
      await route.fulfill({
        status: 204,
        body: "",
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: `Unhandled AIHubMix console route: ${request.method()} ${url.pathname}`,
      }),
    })
  })

  await context.route(`${AIHUBMIX_API_ORIGIN}/**`, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (method === "GET" && url.pathname === "/") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html>
          <html>
            <head><title>AIHubMix</title></head>
            <body>
              <script>
                window.localStorage.setItem("user", JSON.stringify({
                  id: 808,
                  username: "aihubmix-user",
                  display_name: "aihubmix-user",
                  quota: 250000,
                  used_quota: 0
                }))
              </script>
              AIHubMix
            </body>
          </html>`,
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

    if (method === "GET" && url.pathname === "/call/usr/self") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: 808,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            quota: 250000,
            used_quota: 0,
          },
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/call/usr/tkn") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: "aihubmix-account-access-token",
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/user/self") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: 808,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "aihubmix-account-access-token",
            quota: 250000,
            used_quota: 0,
          },
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/token/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      })
      return
    }

    if (method === "POST" && url.pathname === "/api/token/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: 501,
            user_id: 808,
            name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
            full_key: "sk-aihubmix-created-one-time-key",
            status: 1,
            unlimited_quota: true,
            remain_quota: -1,
            models: "",
            subnet: "",
            used_quota: 0,
          },
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/user/available_models") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: [{ model: "gpt-aihubmix-mini" }],
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/models") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            openai: [{ id: "gpt-aihubmix-mini" }],
          },
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/v1/models") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "gpt-aihubmix-mini" }],
        }),
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: `Unhandled AIHubMix API route: ${method} ${url.pathname}`,
      }),
    })
  })
}

async function stubManagedSiteAdminRoutes(context: BrowserContext) {
  const origin = new URL(MANAGED_SITE_BASE_URL).origin

  await context.route(`${origin}/**`, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (method === "GET" && url.pathname === "/api/channel/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: {
            items: [],
            total: 0,
            type_counts: {},
          },
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/channel/search") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: {
            items: [],
            total: 0,
            type_counts: {},
          },
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/group") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: ["default", "vip"],
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/user/models") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: ["gpt-aihubmix-mini"],
        }),
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: `Unhandled managed-site E2E route: ${method} ${url.pathname}`,
      }),
    })
  })
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    systemName: "E2E New API",
  })
})

test("adds an account through the real add-account auto-detect flow", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    tempWindowFallback: {
      enabled: false,
    },
  })

  await runAccountAutoDetectScenario({
    extensionId,
    extensionPage: page,
    baseUrl: "https://example.com",
    siteType: SITE_TYPES.NEW_API,
    getServiceWorker: async () => serviceWorker,
    openSitePage: async () => {
      const sitePage = await context.newPage()
      await sitePage.addInitScript(() => {
        window.localStorage.setItem(
          "user",
          JSON.stringify({
            id: 1,
            username: "e2e-user",
            quota: 1000,
          }),
        )
      })
      await sitePage.goto("https://example.com")
      await sitePage.bringToFront()
      return sitePage
    },
    prepareDetectableSite: async () => undefined,
  })

  const persistedAccounts = await serviceWorker.evaluate(async () => {
    const chromeApi = (globalThis as any).chrome

    return await new Promise<string>((resolve, reject) => {
      chromeApi.storage.local.get(
        "site_accounts",
        (stored: Record<string, string>) => {
          const error = chromeApi.runtime?.lastError
          if (error) {
            reject(new Error(error.message))
            return
          }
          resolve(stored.site_accounts)
        },
      )
    })
  })

  expect(persistedAccounts).toContain('"username":"e2e-user"')
})

test("adds an rc22 account from AuthBundle and persists only its PAT", async ({
  context,
  extensionId,
  page,
}) => {
  const baseUrl = "https://rc22.example.invalid"
  const { dashboardToken, managementPat, sessionId } = E2E_NEW_API_RC22_AUTH

  await stubNewApiSiteRoutes(context, {
    baseUrl,
    dashboardAuthMode: "auth-bundle",
    accessToken: managementPat,
  })

  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    tempWindowFallback: {
      enabled: false,
    },
  })

  const fixture = await runAccountAutoDetectScenario({
    extensionId,
    extensionPage: page,
    baseUrl,
    siteType: SITE_TYPES.NEW_API,
    getServiceWorker: async () => serviceWorker,
    openSitePage: async () => {
      const sitePage = await context.newPage()
      await sitePage.goto(baseUrl)
      expect(
        await sitePage.evaluate(() => localStorage.getItem("user")),
      ).toBeNull()
      await sitePage.bringToFront()
      return sitePage
    },
    prepareDetectableSite: async (sitePage) => ({
      cleanupDetectableSite: async () => {
        const cleanupResult = await sitePage.evaluate(
          async ({ dashboardToken, managementPat, sessionId }) => {
            const logoutResponse = await fetch("/api/user/auth/logout", {
              method: "POST",
              credentials: "include",
              headers: {
                Authorization: `Bearer ${dashboardToken}`,
                "X-Auth-Session": sessionId,
              },
            })
            const revokedDashboardResponse = await fetch("/api/user/self", {
              headers: { Authorization: `Bearer ${dashboardToken}` },
            })
            const patResponse = await fetch("/api/user/self", {
              headers: { Authorization: `Bearer ${managementPat}` },
            })

            return {
              logoutStatus: logoutResponse.status,
              revokedDashboardStatus: revokedDashboardResponse.status,
              patStatus: patResponse.status,
            }
          },
          { dashboardToken, managementPat, sessionId },
        )

        expect(cleanupResult).toEqual({
          logoutStatus: 200,
          revokedDashboardStatus: 401,
          patStatus: 200,
        })
      },
    }),
  })

  const accounts = await readStoredAccounts(serviceWorker)
  const saved = accounts.find((account) => account.id === fixture.accountId)
  expect(saved?.account_info.access_token).toBe(managementPat)
  expect(JSON.stringify(saved)).not.toContain(dashboardToken)
})

test("OpenRouter auto-detect bootstrap creates and saves one management key", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    tempWindowFallback: {
      enabled: false,
    },
  })
  const openRouterFixture = await stubOpenRouterManagementKeyRoutes(
    context,
    "authenticated",
  )

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
    .fill(OPENROUTER_WEB_ORIGIN)
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton).click()

  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger),
  ).toHaveAttribute("data-site-type", SITE_TYPES.OPENROUTER)
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
  ).toHaveValue(OPENROUTER_MANAGEMENT_KEY)
  const usernameInput = dialog.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.usernameInput,
  )
  const userIdInput = dialog.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput,
  )
  await expect(usernameInput).toBeVisible()
  await expect(usernameInput).toBeEditable()
  await expect(usernameInput).toHaveJSProperty("required", false)
  await expect(usernameInput).toHaveValue("OpenRouter Example")
  await expect(userIdInput).toBeVisible()
  await expect(userIdInput).toBeEditable()
  await expect(userIdInput).toHaveJSProperty("required", false)
  await expect(userIdInput).toHaveValue(OPENROUTER_CREATOR_USER_ID)
  await expect.poll(openRouterFixture.getCreateCount).toBe(1)

  await usernameInput.fill("Edited Example")
  await userIdInput.fill("edited-user-placeholder")
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton).click()
  await expect(dialog).toBeHidden()

  await expectAccountListItemVisibleBySite(page, {
    siteType: SITE_TYPES.OPENROUTER,
    baseUrl: OPENROUTER_WEB_ORIGIN,
  })
  await expect
    .poll(async () => {
      const accounts = await readStoredAccounts(serviceWorker)
      return accounts.find(
        (account) =>
          account.site_type === SITE_TYPES.OPENROUTER &&
          account.site_url === OPENROUTER_WEB_ORIGIN,
      )
    })
    .toMatchObject({
      site_type: SITE_TYPES.OPENROUTER,
      site_url: OPENROUTER_WEB_ORIGIN,
      account_info: {
        id: "edited-user-placeholder",
        username: "Edited Example",
        access_token: OPENROUTER_MANAGEMENT_KEY,
      },
    })

  expect(openRouterFixture.getCreateCount()).toBe(1)
})

test("OpenRouter auto-detect bootstrap shows manual fallback while logged out", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    tempWindowFallback: {
      enabled: false,
    },
  })
  const openRouterFixture = await stubOpenRouterManagementKeyRoutes(
    context,
    "logged_out",
  )

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
    .fill(OPENROUTER_WEB_ORIGIN)
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton).click()

  const loggedOutGuidance = dialog.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage,
  )
  await expect(loggedOutGuidance).toBeVisible({
    timeout:
      OPENROUTER_MANAGEMENT_KEY_TRANSPORT_TIMEOUT_MS +
      OPENROUTER_MANAGEMENT_KEY_TRANSPORT_MARGIN_MS,
  })
  await expect(loggedOutGuidance).toHaveText(
    enMessages.openrouter.bootstrap.logged_out,
  )
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger),
  ).toHaveAttribute("data-site-type", SITE_TYPES.OPENROUTER)
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput),
  ).toBeDisabled()
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
  ).toBeVisible()
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
  ).toBeEmpty()
  await expect.poll(openRouterFixture.getCreateCount).toBe(0)
})

test("enables default-key provisioning, adds an account, saves the created key as a reusable API profile, and verifies it from the popup", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    tempWindowFallback: {
      enabled: false,
    },
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=accountManagement#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const autoProvisionSwitch = page
    .locator("#auto-provision-key-on-account-add")
    .getByRole("switch")
  await expect(autoProvisionSwitch).toHaveAttribute("aria-checked", "false")
  await autoProvisionSwitch.click()
  await expect(autoProvisionSwitch).toHaveAttribute("aria-checked", "true")

  const accountFixture = await runAccountAutoDetectScenario({
    extensionId,
    extensionPage: page,
    baseUrl: "https://example.com",
    siteType: SITE_TYPES.NEW_API,
    getServiceWorker: async () => serviceWorker,
    openSitePage: async () => {
      const sitePage = await context.newPage()
      await forceExtensionLanguage(sitePage, "en")
      await sitePage.addInitScript(() => {
        window.localStorage.setItem(
          "user",
          JSON.stringify({
            id: 1,
            username: "e2e-user",
            quota: 1000,
          }),
        )
      })
      await sitePage.goto("https://example.com")
      await sitePage.bringToFront()
      return sitePage
    },
    prepareDetectableSite: async () => undefined,
  })
  await expect(
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountListView),
  ).toContainText("e2e-user")
  await expect(page.getByText("Created a default API key for")).toBeVisible()

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.KEYS}?accountId=${accountFixture.accountId}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: DEFAULT_AUTO_PROVISION_TOKEN_NAME }),
  ).toBeVisible()
  await expect(page.getByText("Group:")).toBeVisible()
  await expect(page.getByText("default", { exact: true })).toBeVisible()

  const savedProfile = await saveExistingAccountTokenToApiProfileScenario({
    extensionId,
    extensionPage: page,
    getServiceWorker: async () => serviceWorker,
    resolveAccountFixture: async () => accountFixture,
    tokenName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
    openFromAccountRow: false,
    expectedProfile: {
      baseUrl: "https://example.com",
      apiKey: "sk-created-1",
    },
    cleanupCreatedProfile: false,
  })

  const popupPage = await openApiCredentialProfilesPopupScenario({
    page: await context.newPage(),
    extensionId,
  })
  await verifyApiCredentialProfileModelsProbeScenario({
    page: popupPage,
    profileName: savedProfile.name,
    expectedModelCount: 2,
  })
})

test("exports an account key from the copy-key dialog to CC Switch", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "e2e-copy-dialog-cc-switch-account",
      site_name: "Copy Dialog CC Source",
      site_url: "https://copy-dialog-cc.example.com",
      account_info: {
        id: "45",
        username: "copy-dialog-user",
        access_token: "copy-dialog-access-token",
      },
    }),
  ])
  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://copy-dialog-cc.example.com",
    models: ["gpt-copy-dialog-cc"],
    initialTokens: [
      createCopyDialogToken({
        id: 1,
        name: "Copy Dialog CC Key",
        key: "sk-copy-dialog-cc",
      }),
      createCopyDialogToken({
        id: 2,
        name: "Copy Dialog Secondary Key",
        key: "sk-copy-dialog-secondary",
      }),
    ],
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const accountRow = page.getByTestId(
    getAccountManagementListItemTestId("e2e-copy-dialog-cc-switch-account"),
  )
  await expect(accountRow).toBeVisible()
  await accountRow.hover()
  await accountRow
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyKeyButton)
    .click()

  await expect(page.getByRole("heading", { name: "Key List" })).toBeVisible()
  await page
    .getByTestId(
      getCopyKeyDialogRuntimeKeyItemTestId(
        buildAccountTokenRuntimeKeyId("e2e-copy-dialog-cc-switch-account", 1),
      ),
    )
    .click()
  await page
    .getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.copyKeyDialogExportToCCSwitchButton,
    )
    .click()

  await verifyCcSwitchModelExportDeepLink({
    page,
    modelName: "gpt-copy-dialog-cc",
    expected: {
      app: "claude",
      name: "Copy Dialog CC Source",
      homepage: "https://copy-dialog-cc.example.com",
      endpoint: "https://copy-dialog-cc.example.com",
      apiKey: "sk-copy-dialog-cc",
    },
  })
})

test("adds an AIHubMix account, preserves its one-time key, and opens managed-site channel setup", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    tempWindowFallback: {
      enabled: false,
    },
    managedSiteType: SITE_TYPES.NEW_API,
    newApi: {
      baseUrl: MANAGED_SITE_BASE_URL,
      adminToken: MANAGED_SITE_ADMIN_TOKEN,
      userId: MANAGED_SITE_USER_ID,
      username: "",
      password: "",
      totpSecret: "",
    },
  })
  await stubAIHubMixRoutes(context)
  await stubManagedSiteAdminRoutes(context)

  const sitePage = await context.newPage()
  installExtensionPageGuards(sitePage)
  await forceExtensionLanguage(sitePage, "en")
  await sitePage.addInitScript(() => {
    window.localStorage.setItem(
      "user",
      JSON.stringify({
        id: 808,
        username: "aihubmix-user",
        display_name: "aihubmix-user",
        quota: 250000,
        used_quota: 0,
      }),
    )
  })
  await sitePage.goto(AIHUBMIX_API_ORIGIN)
  await sitePage.bringToFront()

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  await page.locator("#site-url").fill(AIHUBMIX_SITE_URL)
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton).click()

  await expect(
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger),
  ).toHaveAttribute("data-site-type", SITE_TYPES.AIHUBMIX)
  await expect(
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoConfigButton),
  ).toBeVisible()

  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoConfigButton).click()

  const oneTimeKeyInput = page.getByTestId(
    TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyInput,
  )
  await expect(oneTimeKeyInput).toBeVisible({ timeout: 30_000 })
  await expect(oneTimeKeyInput).toHaveValue("sk-aihubmix-created-one-time-key")

  await page
    .getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton)
    .click()

  await expect(
    page.getByRole("heading", { name: "Create Channel" }),
  ).toBeVisible()
  await expect(page.locator("#channel-name")).toHaveValue(
    /Aihubmix \| user group \(auto\)/,
  )
  await expect(page.locator("#channel-key")).toHaveValue(
    "sk-aihubmix-created-one-time-key",
  )
  await expect(page.locator("#channel-base-url")).toHaveValue(
    "https://aihubmix.com",
  )
  await expect(page.getByText("gpt-aihubmix-mini")).toBeVisible()

  await expect
    .poll(() =>
      findStoredAccountIdByUsername(
        serviceWorker,
        "aihubmix-user",
        AIHUBMIX_SITE_URL,
      ),
    )
    .not.toBeNull()

  await sitePage.close()
})

test("requires duplicate-warning confirmation before the manual add flow continues", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "existing-account",
      site_name: "Existing Example",
      site_url: "https://example.com",
      account_info: {
        id: "99",
        username: "existing-user",
        access_token: "existing-token",
      },
    }),
  ])
  await seedUserPreferences(serviceWorker, {
    warnOnDuplicateAccountAdd: true,
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()

  await expect(page.locator("#site-url")).toBeVisible()
  await page.locator("#site-url").fill("https://example.com")
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.manualAddButton).click()

  await expect(page.getByText("Duplicate account")).toBeVisible()
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.duplicateWarningContinueButton)
    .click()

  await expect(page.getByLabel("Site Type")).toBeVisible()
})
