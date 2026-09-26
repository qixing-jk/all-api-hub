import { expect, type Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import {
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
  SITE_ANNOUNCEMENT_STATUS,
} from "~/types/siteAnnouncements"
import { test as extensionTest } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  seedApiCredentialProfiles,
  seedSiteAnnouncementsStore,
  seedStoredAccounts,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

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
      const deadline = performance.now() + 10_000
      let motionStarted = false
      window.location.hash = nextHash
      await new Promise<void>((resolve, reject) => {
        const sample = () => {
          const element = document.querySelector(targetSelector)
          const target = element?.closest('[style*="opacity"]')
          let moving = false
          if (target instanceof HTMLElement) {
            const style = getComputedStyle(target)
            let visibleOpacity = 1
            for (
              let ancestor: HTMLElement | null = element as HTMLElement;
              ancestor;
              ancestor = ancestor.parentElement
            ) {
              visibleOpacity *= Number(getComputedStyle(ancestor).opacity)
            }
            moving = target
              .getAnimations()
              .some(
                (animation) =>
                  (animation.playState === "running" || animation.pending) &&
                  animation.effect instanceof KeyframeEffect &&
                  animation.effect
                    .getKeyframes()
                    .some((frame) => "transform" in frame),
              )
            motionStarted ||= moving
            frames.push({
              opacity: visibleOpacity,
              y:
                style.transform === "none"
                  ? 0
                  : new DOMMatrixReadOnly(style.transform).m42,
            })
          }
          // Loading is outside the observation window. Once native movement
          // begins, capture through its final frame (or the outgoing unmount).
          if (motionStarted && !moving) {
            resolve()
          } else if (performance.now() >= deadline) {
            reject(new Error(`No completed card animation: ${targetSelector}`))
          } else {
            requestAnimationFrame(sample)
          }
        }
        sample()
      })
      return frames
    },
    { nextHash: hash, targetSelector: selector },
  )
}

function expectEntranceWithoutFlash(
  frames: Array<{ opacity: number; y: number }>,
) {
  let highestOpacity = 0
  for (const frame of frames) {
    expect(highestOpacity - frame.opacity).toBeLessThan(0.25)
    highestOpacity = Math.max(highestOpacity, frame.opacity)
  }
}

async function captureCardExit(page: Page, hash: string, selector: string) {
  return page.evaluate(
    async ({ nextHash, targetSelector }) => {
      const element = document.querySelector(targetSelector)
      const styledAncestor = element?.closest('[style*="opacity"]')
      const pageContent = document.querySelector("[data-options-page-content]")
      // A card initially below the viewport has no entrance styles yet.
      const target = styledAncestor === pageContent ? element : styledAncestor
      if (!(target instanceof HTMLElement))
        throw new Error("Missing exit target")
      const frames: Array<{
        opacity: number
        x: number
        y: number
        native: boolean
      }> = []
      const start = performance.now()
      window.location.hash = nextHash
      await new Promise<void>((resolve) => {
        const sample = () => {
          if (!target.isConnected || performance.now() - start > 650) {
            resolve()
            return
          }
          const style = getComputedStyle(target)
          const matrix = new DOMMatrixReadOnly(style.transform)
          frames.push({
            opacity: Number(style.opacity),
            x: target.getBoundingClientRect().left,
            y: matrix.m42,
            native: target
              .getAnimations()
              .some(
                (animation) =>
                  animation.effect instanceof KeyframeEffect &&
                  animation.effect
                    .getKeyframes()
                    .some((frame) => "transform" in frame),
              ),
          })
          requestAnimationFrame(sample)
        }
        sample()
      })
      return frames
    },
    { nextHash: hash, targetSelector: selector },
  )
}

