import { expect, type Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { test as extensionTest } from "~~/e2e/fixtures/extensionTest"

type Frame = {
  page: "overview" | "other" | "loading"
  opacity: number
  y: number
  x: number
}

async function captureTransition(page: Page, hash: string): Promise<Frame[]> {
  return page.evaluate(async (nextHash) => {
    const frames: Frame[] = []
    const started = performance.now()
    window.location.hash = nextHash

    await new Promise<void>((resolve) => {
      const sample = () => {
        const content = document.querySelector(
          '[data-testid="options-content-card"]',
        )
        const route = content?.firstElementChild
        const root = route?.firstElementChild?.firstElementChild
        const block = root?.firstElementChild
        const page =
          root?.getAttribute("data-testid") === "options-overview-page"
            ? "overview"
            : root?.querySelector("[data-page-motion-item]")
              ? "other"
              : "loading"

        if (block instanceof HTMLElement) {
          const style = getComputedStyle(block)
          frames.push({
            page,
            opacity: Number(style.opacity),
            x: block.getBoundingClientRect().left,
            y:
              style.transform === "none"
                ? 0
                : new DOMMatrixReadOnly(style.transform).m42,
          })
        }

        if (performance.now() - started < 2200) {
          requestAnimationFrame(sample)
        } else {
          resolve()
        }
      }
      sample()
    })
    return frames
  }, hash)
}

async function captureCardEntrance(
  page: Page,
  hash: string,
  selector: string,
): Promise<Array<{ opacity: number; y: number }>> {
  return page.evaluate(
    async ({ nextHash, targetSelector }) => {
      const frames: Array<{ opacity: number; y: number }> = []
      const started = performance.now()
      window.location.hash = nextHash
      await new Promise<void>((resolve) => {
        const sample = () => {
          const element = document.querySelector(targetSelector)
          const target = element?.closest('[style*="transform"]')
          if (target instanceof HTMLElement) {
            const style = getComputedStyle(target)
            frames.push({
              opacity: Number(style.opacity),
              y:
                style.transform === "none"
                  ? 0
                  : new DOMMatrixReadOnly(style.transform).m42,
            })
          }
          if (performance.now() - started < 2500) {
            requestAnimationFrame(sample)
          } else {
            resolve()
          }
        }
        sample()
      })
      return frames
    },
    { nextHash: hash, targetSelector: selector },
  )
}

extensionTest(
  "main pages move in the sidebar direction",
  async ({ extensionId, page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
    )
    await expect(
      page.locator('[data-testid="options-overview-page"]'),
    ).toBeVisible()
    await page.waitForTimeout(900)

    const downward = await captureTransition(page, "#about")
    expect(
      downward.some(
        (frame) =>
          frame.page === "overview" && frame.opacity < 0.95 && frame.y < -1,
      ),
    ).toBe(true)
    expect(
      downward.some(
        (frame) =>
          frame.page === "other" && frame.opacity < 0.95 && frame.y > 1,
      ),
    ).toBe(true)

    const upward = await captureTransition(page, "#overview")
    expect(
      upward.some(
        (frame) =>
          frame.page === "other" && frame.opacity < 0.95 && frame.y > 1,
      ),
    ).toBe(true)
    expect(
      upward.some(
        (frame) =>
          frame.page === "overview" && frame.opacity < 0.95 && frame.y < -1,
      ),
    ).toBe(true)
    const overviewX = upward
      .filter((frame) => frame.page === "overview")
      .map((frame) => frame.x)
    expect(Math.max(...overviewX) - Math.min(...overviewX)).toBeLessThan(1)
  },
)

extensionTest(
  "all sidebar pages can transition without keeping the old page",
  async ({ extensionId, page }) => {
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
    )
    await expect(
      page.locator('[data-testid="options-overview-page"]'),
    ).toBeVisible()

    const pageIds = [
      "account",
      "apiCredentialProfiles",
      "bookmark",
      "models",
      "keys",
      "autoCheckin",
      "siteAnnouncements",
      "balanceHistory",
      "usageAnalytics",
      "managedSiteChannels",
      "managedSiteModelSync",
      "basic",
      "importExport",
      "about",
    ]

    for (const pageId of pageIds) {
      const oldRoute = await page
        .locator('[data-testid="options-content-card"] > div')
        .elementHandle()
      await page.evaluate((id) => {
        window.location.hash = `#${id}`
      }, pageId)
      await expect
        .poll(async () => oldRoute?.evaluate((element) => element.isConnected))
        .toBe(false)
      await expect(
        page.locator(
          '[data-testid="options-content-card"] [data-options-page-fallback]',
        ),
      ).toHaveCount(0)
      await expect(
        page.locator(
          '[data-testid="options-content-card"] [data-options-page-pending]',
        ),
      ).toHaveCount(0)
      await expect(
        page.locator('[data-testid="options-content-card"] > div > div'),
      ).toHaveAttribute("style", /opacity: 1/)
      const text = await page
        .locator('[data-testid="options-content-card"]')
        .innerText()
      expect(text.length, pageId).toBeGreaterThan(10)
      if (pageId === "autoCheckin") {
        await expect(page.locator("[data-page-motion-group]")).toHaveCount(1)
        await expect(
          page.locator('[data-page-motion-group] > [style*="opacity"]'),
        ).not.toHaveCount(0)
      }
      if (pageId === "basic") {
        await expect(
          page.locator('[data-page-motion-group] > [style*="opacity"]'),
        ).not.toHaveCount(0)
      }
    }
  },
)

extensionTest(
  "reduced motion skips page movement",
  async ({ extensionId, page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
    )
    await expect(
      page.locator('[data-testid="options-overview-page"]'),
    ).toBeVisible()
    const frames = await captureTransition(page, "#about")
    expect(
      frames
        .filter((frame) => frame.page !== "loading")
        .every((frame) => Math.abs(frame.y) < 1),
    ).toBe(true)
  },
)

extensionTest(
  "main content remains visible after a full page refresh",
  async ({ extensionId, page }) => {
    for (const pageId of ["overview", "account", "bookmark", "basic"]) {
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${pageId}`,
      )
      const content = page.locator(
        '[data-testid="options-content-card"] > div > div',
      )
      await expect(content).toHaveCSS("opacity", "1")
      await page.reload()
      await expect(content).toHaveCSS("opacity", "1")
      await page.waitForTimeout(400)
      await expect(content).toHaveCSS("opacity", "1")
    }
  },
)

extensionTest(
  "large account and appearance cards enter with visible movement",
  async ({ extensionId, page }) => {
    await page.setViewportSize({ width: 1600, height: 1100 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
    )
    await expect(
      page.locator('[data-testid="options-content-card"] > div > div'),
    ).toHaveCSS("opacity", "1")

    const account = await captureCardEntrance(
      page,
      "#account",
      '[data-testid="account-list-view"]',
    )
    expect(account.some((frame) => frame.opacity < 0.95 && frame.y > 1)).toBe(
      true,
    )

    const appearance = await captureCardEntrance(page, "#basic", "#appearance")
    expect(
      appearance.some((frame) => frame.opacity < 0.95 && frame.y > 1),
    ).toBe(true)
  },
)
