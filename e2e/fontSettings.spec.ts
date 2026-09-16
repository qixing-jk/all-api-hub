import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { CONTENT_UI_HOST_TAG } from "~/entrypoints/content/shared/contentUi"
import { WEB_AI_API_CHECK_TEST_IDS } from "~/entrypoints/content/webAiApiCheck/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

for (const width of [390, 320]) {
  test(`font choice renders across extension views and resets at ${width}px`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await forceExtensionLanguage(page, "en")
    await page.setViewportSize({ width, height: 900 })
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      themeMode: "light",
      appearance: { density: "compact", textSize: "extra-large" },
    })
    const base = `chrome-extension://${extensionId}/`
    await page.goto(`${base}${OPTIONS_PAGE_PATH}#basic`)
    const preview = page.getByRole("region", { name: "Preview", exact: true })
    const sample = preview.getByText("Example account", { exact: true })
    const initialFont = await sample.evaluate(
      (element) => getComputedStyle(element).fontFamily,
    )
    const font = page.locator(`#${SETTINGS_ANCHORS.APPEARANCE_FONT}`)
    await font
      .getByRole("radio", { name: "Serif", exact: true })
      .locator("..")
      .click()
    await expect(sample).toHaveCSS("font-family", /Georgia/)
    await expect(preview.getByRole("textbox")).toHaveCSS(
      "font-family",
      /Georgia/,
    )
    await expect(sample).toHaveCSS("font-size", "20px")
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-density",
      "compact",
    )
    const views = []
    for (const path of [POPUP_PAGE_PATH, SIDEPANEL_PAGE_PATH]) {
      const view = await context.newPage()
      views.push(view)
      await view.goto(`${base}${path}`)
      await expect(view.locator("body")).toHaveCSS("font-family", /Georgia/)
    }
    await page.bringToFront()
    await page.reload()
    await expect(
      font.getByRole("radio", { name: "Serif", exact: true }),
    ).toBeChecked()
    await expect(sample).toHaveCSS("font-family", /Georgia/)
    await font.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath(`font-serif-${width}.png`),
    })
    expect(
      await font.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await font.getByRole("button", { name: "Reset font", exact: true }).click()
    await expect(sample).toHaveCSS("font-family", initialFont)
    for (const view of views)
      await expect(view.locator("body")).toHaveCSS("font-family", initialFont)
    await page
      .locator(`#${SETTINGS_ANCHORS.APPEARANCE_PRESET}`)
      .getByRole("radio", { name: "Anthropic", exact: true })
      .locator("..")
      .click()
    await expect(sample).toHaveCSS("font-family", /Georgia/)
    await font
      .getByRole("radio", { name: "Sans serif", exact: true })
      .locator("..")
      .click()
    await expect(sample).toHaveCSS("font-family", initialFont)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
    await page.getByRole("button", { name: /^Current:/ }).click()
    await page
      .getByRole("menuitem", { name: "Appearance settings", exact: true })
      .click()
    const drawer = page.getByRole("dialog", {
      name: "Appearance settings",
      exact: true,
    })
    const drawerFont = drawer.getByRole("group", { name: "Font", exact: true })
    await drawerFont
      .getByRole("radio", { name: "Sans serif", exact: true })
      .focus()
    await page.keyboard.press("ArrowRight")
    await expect(
      drawerFont.getByRole("radio", { name: "Serif", exact: true }),
    ).toBeChecked()
    await expect(drawer.getByRole("textbox")).toHaveCSS(
      "font-family",
      /Georgia/,
    )
    await expect
      .poll(async () => {
        const bounds = await drawer.boundingBox()
        return (
          bounds != null && bounds.x >= 0 && bounds.x + bounds.width <= width
        )
      })
      .toBe(true)
    await drawerFont.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath(`font-drawer-${width}.png`),
    })
  })
}

test("injected font changes stay inside the extension", async ({
  context,
  page,
  extensionId,
}) => {
  const worker = await getServiceWorker(context)
  await forceExtensionLanguage(page, "en")
  await seedUserPreferences(worker, {
    language: "en",
    appearance: { fontFamily: "serif" },
    webAiApiCheck: { enabled: true },
  })
  const url = "https://font.example.test/console"
  await context.route(url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body style="font-family:Arial"><p id="host-text">Host text</p></body></html>',
    }),
  )
  await page.goto(url)
  await expect
    .poll(() =>
      worker.evaluate(
        async ({ url, action }) => {
          const tab = (await chrome.tabs.query({})).find(
            (entry) => entry.url === url,
          )
          if (tab?.id == null) return false
          return new Promise<boolean>((resolve) =>
            chrome.tabs.sendMessage(
              tab.id!,
              {
                action,
                pageUrl: url,
                selectionText:
                  "base_url=https://api.example.test\napi_key=sk-font-fixture",
              },
              () => {
                const error = chrome.runtime.lastError?.message
                resolve(!error || error.includes("message port closed"))
              },
            ),
          )
        },
        { url, action: RuntimeActionIds.ApiCheckContextMenuTrigger },
      ),
    )
    .toBe(true)
  const host = page.locator(CONTENT_UI_HOST_TAG)
  const modal = host.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
  await expect(modal).toBeVisible()
  await expect(
    modal.getByRole("textbox", { name: "Base URL", exact: true }),
  ).toHaveCSS("font-family", /Georgia/)
  await expect(page.locator("#host-text")).toHaveCSS("font-family", "Arial")
  expect(
    await page.evaluate(() =>
      document.documentElement.hasAttribute("data-theme-font"),
    ),
  ).toBe(false)
  const options = await context.newPage()
  await options.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#basic`,
  )
  await options
    .locator(`#${SETTINGS_ANCHORS.APPEARANCE_FONT}`)
    .getByRole("radio", { name: "Sans serif", exact: true })
    .locator("..")
    .click()
  await expect(
    modal.getByRole("textbox", { name: "Base URL", exact: true }),
  ).not.toHaveCSS("font-family", /Georgia/)
  await expect(page.locator("#host-text")).toHaveCSS("font-family", "Arial")
})
