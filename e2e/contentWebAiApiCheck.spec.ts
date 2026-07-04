import type { Locator, Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { WEB_AI_API_CHECK_TEST_IDS } from "~/entrypoints/content/webAiApiCheck/testIds"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileVerifyProbeTestId,
} from "~/features/ApiCredentialProfiles/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const TEST_PAGE_URL = "https://api-console.example.test/console"
const TEST_PAGE_ORIGIN = "https://api-console.example.test"
const API_BASE_URL = "https://api-console.example.test/api"
const API_KEY = "sk-e2e-content-api-check-key"

async function seedAutoDetectApiCheckPreferences(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  await seedUserPreferences(serviceWorker, {
    language: "en",
    webAiApiCheck: {
      enabled: true,
      contextMenu: {
        enabled: true,
      },
      autoDetect: {
        enabled: true,
        urlWhitelist: {
          patterns: ["^https://api-console\\.example\\.test/console"],
        },
      },
    },
  })
}

async function openApiCheckModalFromCopiedCredentials(page: Page): Promise<{
  contentHost: Locator
  modal: Locator
}> {
  await page.goto(TEST_PAGE_URL)

  const selectedCredentialText = `base_url=${API_BASE_URL}\napi_key=${API_KEY}`
  await page.locator("#copy-credentials").evaluate((target, text) => {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(target)
    selection?.removeAllRanges()
    selection?.addRange(range)

    const clipboardData = new DataTransfer()
    clipboardData.setData("text", text)
    target.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    )
  }, selectedCredentialText)

  const contentHost = page.locator("all-api-hub-redemption-toast")
  await contentHost.getByRole("button", { name: "Open" }).click()

  const modal = contentHost.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
  await expect(modal).toBeVisible()
  await expect(modal.getByRole("textbox", { name: "Base URL" })).toHaveValue(
    API_BASE_URL,
  )

  return { contentHost, modal }
}

async function openApiCheckModalFromClipboardRead(page: Page): Promise<{
  contentHost: Locator
  modal: Locator
}> {
  await page.goto(TEST_PAGE_URL)
  await page.evaluate(
    (clipboardText) => navigator.clipboard.writeText(clipboardText),
    `base_url=${API_BASE_URL}\napi_key=${API_KEY}`,
  )
  await page.evaluate(() => window.getSelection()?.removeAllRanges())

  await page.getByRole("button", { name: "Copy credentials" }).click()

  const contentHost = page.locator("all-api-hub-redemption-toast")
  await contentHost.getByRole("button", { name: "Open" }).click()

  const modal = contentHost.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
  await expect(modal).toBeVisible()
  await expect(modal.getByRole("textbox", { name: "Base URL" })).toHaveValue(
    API_BASE_URL,
  )

  return { contentHost, modal }
}

async function saveCredentialProfileFromModal(
  contentHost: Locator,
  modal: Locator,
) {
  await modal
    .getByTestId(WEB_AI_API_CHECK_TEST_IDS.saveToProfilesButton)
    .click()
  await expect(
    contentHost.getByText(
      "Saved api-console.example.test to API credential library.",
    ),
  ).toBeVisible()
}

async function sendApiCheckContextMenuTrigger(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  params: {
    pageUrl: string
    selectionText: string
  },
) {
  await expect
    .poll(async () => {
      return await serviceWorker.evaluate(
        async ({ action, pageUrl, selectionText }) => {
          const chromeApi = (globalThis as any).chrome
          const tabs = await chromeApi.tabs.query({})
          const targetTab = tabs.find(
            (tab: { id?: number; url?: string }) => tab.url === pageUrl,
          )

          if (targetTab?.id == null) {
            return { success: false, error: "Target tab not found" }
          }

          return await new Promise<{ success: boolean; error?: string }>(
            (resolve) => {
              chromeApi.tabs.sendMessage(
                targetTab.id,
                {
                  action,
                  pageUrl,
                  selectionText,
                },
                () => {
                  const error = chromeApi.runtime?.lastError
                  const errorMessage =
                    typeof error?.message === "string" ? error.message : ""
                  if (errorMessage.includes("message port closed")) {
                    resolve({ success: true })
                    return
                  }

                  resolve(
                    errorMessage
                      ? { success: false, error: errorMessage }
                      : { success: true },
                  )
                },
              )
            },
          )
        },
        {
          action: RuntimeActionIds.ApiCheckContextMenuTrigger,
          pageUrl: params.pageUrl,
          selectionText: params.selectionText,
        },
      )
    })
    .toMatchObject({ success: true })
}

async function installClipboardReadPermissionBridge(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
) {
  await serviceWorker.evaluate(() => {
    const chromeApi = (globalThis as any).chrome
    const browserApi = (globalThis as any).browser
    const originalChromeContains = chromeApi?.permissions?.contains?.bind(
      chromeApi.permissions,
    )
    const originalBrowserContains = browserApi?.permissions?.contains?.bind(
      browserApi.permissions,
    )

    const containsWithClipboardRead = (
      details: { permissions?: string[] },
      callback?: (result: boolean) => void,
    ) => {
      // Chromium does not resolve this optional-permission prompt reliably in the
      // headless extension harness; keep the test focused on the content read path.
      if (details.permissions?.includes("clipboardRead")) {
        callback?.(true)
        return Promise.resolve(true)
      }

      if (originalChromeContains) {
        return originalChromeContains(details, callback)
      }

      if (originalBrowserContains) {
        return originalBrowserContains(details, callback)
      }

      callback?.(false)
      return Promise.resolve(false)
    }

    if (chromeApi?.permissions) {
      chromeApi.permissions.contains = containsWithClipboardRead
    }
    if (browserApi?.permissions) {
      browserApi.permissions.contains = containsWithClipboardRead
    }
  })
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")

  await context.route(`${TEST_PAGE_URL}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html>
        <html lang="en">
          <head>
            <title>API Console Fixture</title>
          </head>
          <body>
            <button id="copy-credentials">
              base_url=${API_BASE_URL}
              api_key=${API_KEY}
            </button>
            <button id="copy-from-clipboard" data-copy>
              Copy credentials
            </button>
          </body>
        </html>`,
    })
  })

  await context.route(`${API_BASE_URL}/v1/models`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "ok",
        data: [{ id: "gpt-4o-mini" }],
      }),
    })
  })
})