extensionTest(
  "headers and scrolled bottom cards exit without flashing or horizontal drift",
  async ({ context, extensionId, page }) => {
    const worker = await getServiceWorker(context)
    await seedStoredAccounts(
      worker,
      Array.from({ length: 16 }, (_, index) =>
        createStoredAccount({
          id: `exit-account-${index}`,
          site_name: `Exit account ${index}`,
        }),
      ),
    )
    await seedApiCredentialProfiles(
      worker,
      Array.from({ length: 12 }, (_, index) =>
        createStoredApiCredentialProfile({
          id: `exit-profile-${index}`,
          name: `Exit profile ${index}`,
          apiKey: `sk-exit-profile-${index}`,
        }),
      ),
    )
    await page.setViewportSize({ width: 1600, height: 1000 })
    for (const scenario of [
      {
        from: "account",
        to: "apiCredentialProfiles",
        selector:
          '[data-testid="options-content-card"] [data-page-motion-item]',
        scroll: false,
      },
      {
        from: "apiCredentialProfiles",
        to: "models",
        selector: '[data-testid="api-credential-profile-row-exit-profile-11"]',
        scroll: true,
      },
      { from: "basic", to: "about", selector: "#dangerous-zone", scroll: true },
    ]) {
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${scenario.from}`,
      )
      await expect(page.locator("[data-options-page-content]")).toHaveCSS(
        "opacity",
        "1",
      )
      await page.waitForTimeout(650)
      if (scenario.scroll) {
        await page.locator(scenario.selector).scrollIntoViewIfNeeded()
        await page.waitForTimeout(100)
      }
      const frames = await captureCardExit(
        page,
        `#${scenario.to}`,
        scenario.selector,
      )
      expect(
        frames.some((frame) => frame.native),
        scenario.from,
      ).toBe(true)
      expect(
        frames.some((frame) => frame.y < -1 && frame.opacity < 0.95),
        scenario.from,
      ).toBe(true)
      for (let index = 1; index < frames.length; index++) {
        expect(
          frames[index]!.opacity - frames[index - 1]!.opacity,
          scenario.from,
        ).toBeLessThan(0.15)
        expect(
          Math.abs(frames[index]!.x - frames[0]!.x),
          scenario.from,
        ).toBeLessThan(0.2)
      }
    }
  },
)

