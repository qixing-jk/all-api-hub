import { ACCOUNT_MANAGEMENT_TEST_IDS as ids } from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedTagStore,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test.beforeEach(async ({ page, context }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, { themeMode: "light" })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "toolbar-account",
      site_name: "Toolbar account",
      tagIds: ["tag-99"],
    }),
  ])
})

test("bounds tag shortcuts across sizes and keeps hidden selections accessible", async ({
  page,
  context,
  extensionId,
}) => {
  const worker = await getServiceWorker(context)
  await seedTagStore(
    worker,
    Array.from({ length: 100 }, (_, index) => ({
      id: `tag-${index}`,
      name: `Team ${String(index).padStart(2, "0")} with a long label`,
    })),
  )
  await page.setViewportSize({ width: 1536, height: 960 })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  const list = page.getByTestId(ids.accountListView)
  const tags = list.locator('[data-slot="compact-tag-filter"]')
  const header = page.getByTestId(ids.accountListHeader)
  for (const width of [1536, 1280, 960, 480, 320]) {
    await page.setViewportSize({ width, height: 960 })
    await expect(tags).toBeVisible()
    await expect
      .poll(async () => {
        const row = await tags.boundingBox()
        const buttons = await tags.getByRole("button").evaluateAll((nodes) =>
          nodes.map((node) => {
            const r = node.getBoundingClientRect()
            return {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
            }
          }),
        )
        return Boolean(
          row &&
            row.height <= 40 &&
            buttons.every(
              (r) =>
                r.left >= row.x &&
                r.right <= row.x + row.width &&
                r.top >= row.y &&
                r.bottom <= row.y + row.height,
            ),
        )
      })
      .toBe(true)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  }
  await tags.getByRole("button", { name: "All tags 100" }).click()
  const panel = page.getByRole("dialog", { name: "All tags" })
  await panel.getByRole("textbox", { name: "Search tags" }).fill("Team 99")
  await panel.getByRole("checkbox").check()
  await panel.getByRole("button", { name: "Close", exact: true }).click()
  await expect(tags.getByRole("button", { name: "Selected 1" })).toBeVisible()
  await expect(header).toContainText("1")
  await tags.getByRole("button", { name: "Selected 1" }).click()
  await expect(panel.getByRole("textbox", { name: "Search tags" })).toHaveValue(
    "",
  )
  await panel
    .getByRole("textbox", { name: "Search tags" })
    .fill("does not exist")
  await expect(panel.getByText("No matching tags")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(tags.getByRole("button", { name: "Selected 1" })).toBeFocused()
})

test("retains status filters when collapsed and when moving between mobile and desktop", async ({
  page,
  extensionId,
}) => {
  await page.setViewportSize({ width: 480, height: 960 })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  const list = page.getByTestId(ids.accountListView)
  const status = page.getByTestId("account-filter-disabled")
  const toggle = list.getByRole("button", { name: /^Filters/ })
  await expect(status).toBeHidden()
  await toggle.click()
  await status.click()
  await page.getByRole("option", { name: /Disabled/ }).click()
  await toggle.click()
  await expect(status).toBeHidden()
  await expect(toggle).toHaveText(/1/)
  await expect(list).toContainText("No matching accounts")
  await page.setViewportSize({ width: 1536, height: 960 })
  await expect(status).toBeVisible()
  await expect(status).toContainText("Disabled")
  await expect(toggle).toBeHidden()
  await expect(list.locator('[data-slot="compact-tag-filter"]')).toHaveCount(0)
})

test("keeps sorting compact on the left and clears it without opening a menu", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await seedTagStore(await getServiceWorker(context), [
    { id: "tag-99", name: "Personal" },
  ])
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  const header = page.getByTestId(ids.accountListHeader)
  const menu = page.getByTestId(ids.accountListSortMenuButton)
  const clear = page.getByTestId(ids.accountListClearSortButton)
  await menu.click()
  await page
    .getByRole("menuitemradio", { name: "Balance", exact: true })
    .click()
  await expect(clear).toBeVisible()
  for (const width of [1536, 480, 360, 320]) {
    await page.setViewportSize({ width, height: 960 })
    await expect
      .poll(async () => {
        const box = await header.boundingBox()
        return box?.height ?? Infinity
      })
      .toBeLessThanOrEqual(42)
    const box = await header.boundingBox()
    const sortBox = await menu.boundingBox()
    expect(sortBox!.x - box!.x).toBeLessThan(120)
    expect(
      await header.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true)
    await header.screenshot({
      path: testInfo.outputPath(`sorting-${width}.png`),
    })
  }
  await menu.click()
  const sortMenu = page.getByRole("menu")
  await expect(sortMenu).toBeVisible()
  await expect(
    page.getByRole("menuitemradio", { name: "Balance", exact: true }),
  ).toBeChecked()
  await page.screenshot({
    path: testInfo.outputPath("sorting-menu-narrow.png"),
    animations: "disabled",
  })
  await page.keyboard.press("Escape")
  await expect(menu).toBeFocused()
  await clear.click()
  await expect(clear).toBeHidden()
  await expect(
    page.getByTestId(ids.accountListSortDirectionButton),
  ).toBeDisabled()
})
