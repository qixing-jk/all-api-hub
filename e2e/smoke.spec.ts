import { expect, test } from "./fixtures/extensionTest"
import { getSidePanelPagePath } from "./utils/extension"

test("popup page boots", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(page).toHaveTitle(/All API Hub/i)
  await expect(page.locator("#root > *")).not.toHaveCount(0)
})

test("options page boots", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(page).toHaveTitle(/All API Hub/i)
  await expect(page.locator("#root > *")).not.toHaveCount(0)
})

test("sidepanel page boots (if present)", async ({ page, extensionId }) => {
  const sidePanelPath = await getSidePanelPagePath()
  test.skip(!sidePanelPath, "No sidepanel entrypoint found in manifest.json")

  await page.goto(`chrome-extension://${extensionId}/${sidePanelPath}`)
  await expect(page).toHaveTitle(/All API Hub/i)
  await expect(page.locator("#root > *")).not.toHaveCount(0)
})
