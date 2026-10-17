import { mkdir } from "node:fs/promises"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import path from "node:path"

import {
  OPTIONS_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { getPopupViewTestId, POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import { POPUP_VIEW_TYPES } from "~/entrypoints/popup/viewTypes"
import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_REMOTE_CATALOG_V5_URL,
  SPONSOR_WORKFLOW_KINDS,
} from "~/features/AccountManagement/sponsors/constants"
import { SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE } from "~/features/AccountManagement/sponsors/types"
import {
  ACCOUNT_MANAGEMENT_LIST_ITEM_TEST_ID_PREFIX,
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { SITE_BOOKMARKS_TEST_IDS } from "~/features/SiteBookmarks/testIds"
import {
  createDefaultAccountStorageConfig,
  normalizeAccountStorageConfigForWrite,
} from "~/services/accounts/editing/accountDefaults"
import {
  SPONSOR_WORKFLOW_STORAGE_KEYS,
  STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createStoredApiCredentialProfile,
  createStoredBookmark,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedApiCredentialProfiles,
  stubLlmMetadataIndex,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

const SIDEPANEL_URL = (extensionId: string) =>
  `chrome-extension://${extensionId}/${SIDEPANEL_PAGE_PATH}`

async function expectBrowserTabOpened(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  url: string,
) {
  await expect
    .poll(async () => {
      return await serviceWorker.evaluate(async (targetUrl) => {
        const chromeApi = (globalThis as any).chrome
        const tabs = await chromeApi.tabs.query({})
        return tabs.some((tab: { url?: string }) => tab.url === targetUrl)
      }, url)
    })
    .toBe(true)
}

/** Seed the public session envelope under the same lock as production senders. */
async function seedSponsorHandoff(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  intent: unknown,
) {
  await serviceWorker.evaluate(
    async ({ keys, lock, intent }) => {
      const api = (globalThis as any).chrome
      const windowId = (await api.windows.getLastFocused()).id
      const id = crypto.randomUUID()
      await navigator.locks.request(lock, async () => {
        await api.storage.session.set({
          [`${keys.DRAFT_PREFIX}${id}`]: {
            version: 1,
            createdAt: Date.now(),
            windowId,
            state: intent,
          },
          [`${keys.PENDING_PREFIX}${windowId}`]: id,
        })
      })
    },
    {
      keys: SPONSOR_WORKFLOW_STORAGE_KEYS,
      lock: STORAGE_LOCKS.SPONSOR_WORKFLOW,
      intent,
    },
  )
}

async function getSponsorPending(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  return serviceWorker.evaluate(async (prefix) => {
    const values = await (globalThis as any).chrome.storage.session.get(null)
    return Object.keys(values).find((key) => key.startsWith(prefix))
  }, SPONSOR_WORKFLOW_STORAGE_KEYS.PENDING_PREFIX)
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("sidepanel switches common saved-item tabs and opens the matching management pages", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const now = Date.now()
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
    normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        accounts: [
          createStoredAccount({
            id: "sidepanel-account-1",
            site_name: "Sidepanel Account",
            site_url: "https://sidepanel-account.example.com",
            account_info: {
              id: "31",
              username: "sidepanel-user",
              access_token: "sidepanel-token",
            },
          }),
        ],
        bookmarks: [
          createStoredBookmark({
            id: "sidepanel-bookmark-1",
            name: "Sidepanel Docs",
            url: "https://sidepanel-docs.example.com",
          }),
        ],
      },
      now,
    ),
  )
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "sidepanel-profile-1",
      name: "Sidepanel Profile",
      baseUrl: "https://sidepanel-api.example.com",
      apiKey: "sk-sidepanel-profile",
    }),
  ])

  await page.goto(SIDEPANEL_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(page.getByText("All API Hub", { exact: true })).toBeVisible()
  await expect(
    page.getByTestId(getPopupViewTestId(POPUP_VIEW_TYPES.Accounts)),
  ).toBeVisible()
  await expect(page.getByText("Sidepanel Account")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Open Side Panel" }),
  ).toHaveCount(0)

  const accountsPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.ACCOUNT}`,
  })
  await page.getByRole("button", { name: "Account Management" }).click()
  const accountsPage = await accountsPagePromise
  installExtensionPageGuards(accountsPage)
  await waitForExtensionRoot(accountsPage)
  expect(new URL(accountsPage.url()).hash).toBe(`#${MENU_ITEM_IDS.ACCOUNT}`)
  await accountsPage.close()

  await page.getByRole("tab", { name: "Bookmarks" }).click()
  await expect(
    page.getByTestId(getPopupViewTestId(POPUP_VIEW_TYPES.Bookmarks)),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Sidepanel Docs" }),
  ).toBeVisible()

  const bookmarksPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.BOOKMARK}`,
  })
  await page.getByRole("button", { name: "Bookmark Management" }).click()
  const bookmarksPage = await bookmarksPagePromise
  installExtensionPageGuards(bookmarksPage)
  await waitForExtensionRoot(bookmarksPage)
  expect(new URL(bookmarksPage.url()).hash).toBe(`#${MENU_ITEM_IDS.BOOKMARK}`)
  await bookmarksPage.close()

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()
  await expect(page.getByText("Sidepanel Profile")).toBeVisible()

  const profilesPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  })
  await page.getByTestId(POPUP_TEST_IDS.openApiCredentialProfilesButton).click()
  const profilesPage = await profilesPagePromise
  installExtensionPageGuards(profilesPage)
  await waitForExtensionRoot(profilesPage)
  expect(new URL(profilesPage.url()).hash).toBe(
    `#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
})

test("sidepanel virtualizes long account lists and enables explicit reordering", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const now = Date.now()
  const accountCount = 80
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
    normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        accounts: Array.from({ length: accountCount }, (_, index) =>
          createStoredAccount({
            id: `sidepanel-virtual-account-${index}`,
            site_name: `Sidepanel Virtual Account ${String(index).padStart(2, "0")}`,
            site_url: `https://sidepanel-account-${index}.example.invalid`,
          }),
        ),
      },
      now,
    ),
  )

  await page.goto(SIDEPANEL_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const renderedRows = page.locator(
    `[data-testid^="${ACCOUNT_MANAGEMENT_LIST_ITEM_TEST_ID_PREFIX}"]`,
  )
  await expect.poll(() => renderedRows.count()).toBeGreaterThan(0)
  expect(await renderedRows.count()).toBeLessThan(accountCount)

  const lastRow = page.getByTestId(
    getAccountManagementListItemTestId(
      `sidepanel-virtual-account-${accountCount - 1}`,
    ),
  )
  await expect
    .poll(async () => {
      await page.evaluate(() =>
        window.scrollTo({ top: document.body.scrollHeight }),
      )
      return lastRow.isVisible()
    })
    .toBe(true)

  await page.evaluate(() => window.scrollTo({ top: 0 }))
  await page.getByRole("button", { name: "Reorder" }).click()
  await expect(
    page.getByRole("button", { name: "Done reordering" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Drag to reorder" }),
  ).toHaveCount(accountCount)
})

test("sidepanel opens saved account and bookmark targets in browser tabs", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const now = Date.now()
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
    normalizeAccountStorageConfigForWrite(
      {
        ...createDefaultAccountStorageConfig(now),
        accounts: [
          createStoredAccount({
            id: "sidepanel-open-account",
            site_name: "Sidepanel Open Account",
            site_url: "https://sidepanel-open-account.example.com",
            account_info: {
              id: "41",
              username: "sidepanel-open-user",
              access_token: "sidepanel-open-token",
            },
          }),
        ],
        bookmarks: [
          createStoredBookmark({
            id: "sidepanel-open-bookmark",
            name: "Sidepanel Open Bookmark",
            url: "https://sidepanel-open-bookmark.example.com/docs",
          }),
        ],
      },
      now,
    ),
  )

  await page.goto(SIDEPANEL_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByTestId(getPopupViewTestId(POPUP_VIEW_TYPES.Accounts)),
  ).toBeVisible()
  await page.getByRole("button", { name: "Sidepanel Open Account" }).click()
  await expectBrowserTabOpened(
    serviceWorker,
    "https://sidepanel-open-account.example.com/",
  )

  await page.getByRole("tab", { name: "Bookmarks" }).click()
  await expect(page.getByTestId(SITE_BOOKMARKS_TEST_IDS.listView)).toBeVisible()
  await page.getByRole("button", { name: "Sidepanel Open Bookmark" }).click()
  await expectBrowserTabOpened(
    serviceWorker,
    "https://sidepanel-open-bookmark.example.com/docs",
  )
})

