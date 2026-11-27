import { SITE_BOOKMARKS_TEST_IDS } from "~/features/SiteBookmarks/testIds"
import { openSiteFaviconFixture } from "~~/e2e/utils/siteFaviconFixture"

import { expect, test } from "./extensionTest"

test("Firefox uses the browser tab favicon and fills the full bookmark URL", async ({
  firefoxExtension,
}, testInfo) => {
  const site = await openSiteFaviconFixture()
  try {
    await firefoxExtension.driver.executeScript("Services.io.offline = false")
    const options = firefoxExtension.page("options.html")
    await options.openInTab("#bookmark")
    expect(
      await options.evaluate<boolean>(
        'browser.runtime.getManifest().permissions.includes("favicon")',
      ),
    ).toBe(false)
    const tab = await options.evaluateAsync<{ id: number }>(
      `browser.tabs.create({url: ${JSON.stringify(site.url)}, active: false})`,
    )
    try {
      const readTabIcon = () =>
        options.evaluateAsync<string | null>(
          `browser.tabs.get(${tab.id}).then(tab => tab.favIconUrl || null)`,
        )
      await expect.poll(readTabIcon).toBeTruthy()
      const iconUrl = await readTabIcon()
      await options.click(SITE_BOOKMARKS_TEST_IDS.addButton)
      await options.clickSelector(
        'button[aria-label="Choose from recently active tabs"]',
      )
      const label = `${site.title} — ${site.url}`
      const option = `[role="option"]:has([title=${JSON.stringify(label)}])`
      const icon = `${option} img`
      await expect
        .poll(() =>
          options.evaluate(
            `document.querySelector(${JSON.stringify(icon)})?.getAttribute("src") ?? null`,
          ),
        )
        .toBe(iconUrl)
      await expect
        .poll(() =>
          options.evaluate<boolean>(
            `Boolean(document.querySelector(${JSON.stringify(icon)})?.naturalWidth)`,
          ),
        )
        .toBe(true)
      await options.evaluateAsync(
        `Promise.allSettled([
          document.fonts.ready,
          ...document.querySelector('[data-slot="combobox-content"]').getAnimations()
            .map(animation => animation.finished),
        ]).then(() => true)`,
      )
      await options.screenshot(testInfo.outputPath("bookmark-firefox.png"))
      await options.clickSelector(option)
      const bookmarkDialog = `[data-testid="${SITE_BOOKMARKS_TEST_IDS.dialog}"]`
      await expect
        .poll(() =>
          options.evaluate(
            `document.querySelector('${bookmarkDialog} [role="combobox"]')?.value ?? null`,
          ),
        )
        .toBe(site.url)
    } finally {
      await options.evaluateAsync(
        `browser.tabs.remove(${tab.id}).then(() => true)`,
      )
    }
  } finally {
    await site.close()
  }
})