test("turns selected web API credentials into a verified profile and model catalog source", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedAutoDetectApiCheckPreferences(serviceWorker)

  const { contentHost, modal } =
    await openApiCheckModalFromCopiedCredentials(page)
  await saveCredentialProfileFromModal(contentHost, modal)

  const rawProfiles = await getPlasmoStorageRawValue<string>(
    serviceWorker,
    STORAGE_KEYS.API_CREDENTIAL_PROFILES,
  )
  const profileConfig = JSON.parse(rawProfiles) as {
    profiles: Array<{
      id: string
      name: string
      baseUrl: string
      apiKey: string
    }>
  }

  expect(profileConfig.profiles).toEqual([
    expect.objectContaining({
      name: "api-console.example.test",
      baseUrl: API_BASE_URL,
      apiKey: API_KEY,
    }),
  ])

  const profileId = profileConfig.profiles[0].id
  expect(profileId).toBeTruthy()

  const popupPage = await context.newPage()
  installExtensionPageGuards(popupPage)
  await forceExtensionLanguage(popupPage, "en")
  await popupPage.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(popupPage)

  await popupPage.getByTestId(POPUP_TEST_IDS.apiCredentialProfilesTab).click()
  await expect(
    popupPage.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.popupView),
  ).toBeVisible()
  await expect(
    popupPage.getByRole("heading", { name: "api-console.example.test" }),
  ).toBeVisible()

  await popupPage.getByRole("button", { name: "Verify API" }).click()
  const verificationDialog = popupPage
    .getByRole("heading", { name: "API Verification" })
    .locator("xpath=ancestor::*[.//button[normalize-space()='Close']][1]")
  const modelsProbe = popupPage.getByTestId(
    getApiCredentialProfileVerifyProbeTestId("models"),
  )
  await expect(
    popupPage.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId),
  ).toBeVisible()
  await modelsProbe.getByRole("button", { name: "Run" }).click()
  await expect(modelsProbe).toContainText("Pass")
  await expect(modelsProbe).toContainText("Fetched 1 model.")
  await verificationDialog.getByText("Close", { exact: true }).click()
  await expect(verificationDialog).toHaveCount(0)

  const modelsPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.MODELS}`,
    searchParams: { profileId },
  })

  await popupPage
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton)
    .click()

  const modelsPage = await modelsPagePromise
  installExtensionPageGuards(modelsPage)
  await waitForExtensionRoot(modelsPage)

  const targetUrl = new URL(modelsPage.url())
  expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.MODELS}`)
  expect(targetUrl.searchParams.get("profileId")).toBe(profileId)

  await expect(
    modelsPage.getByRole("heading", { name: "Model List" }),
  ).toBeVisible()
  await expect(modelsPage.getByText("gpt-4o-mini")).toBeVisible()
  await expect(
    modelsPage
      .getByText("Profile: api-console.example.test", { exact: false })
      .first(),
  ).toBeVisible()
})

test("opens the API check modal from the background context-menu message path", async ({
  context,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    language: "en",
    webAiApiCheck: {
      enabled: true,
      contextMenu: {
        enabled: true,
      },
      autoDetect: {
        enabled: false,
        urlWhitelist: {
          patterns: [],
        },
      },
    },
  })

  await page.goto(TEST_PAGE_URL)

  const selectedCredentialText = `base_url=${API_BASE_URL}\napi_key=${API_KEY}`
  await sendApiCheckContextMenuTrigger(serviceWorker, {
    pageUrl: TEST_PAGE_URL,
    selectionText: selectedCredentialText,
  })

  const contentHost = page.locator("all-api-hub-redemption-toast")
  const modal = contentHost.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
  await expect(modal).toBeVisible()
  await expect(modal.getByRole("textbox", { name: "Base URL" })).toHaveValue(
    API_BASE_URL,
  )
})

test("reads copied web API credentials from the clipboard after clicking a copy-like control", async ({
  context,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedAutoDetectApiCheckPreferences(serviceWorker)
  await installClipboardReadPermissionBridge(serviceWorker)

  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: TEST_PAGE_ORIGIN,
  })

  const { modal } = await openApiCheckModalFromClipboardRead(page)
  await expect(modal.getByRole("textbox", { name: "API key" })).toHaveValue(
    API_KEY,
  )
})

test("opens API credential profiles from the content save success toast", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedAutoDetectApiCheckPreferences(serviceWorker)

  const { contentHost, modal } =
    await openApiCheckModalFromCopiedCredentials(page)
  await saveCredentialProfileFromModal(contentHost, modal)

  const profilesPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  })

  await contentHost
    .getByTestId(WEB_AI_API_CHECK_TEST_IDS.openApiProfilesToastButton)
    .click()

  const profilesPage = await profilesPagePromise
  installExtensionPageGuards(profilesPage)
  await waitForExtensionRoot(profilesPage)

  const targetUrl = new URL(profilesPage.url())
  expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`)

  await expect(
    profilesPage.getByRole("heading", { name: "API credential library" }),
  ).toBeVisible()
  await expect(
    profilesPage.getByRole("heading", { name: "api-console.example.test" }),
  ).toBeVisible()
})
