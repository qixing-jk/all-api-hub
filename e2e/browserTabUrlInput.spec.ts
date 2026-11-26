import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { SITE_BOOKMARKS_TEST_IDS } from "~/features/SiteBookmarks/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

const currentOrigin = "https://current-tab.test"
const currentUrl = `${currentOrigin}/console`
const otherOrigin = "https://other-tab.test"
const otherUrl = `${otherOrigin}/guide?view=full#setup`
const chooseTabLabel = "Choose from recently active tabs"

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await seedUserPreferences(await getServiceWorker(context), {
    language: "en",
    openChangelogOnUpdate: false,
    autoFillCurrentSiteUrlOnAccountAdd: true,
  })
  await context.route(`${currentOrigin}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Current Console</title>",
    }),
  )
  await context.route(`${otherOrigin}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Other Guide</title>",
    }),
  )
  const otherTab = await context.newPage()
  await otherTab.goto(otherUrl)
  const currentTab = await context.newPage()
  await currentTab.goto(currentUrl)

  // Keep the extension surface in its own tab so the fixture page can stay
  // active while the test interacts with the extension UI.
  await currentTab.bringToFront()
})

for (const { surface, path, width, height } of [
  { surface: "popup", path: POPUP_PAGE_PATH, width: 390, height: 600 },
  { surface: "side panel", path: SIDEPANEL_PAGE_PATH, width: 320, height: 790 },
  {
    surface: "options",
    path: `${OPTIONS_PAGE_PATH}#account`,
    width: 1200,
    height: 850,
  },
]) {
  test(`chooses another tab and restores the current site when adding an account from ${surface}`, async ({
    page,
    extensionId,
    extensionDir,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto(`chrome-extension://${extensionId}/${path}`)
    await waitForExtensionRoot(page)
    await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()

    const dialog = page.getByRole("dialog")
    const input = dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
    const useCurrent = dialog.getByRole("button", { name: "Use Current Site" })
    const chooser = dialog.getByRole("button", { name: chooseTabLabel })
    await expect(input).toHaveValue(currentOrigin)
    await expect(useCurrent).toBeHidden()
    await input.fill("https://manual.test")
    await expect(useCurrent).toBeEnabled()
    const checkpoint = `account-${surface.replace(" ", "-")}`
    await captureVisualViews({
      page,
      ready: useCurrent,
      captureTarget: dialog,
      id: checkpoint,
      extensionDir,
    })

    const tooltip = page.getByRole("tooltip")
    if (surface === "popup") {
      const clear = dialog.getByRole("button", { name: "Clear", exact: true })
      await clear.hover()
      await expect(tooltip).toHaveText("Clear")
      await expect(clear).not.toHaveAttribute("title")
      await page.keyboard.press("Escape")
      await expect(tooltip).toBeHidden()

      await input.press("Tab")
      await expect(clear).toBeFocused()
      await page.keyboard.press("Tab")
      await expect(useCurrent).toBeFocused()
      await expect(tooltip).toContainText(currentOrigin)
      await captureVisualViews({
        page,
        ready: tooltip,
        id: "account-popup-current-site-tooltip",
        extensionDir,
      })
      await page.keyboard.press("Escape")
      await expect(tooltip).toBeHidden()
    }

    await expect(chooser).toBeVisible()
    const useCurrentText = useCurrent.getByText("Use Current Site")
    if (surface === "options") {
      await expect(useCurrentText).toBeVisible()
    } else {
      await expect(useCurrentText).toBeHidden()
    }
    await chooser.hover()
    await expect(tooltip).toHaveText(chooseTabLabel)
    await chooser.click()
    const other = page.getByRole("option", {
      name: `Other Guide — ${otherOrigin}`,
    })
    await expect(other).toBeVisible()
    await expect(page.getByText(chooseTabLabel, { exact: true })).toBeHidden()
    await captureVisualViews({
      page,
      ready: other,
      id: `${checkpoint}-open`,
      extensionDir,
    })
    await other.click()
    await expect(input).toHaveValue(otherOrigin)
    await useCurrent.click()
    await expect(input).toHaveValue(currentOrigin)
    await expect(chooser).toBeEnabled()
  })
}

test("chooses a full tab URL for a bookmark alongside the current-page action", async ({
  page,
  extensionId,
  extensionDir,
}) => {
  await page.setViewportSize({ width: 1200, height: 850 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#bookmark`,
  )
  await waitForExtensionRoot(page)
  await page.getByTestId(SITE_BOOKMARKS_TEST_IDS.addButton).click()

  const dialog = page.getByTestId(SITE_BOOKMARKS_TEST_IDS.dialog)
  const input = dialog.getByPlaceholder("https://example.com/...")
  const useCurrent = dialog.getByRole("button", { name: "Use current page" })
  const chooser = dialog.getByRole("button", { name: chooseTabLabel })
  await expect(useCurrent).toBeEnabled()
  await captureVisualViews({
    page,
    ready: useCurrent,
    captureTarget: dialog,
    id: "bookmark",
    extensionDir,
  })

  await expect(chooser).toBeVisible()
  await chooser.hover()
  const tooltip = page.getByRole("tooltip")
  await expect(tooltip).toHaveText(chooseTabLabel)
  await captureVisualViews({
    page,
    ready: tooltip,
    id: "bookmark-recent-tabs-tooltip",
    extensionDir,
  })
  await chooser.click()
  const other = page.getByRole("option", { name: `Other Guide — ${otherUrl}` })
  await expect(other).toBeVisible()
  await expect(page.getByText(chooseTabLabel, { exact: true })).toBeHidden()
  await captureVisualViews({
    page,
    ready: other,
    id: "bookmark-open",
    extensionDir,
  })
  await other.click()
  await expect(input).toHaveValue(otherUrl)
  await expect(dialog.getByPlaceholder("e.g. Admin Console")).toHaveValue(
    "Other Guide",
  )
  await useCurrent.click()
  await expect(input).toHaveValue(currentUrl)
  await expect(chooser).toBeEnabled()
})