extensionTest(
  "navigation survives cards hidden or removed during entrance",
  async ({ extensionId, page }) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.emulateMedia({ reducedMotion: "no-preference" })

    for (const mutation of ["hide", "remove"] as const) {
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
      )
      await page.evaluate(async (change) => {
        await new Promise<void>((resolve, reject) => {
          const deadline = performance.now() + 10_000
          const interrupt = () => {
            const block = document
              .querySelector<HTMLElement>(
                "[data-options-page-content] [data-page-motion-item]",
              )
              ?.closest<HTMLElement>('[style*="opacity"]')
            if (block?.getAnimations().some((a) => a.playState === "running")) {
              if (change === "hide") block.style.display = "none"
              else block.remove()
              window.location.hash = "#about"
              resolve()
              return
            }
            if (performance.now() > deadline) {
              reject(new Error("No entering card found"))
              return
            }
            requestAnimationFrame(interrupt)
          }
          interrupt()
        })
      }, mutation)
      await expect(
        page.getByRole("heading", { name: "About", exact: true }),
      ).toBeVisible()
      await expect(page.locator("[data-options-page-content]")).toHaveCSS(
        "opacity",
        "1",
      )
    }
    expect(errors).toEqual([])
  },
)

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
  "rapid sidebar clicks settle on the last selected page",
  async ({ extensionId, page }) => {
    await forceExtensionLanguage(page)
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
    )
    await expect(
      page.locator('[data-testid="options-overview-page"]'),
    ).toBeVisible()

    for (const steps of [
      [
        ["Account Management", 35],
        ["Auto Check-in", 35],
        ["Balance History", 35],
      ],
      [
        ["API Credential Library", 220],
        ["Auto Check-in", 45],
        ["Account Management", 35],
        ["Balance History", 35],
      ],
      [
        ["Overview", 200],
        ["Account Management", 210],
        ["Auto Check-in", 45],
        ["Balance History", 35],
      ],
    ]) {
      await page.evaluate(
        async (items) => {
          for (const [label, waitMs] of items) {
            const button = Array.from(
              document.querySelectorAll<HTMLButtonElement>("aside button"),
            ).find((candidate) => candidate.textContent?.trim() === label)
            if (!button) throw new Error(`Missing sidebar button: ${label}`)
            button.click()
            await new Promise((resolve) => setTimeout(resolve, waitMs))
          }
        },
        steps as Array<[string, number]>,
      )

      const content = page.locator('[data-testid="options-content-card"]')
      await expect(page).toHaveURL(/#balanceHistory$/)
      await expect(
        page.locator('aside button[aria-current="page"]'),
      ).toHaveText("Balance History")
      await expect(
        content.locator("[data-page-motion-item] h2").first(),
      ).toHaveText("Balance History")
      await expect(content.locator(":scope > div > div")).toHaveCSS(
        "opacity",
        "1",
      )
      await page.waitForTimeout(600)
      await expect(
        content.locator("[data-page-motion-item] h2").first(),
      ).toHaveText("Balance History")
    }
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
      await expect(page.locator("[data-options-page-content]")).toHaveAttribute(
        "style",
        /opacity: 1/,
      )
      const text = await page
        .locator('[data-testid="options-content-card"]')
        .innerText()
      expect(text.length, pageId).toBeGreaterThan(10)
      const uncoveredCards = await page
        .locator("[data-options-page-content]")
        .evaluate((content) =>
          Array.from(content.querySelectorAll('[data-slot="card"]'))
            .filter((card) => {
              const rect = card.getBoundingClientRect()
              return (
                rect.width > 4 &&
                rect.height > 4 &&
                rect.bottom > 0 &&
                rect.top < window.innerHeight
              )
            })
            .filter((card) => {
              for (
                let node: Element | null = card;
                node && node !== content;

              ) {
                if (
                  node instanceof HTMLElement &&
                  (node.style.opacity || node.style.transform)
                ) {
                  return false
                }
                node = node.parentElement
              }
              return true
            })
            .map((card) => card.textContent?.trim().slice(0, 40)),
        )
      expect(uncoveredCards, pageId).toEqual([])
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
      const content = page.locator("[data-options-page-content]")
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
  async ({ context, extensionId, page }) => {
    await seedStoredAccounts(
      await getServiceWorker(context),
      Array.from({ length: 40 }, (_, index) =>
        createStoredAccount({
          id: `motion-account-${index}`,
          site_name: `Motion account ${index}`,
        }),
      ),
    )
    await page.setViewportSize({ width: 1600, height: 1100 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
    )
    await expect(page.locator("[data-options-page-content]")).toHaveCSS(
      "opacity",
      "1",
    )

    const account = await captureCardEntrance(
      page,
      "#account",
      '[data-testid="account-list-view"]',
    )
    expect(account.some((frame) => frame.opacity < 0.95 && frame.y > 1)).toBe(
      true,
    )
    expect(
      account.filter((frame) => frame.opacity < 0.95 && frame.y > 1).length,
    ).toBeGreaterThan(1)
    expectEntranceWithoutFlash(account)
    expect(account.at(-1)?.opacity).toBe(1)
    expect(Math.abs(account.at(-1)?.y ?? Infinity)).toBeLessThan(0.1)

    const appearance = await captureCardEntrance(page, "#basic", "#appearance")
    expect(
      appearance.some((frame) => frame.opacity < 0.95 && frame.y > 1),
    ).toBe(true)
    expect(
      appearance.filter((frame) => frame.opacity < 0.95 && frame.y > 1).length,
    ).toBeGreaterThan(3)
    expectEntranceWithoutFlash(appearance)

    const appearanceExit = await captureCardEntrance(
      page,
      "#importExport",
      "#appearance",
    )
    expect(
      appearanceExit.some((frame) => frame.opacity < 0.95 && frame.y < -1),
    ).toBe(true)
  },
)

extensionTest(
  "credential library waits for stored profiles before its large list enters",
  async ({ context, extensionId, page }) => {
    await seedApiCredentialProfiles(
      await getServiceWorker(context),
      Array.from({ length: 40 }, (_, index) =>
        createStoredApiCredentialProfile({
          id: `motion-profile-${index}`,
          name: `Motion profile ${index}`,
          apiKey: `sk-motion-profile-${index}`,
        }),
      ),
    )
    await page.setViewportSize({ width: 1600, height: 1100 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
    )
    await expect(page.locator("[data-options-page-content]")).toHaveCSS(
      "opacity",
      "1",
    )

    const entrance = await captureCardEntrance(
      page,
      "#apiCredentialProfiles",
      '[data-testid="api-credential-profile-row-motion-profile-0"]',
    )
    expect(
      entrance.filter((frame) => frame.opacity < 0.95 && frame.y > 1).length,
    ).toBeGreaterThan(1)
    expectEntranceWithoutFlash(entrance)
    await expect(
      page.locator('[data-testid^="api-credential-profile-row-"]'),
    ).toHaveCount(40)
    await expect(page.locator("[data-options-page-pending]")).toHaveCount(0)
  },
)

extensionTest(
  "model source selection empty state enters after sources load",
  async ({ context, extensionId, page }) => {
    await seedStoredAccounts(await getServiceWorker(context), [
      createStoredAccount({
        id: "motion-model-source",
        site_name: "Motion model source",
      }),
    ])
    await forceExtensionLanguage(page)
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
    )
    await expect(page.locator("[data-options-page-content]")).toHaveCSS(
      "opacity",
      "1",
    )

    const entrance = await captureCardEntrance(
      page,
      "#models",
      '[data-testid="model-list-page"] [role="status"]',
    )
    await expect(
      page
        .locator('[data-testid="model-list-page"] [role="status"]')
        .getByText("Please select a source", { exact: true }),
    ).toBeVisible()
    expect(
      entrance.filter((frame) => frame.opacity < 0.95 && frame.y > 1).length,
    ).toBeGreaterThan(3)
    await expect(page.locator("[data-options-page-pending]")).toHaveCount(0)
  },
)

extensionTest(
  "visible announcement cards enter individually in a long virtualized list",
  async ({ context, extensionId, page }) => {
    const now = Date.now()
    const siteKey = "notice:new-api:https://motion-announcements.example.com"
    await seedSiteAnnouncementsStore(await getServiceWorker(context), {
      [siteKey]: {
        siteKey,
        siteName: "Motion announcements",
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://motion-announcements.example.com",
        accountId: "motion-announcement-account",
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
        lastCheckedAt: now,
        lastSuccessAt: now,
        records: Array.from({ length: 30 }, (_, index) => ({
          id: `motion-announcement-${index}`,
          siteKey,
          siteName: "Motion announcements",
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://motion-announcements.example.com",
          accountId: "motion-announcement-account",
          providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
          title: `Motion announcement ${index}`,
          content: `Motion announcement body ${index}`,
          fingerprint: `motion-announcement-${index}-fingerprint`,
          firstSeenAt: now - index * 60_000,
          lastSeenAt: now - index * 60_000,
          createdAt: now - index * 60_000,
          read: true,
        })),
      },
    })
    await page.setViewportSize({ width: 1600, height: 1100 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#overview`,
    )
    await expect(page.locator("[data-options-page-content]")).toHaveCSS(
      "opacity",
      "1",
    )

    const entrance = await page.evaluate(async () => {
      const frames: Array<{ opacity: number; y: number }>[] = [[], []]
      const started = performance.now()
      window.location.hash = "#siteAnnouncements"
      await new Promise<void>((resolve) => {
        const sample = () => {
          const cards = document.querySelectorAll<HTMLElement>(
            "[data-page-motion-list] [data-page-motion-item]",
          )
          for (let index = 0; index < Math.min(2, cards.length); index++) {
            const style = getComputedStyle(cards[index]!)
            frames[index]!.push({
              opacity: Number(style.opacity),
              y:
                style.transform === "none"
                  ? 0
                  : new DOMMatrixReadOnly(style.transform).m42,
            })
          }
          if (performance.now() - started < 1800) {
            requestAnimationFrame(sample)
          } else {
            resolve()
          }
        }
        sample()
      })
      return frames
    })

    for (const card of entrance) {
      expect(
        card.some((frame) => frame.opacity < 0.95 && frame.y > 1),
        JSON.stringify({
          count: card.length,
          minOpacity: Math.min(...card.map((frame) => frame.opacity)),
          maxY: Math.max(...card.map((frame) => frame.y)),
        }),
      ).toBe(true)
    }
    const cards = page.locator(
      "[data-page-motion-list] [data-page-motion-item]",
    )
    expect(await cards.count()).toBeLessThan(30)
    await expect(cards.first()).toContainText("Motion announcement")
  },
)
