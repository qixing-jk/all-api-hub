import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { SITE_BOOKMARKS_TEST_IDS } from "~/features/SiteBookmarks/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { UserPreferences } from "~/services/preferences/preferencesSchema"
import type { AccountStorageConfig } from "~/types"
import { buildOriginWhitelistPattern } from "~/utils/core/urlWhitelist"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { openSiteFaviconFixture } from "~~/e2e/utils/siteFaviconFixture"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

// Discard creates a dormant replacement target. Viewport emulation on that
// target disconnects older Chromium builds; size only the live extension page.
test.use({ viewport: null })

test("uses a sleeping tab's cached icon across site pickers and saves the right URLs", async ({
  page,
  context,
  extensionId,
  extensionDir,
}) => {
  const site = await openSiteFaviconFixture(
    Number(process.env.AAH_TEST_SITE_FAVICON_PORT ?? 0),
  )
  try {
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    const worker = await getServiceWorker(context)
    const customPattern = "^https://elsewhere\\.example/redeem$"
    await seedUserPreferences(worker, {
      language: "en",
      openChangelogOnUpdate: false,
      redemptionAssist: { urlWhitelist: { patterns: [customPattern] } },
    })
    const tab = await context.newPage()
    await tab.goto(site.url)
    await page.bringToFront()
    const optionsUrl = `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`
    await page.goto(`${optionsUrl}#account`)

    await expect
      .poll(async () =>
        worker.evaluate(
          async ({ url, faviconUrl }) => {
            const tabs = await chrome.tabs.query({})
            return tabs.some(
              (tab) => tab.url === url && tab.favIconUrl === faviconUrl,
            )
          },
          { url: site.url, faviconUrl: site.faviconUrl },
        ),
      )
      .toBe(true)
    expect(
      await worker.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({})
        const ownedTab = tabs.find((tab) => tab.url === url)
        return (await chrome.tabs.discard(ownedTab!.id)).discarded
      }, site.url),
    ).toBe(true)

    const originOption = page.getByRole("option", {
      name: `${site.title} — ${site.origin}`,
      exact: true,
    })
    const bookmarkOption = page.getByRole("option", {
      name: `${site.title} — ${site.url}`,
      exact: true,
    })
    const expectedIcon = new URL("/_favicon/", optionsUrl)
    expectedIcon.searchParams.set("pageUrl", site.url)
    expectedIcon.searchParams.set("size", "32")
    const expectCachedIcon = async (targetOption = originOption) => {
      const image = targetOption.locator("img")
      await expect(image).toHaveAttribute("src", expectedIcon.href)
      await expect
        .poll(() =>
          image.evaluate((img: HTMLImageElement) => {
            if (!img.complete || !img.naturalWidth) return []
            const canvas = document.createElement("canvas")
            const context = canvas.getContext("2d")!
            context.drawImage(img, 0, 0)
            return [...context.getImageData(8, 8, 1, 1).data]
          }),
        )
        .toEqual([230, 41, 85, 255])
    }

    await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
    const accountDialog = page.getByRole("dialog")
    await accountDialog
      .getByRole("button", { name: "Choose from recently active tabs" })
      .click()
    await expectCachedIcon(originOption)
    await captureVisualViews({
      page,
      ready: originOption,
      captureTarget: accountDialog,
      id: "account",
      extensionDir,
    })
    await originOption.click()
    await expect(
      accountDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput),
    ).toHaveValue(site.origin)

    await page.goto(`${optionsUrl}#bookmark`)
    await page.getByTestId(SITE_BOOKMARKS_TEST_IDS.addButton).click()
    const bookmarkDialog = page.getByTestId(SITE_BOOKMARKS_TEST_IDS.dialog)
    await captureVisualViews({
      page,
      ready: bookmarkDialog.getByRole("combobox", { name: /^URL/ }),
      captureTarget: bookmarkDialog,
      id: "bookmark-field",
      extensionDir,
    })
    await bookmarkDialog
      .getByRole("button", { name: "Choose from recently active tabs" })
      .click()
    await expectCachedIcon(bookmarkOption)
    await captureVisualViews({
      page,
      ready: bookmarkOption,
      captureTarget: bookmarkDialog,
      id: "bookmark",
      extensionDir,
    })
    await bookmarkOption.click()
    await expect(
      bookmarkDialog.getByPlaceholder("e.g. Admin Console"),
    ).toHaveValue(site.title)
    await expect(
      bookmarkDialog.getByRole("combobox", { name: /^URL/ }),
    ).toHaveValue(site.url)
    await bookmarkDialog
      .getByTestId(SITE_BOOKMARKS_TEST_IDS.dialogSaveButton)
      .click()
    await expect
      .poll(async () => {
        const stored = await getPlasmoStorageJsonValue<AccountStorageConfig>(
          worker,
          STORAGE_KEYS.ACCOUNTS,
        )
        return stored?.bookmarks
      })
      .toEqual([expect.objectContaining({ name: site.title, url: site.url })])

    await page.goto(`${optionsUrl}?tab=webAiApiCheck#basic`)
    await page
      .getByRole("button", { name: "Add to whitelist", exact: true })
      .click()
    const rules = page.getByRole("dialog", { name: "Add to whitelist" })
    await rules
      .getByRole("combobox", { name: "Choose from open tabs" })
      .fill(site.title)
    await expectCachedIcon(originOption)
    await captureVisualViews({
      page,
      ready: originOption,
      captureTarget: rules,
      id: "web-api",
      extensionDir,
    })
    await originOption.click()
    await expect(
      rules.getByRole("textbox", { name: "Rule content" }),
    ).toHaveValue(`*://${new URL(site.origin).host}/*`)

    await page.goto(`${optionsUrl}?tab=checkinRedeem#basic`)
    const whitelist = page.locator("#redemption-assist-url-whitelist-patterns")
    const picker = whitelist.getByRole("combobox", {
      name: "Choose from open tabs",
    })
    await captureVisualViews({
      page,
      ready: picker,
      captureTarget: whitelist,
      id: "redemption-field",
      extensionDir,
    })
    await picker.fill(site.title)
    await expectCachedIcon(originOption)
    await captureVisualViews({
      page,
      ready: originOption,
      captureTarget: whitelist,
      id: "redemption",
      extensionDir,
    })
    await originOption.click()
    const originPattern = buildOriginWhitelistPattern(site.origin)
    await expect(whitelist.getByRole("textbox")).toHaveValue(
      `${customPattern}\n${originPattern}`,
    )
    await whitelist.getByRole("button", { name: "Save", exact: true }).click()
    const readPatterns = async () => {
      const preferences = await getPlasmoStorageJsonValue<UserPreferences>(
        worker,
        STORAGE_KEYS.USER_PREFERENCES,
      )
      return preferences?.redemptionAssist?.urlWhitelist.patterns
    }
    await expect.poll(readPatterns).toEqual([customPattern, originPattern])
    await page.reload()
    await picker.fill(site.title)
    await expect(originOption).toHaveAttribute("aria-selected", "true")
    await originOption.click()
    await whitelist.getByRole("button", { name: "Save", exact: true }).click()
    await expect.poll(readPatterns).toEqual([customPattern])
  } finally {
    await site.close()
  }
})