test("sidepanel opens the model list for a saved API credential profile", async ({
  context,
  extensionId,
  page,
}) => {
  await context.route(
    "https://sidepanel-model-api.example.com/v1/models",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "gpt-sidepanel-mini" }, { id: "gpt-sidepanel-pro" }],
        }),
      }),
  )

  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "sidepanel-model-profile",
      name: "Sidepanel Model Profile",
      baseUrl: "https://sidepanel-model-api.example.com",
      apiKey: "sk-sidepanel-model-profile",
    }),
  ])

  await page.goto(SIDEPANEL_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await page.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Sidepanel Model Profile" }),
  ).toBeVisible()

  const modelsPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.MODELS}`,
    searchParams: {
      profileId: "sidepanel-model-profile",
    },
  })

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton)
    .click()

  const modelsPage = await modelsPagePromise
  installExtensionPageGuards(modelsPage)
  await waitForExtensionRoot(modelsPage)

  const targetUrl = new URL(modelsPage.url())
  expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.MODELS}`)
  expect(targetUrl.searchParams.get("profileId")).toBe(
    "sidepanel-model-profile",
  )
  await expect(modelsPage.getByText("gpt-sidepanel-mini")).toBeVisible()
  await expect(modelsPage.getByText("gpt-sidepanel-pro")).toBeVisible()
  await expect(
    modelsPage
      .getByText("Credential: Sidepanel Model Profile", { exact: false })
      .first(),
  ).toBeVisible()
})

