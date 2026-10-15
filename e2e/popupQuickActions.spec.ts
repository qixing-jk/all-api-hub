import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

type ExtensionTabSnapshot = {
  id?: number
  url?: string
}

async function queryOptionsTabs(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  extensionId: string,
): Promise<ExtensionTabSnapshot[]> {
  return await serviceWorker.evaluate(
    async ({ targetExtensionId, optionsPath }) => {
      const chromeApi = (globalThis as any).chrome
      const tabs = await chromeApi.tabs.query({})

      return tabs
        .filter((tab: { url?: string }) => {
          if (!tab.url) return false

          try {
            const url = new URL(tab.url)
            return (
              url.protocol === "chrome-extension:" &&
              url.host === targetExtensionId &&
              url.pathname === `/${optionsPath}`
            )
          } catch {
            return false
          }
        })
        .map((tab: { id?: number; url?: string }) => ({
          id: tab.id,
          url: tab.url,
        }))
    },
    { targetExtensionId: extensionId, optionsPath: OPTIONS_PAGE_PATH },
  )
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("opens basic settings from the popup header", async ({
  context,
  extensionId,
  page,
}) => {
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  const targetPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: "options.html",
    hash: `#${MENU_ITEM_IDS.BASIC}`,
  })

  await page.getByRole("button", { name: "Settings" }).click()

  const targetPage = await targetPagePromise
  installExtensionPageGuards(targetPage)
  await waitForExtensionRoot(targetPage)

  await expect(targetPage).toHaveURL(/options\.html#basic$/)
  await expect(
    targetPage
      .getByTestId(BASIC_SETTINGS_TEST_IDS.page)
      .getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible()
})

test("reuses an already-open settings tab when opening settings from the popup", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const existingOptionsUrl = `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`

  await page.goto(existingOptionsUrl)
  await waitForExtensionRoot(page)
  await expect(
    page
      .getByTestId(BASIC_SETTINGS_TEST_IDS.page)
      .getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible()

  const initialOptionsTabs = await queryOptionsTabs(serviceWorker, extensionId)
  const existingOptionsTab = initialOptionsTabs.find(
    (tab) => tab.url === existingOptionsUrl,
  )

  expect(existingOptionsTab?.id).toEqual(expect.any(Number))

  const popupPage = await context.newPage()
  installExtensionPageGuards(popupPage)
  await forceExtensionLanguage(popupPage, "en")
  await popupPage.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(popupPage)

  await popupPage.getByRole("button", { name: "Settings" }).click()

  await expect
    .poll(async () => {
      const optionsTabs = await queryOptionsTabs(serviceWorker, extensionId)
      const reusedTab = optionsTabs.find(
        (tab) => tab.id === existingOptionsTab?.id,
      )

      if (!reusedTab?.url) {
        return {
          count: optionsTabs.length,
          hash: "",
          hasRefresh: false,
          hasTimestamp: false,
          reused: false,
        }
      }

      const url = new URL(reusedTab.url)

      return {
        count: optionsTabs.length,
        hash: url.hash,
        hasRefresh: url.searchParams.get("refresh") === "true",
        hasTimestamp: Boolean(url.searchParams.get("t")),
        reused: true,
      }
    })
    .toEqual({
      count: initialOptionsTabs.length,
      hash: `#${MENU_ITEM_IDS.BASIC}`,
      hasRefresh: true,
      hasTimestamp: true,
      reused: true,
    })

  await expect(page).toHaveURL((url) => {
    return (
      url.hash === `#${MENU_ITEM_IDS.BASIC}` &&
      url.searchParams.get("refresh") === "true" &&
      Boolean(url.searchParams.get("t"))
    )
  })
  await expect(
    page
      .getByTestId(BASIC_SETTINGS_TEST_IDS.page)
      .getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible()
})

test("opens the key-management destination from the popup quick action", async ({
  context,
  extensionId,
  page,
}) => {
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount(),
  ])
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  const targetPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: "options.html",
    hash: "#keys",
  })

  await page.getByRole("button", { name: "Key Management" }).click()

  const targetPage = await targetPagePromise
  installExtensionPageGuards(targetPage)
  await waitForExtensionRoot(targetPage)

  await expect(targetPage).toHaveURL(/options\.html#keys$/)
})

test("opens the model-management destination from the popup quick action", async ({
  context,
  extensionId,
  page,
}) => {
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount(),
  ])
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  const targetPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: "options.html",
    hash: "#models",
  })

  await page.getByRole("button", { name: "Model List" }).click()

  const targetPage = await targetPagePromise
  installExtensionPageGuards(targetPage)
  await waitForExtensionRoot(targetPage)

  await expect(targetPage).toHaveURL(/options\.html#models$/)
})

test("preserves run-now routing when opening auto check-in from the popup", async ({
  context,
  extensionId,
  page,
}) => {
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount(),
  ])
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  const targetPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: "options.html",
    hash: "#autoCheckin",
    searchParams: {
      runNow: "true",
    },
  })

  await page.getByRole("button", { name: "Quick check-in" }).click()

  const targetPage = await targetPagePromise
  installExtensionPageGuards(targetPage)
  await waitForExtensionRoot(targetPage)

  expect(new URL(targetPage.url()).hash).toBe("#autoCheckin")
})
