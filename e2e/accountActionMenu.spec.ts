import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import en from "~/locales/en/account.json" with { type: "json" }
import zh from "~/locales/zh-CN/account.json" with { type: "json" }
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const width of [320, 390, 1100]) {
  for (const language of ["en", "zh-CN"]) {
    test(`account menu groups remain reachable at ${width}px (${language})`, async ({
      context,
      page,
      extensionId,
    }, testInfo) => {
      const copy = (language === "en" ? en : zh).actions
      await page.setViewportSize({ width, height: 850 })
      installExtensionPageGuards(page)
      await forceExtensionLanguage(page, language)
      await stubLlmMetadataIndex(context)
      await stubNewApiSiteRoutes(context, {
        baseUrl: "https://menu.example.invalid",
      })
      await seedStoredAccounts(await getServiceWorker(context), [
        createStoredAccount({
          id: "menu-account",
          site_name: "Menu Account",
          site_url: "https://menu.example.invalid",
        }),
      ])
      await seedUserPreferences(await getServiceWorker(context), {
        managedSiteType: "new-api",
        newApi: {
          baseUrl: "https://admin.example.invalid",
          adminToken: "test-only-token",
          userId: "1",
        },
      })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ACCOUNT}`,
      )
      await waitForExtensionRoot(page)
      await expectPermissionOnboardingHidden(page)
      const row = page.getByTestId(
        getAccountManagementListItemTestId("menu-account"),
      )
      await row.hover()
      const more = page.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton,
      )
      await more.click()
      const root = page.getByRole("menu")
      expect(await root.getByRole("menuitem").count()).toBeLessThanOrEqual(12)
      await expect(
        page.getByRole("menuitem", { name: copy.keyManagement, exact: true }),
      ).toBeVisible()
      await expect(root.getByRole("menuitem").nth(0)).toHaveAccessibleName(
        copy.keyList,
      )
      await expect(root.getByRole("menuitem").nth(1)).toHaveAccessibleName(
        copy.keyManagement,
      )
      await expect(root.getByRole("menuitem").nth(2)).toHaveAccessibleName(
        copy.modelManagement,
      )
      await expect(root.getByRole("menuitem").nth(3)).toHaveAccessibleName(
        copy.locateManagedSiteChannel,
      )
      await expect(
        root.getByRole("menuitem", { name: copy.usageLog, exact: true }),
      ).toHaveCount(0)
      await expect(
        root.getByRole("menuitem", { name: copy.redeemPage, exact: true }),
      ).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath("menu.png"),
        animations: "disabled",
      })
      const relatedPages = page.getByRole("menuitem", {
        name: copy.relatedPages,
        exact: true,
      })
      await relatedPages.focus()
      await page.keyboard.press("ArrowRight")
      const submenu = page.getByRole("menu", {
        name: copy.relatedPages,
        exact: true,
      })
      await expect(
        submenu.getByRole("menuitem", {
          name: copy.usageLog,
          exact: true,
        }),
      ).toBeVisible()
      await expect(async () => {
        const box = await submenu.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.width).toBeGreaterThanOrEqual(192)
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      }).toPass()
      await page.screenshot({
        path: testInfo.outputPath("related-pages.png"),
        animations: "disabled",
      })
      await page.keyboard.press("ArrowLeft")
      await expect(relatedPages).toBeFocused()
      await page
        .getByRole("menuitem", { name: copy.share, exact: true })
        .click()
      const shareMenu = page.getByRole("menu", {
        name: copy.share,
        exact: true,
      })
      await expect(
        shareMenu.getByRole("menuitem", {
          name: copy.copyInviteLink,
          exact: true,
        }),
      ).toBeVisible()
      await expect(async () => {
        const box = await shareMenu.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.width).toBeGreaterThanOrEqual(192)
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      }).toPass()
      await page.screenshot({
        path: testInfo.outputPath("share.png"),
        animations: "disabled",
      })
      await page.keyboard.press("ArrowLeft")
      await page.keyboard.press("Escape")
      await expect(page.getByRole("menu")).toHaveCount(0)
      await expect(more).toHaveAttribute("aria-expanded", "false")
      await row.hover()
      await more.click()
      const tokenResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).origin === "https://menu.example.invalid" &&
          new URL(response.url()).pathname === "/api/token/",
      )
      await page
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowKeyManagementMenuItem)
        .click()
      expect((await tokenResponse).ok()).toBe(true)
      await expect(page).toHaveURL(
        /options\.html\?accountId=menu-account#keys$/,
      )
      await expect(page.getByRole("menu")).toHaveCount(0)
    })
  }
}