test("sidepanel consumes pending sponsor add-account prefill", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedSponsorHandoff(serviceWorker, {
    kind: SPONSOR_WORKFLOW_KINDS.Account,
    prefill: {
      source: SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE,
      sponsorId: "e2e-supported-provider",
      siteType: SITE_TYPES.NEW_API,
      siteUrl: "https://sponsor-prefill.example.invalid",
      authType: AuthTypeEnum.AccessToken,
    },
  })

  await page.goto(SIDEPANEL_URL(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  const accountDialog = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog,
  )
  await expect(accountDialog).toBeVisible()
  await expect(
    accountDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput),
  ).toHaveValue("https://sponsor-prefill.example.invalid")
  await expect(
    accountDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.authTypeTrigger),
  ).toHaveAttribute("data-auth-type", AuthTypeEnum.AccessToken)
  await accountDialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.manualAddButton)
    .click()
  await expect(
    accountDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger),
  ).toHaveAttribute("data-site-type", SITE_TYPES.NEW_API)
  await expect.poll(() => getSponsorPending(serviceWorker)).toBeUndefined()
})

for (const kind of Object.values(SPONSOR_WORKFLOW_KINDS)) {
  test(`sidepanel receives ${kind} sponsor setup while already mounted`, async ({
    context,
    extensionId,
    extensionDir,
    page,
  }) => {
    await page.goto(SIDEPANEL_URL(extensionId))
    await waitForExtensionRoot(page)
    await expectPermissionOnboardingHidden(page)
    const serviceWorker = await getServiceWorker(context)
    const prefill =
      kind === SPONSOR_WORKFLOW_KINDS.Account
        ? {
            source: "sponsor",
            sponsorId: "e2e-provider",
            siteType: SITE_TYPES.NEW_API,
            siteUrl: "https://sponsor-setup.example.invalid",
            authType: AuthTypeEnum.AccessToken,
          }
        : kind === SPONSOR_WORKFLOW_KINDS.Bookmark
          ? {
              name: "Sponsor Setup",
              url: "https://sponsor-setup.example.invalid",
            }
          : {
              name: "Sponsor Setup",
              baseUrl: "https://sponsor-setup.example.invalid/v1",
              apiKeyCreateHint: "Create a key in the provider console",
              apiKeyCreateUrl: "https://sponsor-setup.example.invalid/keys",
            }
    await seedSponsorHandoff(serviceWorker, { kind, prefill })
    if (kind === SPONSOR_WORKFLOW_KINDS.Account) {
      const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
      await expect(dialog).toBeVisible()
      await expect(
        dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput),
      ).toHaveValue("https://sponsor-setup.example.invalid")
    } else {
      const dialog = page.getByTestId(
        kind === SPONSOR_WORKFLOW_KINDS.Bookmark
          ? SITE_BOOKMARKS_TEST_IDS.dialog
          : API_CREDENTIAL_PROFILES_TEST_IDS.dialog,
      )
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('input[value="Sponsor Setup"]')).toBeVisible()
      await expect(
        dialog.locator(
          `input[value="https://sponsor-setup.example.invalid${kind === SPONSOR_WORKFLOW_KINDS.ApiCredential ? "/v1" : ""}"]`,
        ),
      ).toBeVisible()
    }
    if (kind === SPONSOR_WORKFLOW_KINDS.ApiCredential) {
      const link = page.getByRole("link", { name: "Get API key" })
      await expect(link).toHaveAttribute(
        "href",
        "https://sponsor-setup.example.invalid/keys",
      )
      await expect(link).toHaveAttribute("target", "_blank")
      const visualDir =
        process.env.AAH_VISUAL_CAPTURE_DIR ||
        process.env.AAH_API_HINT_VISUAL_DIR
      if (visualDir) {
        await captureVisualViews({
          page,
          ready: link,
          directory: visualDir,
          id: "hint",
          extensionDir,
          views: [
            { id: "light-380", width: 380, height: 700, theme: "light" },
            { id: "dark-320", width: 320, height: 700, theme: "dark" },
          ],
        })
      }
    }
    await expect.poll(() => getSponsorPending(serviceWorker)).toBeUndefined()
  })
}

