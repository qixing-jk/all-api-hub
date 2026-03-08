import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { getSidePanelPagePath } from "~~/e2e/utils/extension"

test.beforeEach(({ page }) => {
  page.on("pageerror", (error) => {
    throw error
  })

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      throw new Error(msg.text())
    }
  })
})

test("popup page boots", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await expect(page).toHaveTitle(/All API Hub/i)
  await expect(page.locator("#root > *")).not.toHaveCount(0)
})

test("options page boots", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  await expect(page).toHaveTitle(/All API Hub/i)
  await expect(page.locator("#root > *")).not.toHaveCount(0)
})

test("sidepanel page boots (if present)", async ({
  page,
  extensionDir,
  extensionId,
}) => {
  const sidePanelPath = await getSidePanelPagePath(extensionDir)
  test.skip(!sidePanelPath, "No sidepanel entrypoint found in manifest.json")

  await page.goto(`chrome-extension://${extensionId}/${sidePanelPath}`)
  await expect(page).toHaveTitle(/All API Hub/i)
  await expect(page.locator("#root > *")).not.toHaveCount(0)
})