test("Options account setup restores sponsor hints from its own destination URL", async ({
  extensionId,
  page,
}) => {
  const params = new URLSearchParams({
    action: "add",
    source: "sponsor",
    sponsorId: "e2e-provider",
    siteType: SITE_TYPES.NEW_API,
    siteUrl: "https://sponsor-setup.example.invalid",
    authType: AuthTypeEnum.AccessToken,
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?${params}#${MENU_ITEM_IDS.ACCOUNT}`,
  )
  const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput),
  ).toHaveValue("https://sponsor-setup.example.invalid")
})

const sponsorTest = test.extend<{ sponsorSite: string }>({
  sponsorSite: async ({ extensionId }, runFixture) => {
    void extensionId
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" })
      response.end(
        "<!doctype html><html><body><h1>Provider registration</h1><label>Email <input></label></body></html>",
      )
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      await runFixture(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      )
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  },
})

for (const destination of ["sidepanel", "unsupported", "rejected"] as const) {
  sponsorTest(
    `popup sponsor click tries ${destination} without Options fallback`,
    async ({ context, extensionId, page, sponsorSite }) => {
      const serviceWorker = await getServiceWorker(context)
      if (destination !== "sidepanel") {
        await page.addInitScript((mode) => {
          ;(globalThis as any).chrome.sidePanel.open =
            mode === "unsupported"
              ? undefined
              : () => Promise.reject(new Error("Unavailable"))
        }, destination)
      }
      const payload = {
        schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
        items: [
          {
            id: "e2e-provider",
            locales: {
              en: {
                enabled: true,
                rank: 1,
                supportStatus: "supported",
                name: "E2E Sponsor",
                tagline: "Test setup handoff",
                links: {
                  primary: `${sponsorSite}/register`,
                },
                actions: {
                  addAccount: {
                    siteType: SITE_TYPES.NEW_API,
                    siteUrl: sponsorSite,
                  },
                },
              },
            },
          },
        ],
      }
      await setPlasmoStorageValue(
        serviceWorker,
        STORAGE_KEYS.SPONSOR_CATALOG_VERSIONED_CACHE,
        {
          [`${SPONSOR_CATALOG_SCHEMA_VERSION}:${SPONSOR_REMOTE_CATALOG_V5_URL}`]:
            {
              schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
              sourceUrl: SPONSOR_REMOTE_CATALOG_V5_URL,
              fetchedAt: Date.now(),
              payload,
            },
        },
        { lock: STORAGE_LOCKS.SPONSOR_CATALOG },
      )
      await page.goto(`chrome-extension://${extensionId}/popup.html`)
      await waitForExtensionRoot(page)
      // Chrome 114 exposes sidePanel but cannot open it programmatically.
      // Keep verifying the registration/no-Options flow on that support floor.
      const canOpenSidePanel = await page.evaluate(
        () => typeof (globalThis as any).chrome.sidePanel?.open === "function",
      )
      await page
        .getByRole("button", {
          name: /Continue adding this account: E2E Sponsor/,
        })
        .click()
      await expectBrowserTabOpened(serviceWorker, `${sponsorSite}/register`)
      if (destination === "sidepanel" && canOpenSidePanel) {
        await expect
          .poll(() =>
            serviceWorker.evaluate(async () => {
              const contexts = await (
                globalThis as any
              ).chrome.runtime.getContexts({
                contextTypes: ["SIDE_PANEL"],
              })
              return contexts.length
            }),
          )
          .toBe(1)
      }
      const tabs = await serviceWorker.evaluate(async () =>
        (globalThis as any).chrome.tabs.query({}),
      )
      expect(
        tabs.filter((tab: { url?: string }) =>
          tab.url?.includes("/options.html"),
        ),
      ).toHaveLength(0)
      const provider = context
        .pages()
        .find((candidate) => candidate.url() === `${sponsorSite}/register`)!
      await expect(
        provider.getByRole("heading", { name: "Provider registration" }),
      ).toBeVisible()
      await expect(
        provider.getByRole("button", { name: "Return to setup" }),
      ).toHaveCount(0)
      const reopenedPopup = await context.newPage()
      await reopenedPopup.goto(`chrome-extension://${extensionId}/popup.html`)
      await waitForExtensionRoot(reopenedPopup)
      await expect(
        reopenedPopup.getByRole("button", { name: "Return to setup" }),
      ).toHaveCount(0)
      if (destination === "unsupported") {
        const visualDir = process.env.AAH_SPONSOR_VISUAL_DIR
        if (visualDir) {
          await mkdir(visualDir, { recursive: true })
          await reopenedPopup.screenshot({
            path: path.join(visualDir, "popup-after-click.png"),
            animations: "disabled",
          })
          await provider.screenshot({
            path: path.join(visualDir, "provider-after-click.png"),
            animations: "disabled",
          })
        }
      }
      await expect.poll(() => getSponsorPending(serviceWorker)).toBeUndefined()
    },
  )
}
