import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  installExtensionPageGuards,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const devices = [
  {
    name: "Android tablet",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 EdgA/130.0.0.0",
    mobileHint: false,
    touchPoints: 5,
  },
  {
    name: "iPad",
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1",
    mobileHint: null,
    touchPoints: 5,
  },
  {
    name: "Android Edge phone",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0",
    mobileHint: true,
    touchPoints: 5,
  },
]

test.beforeEach(async ({ page, context }) => {
  installExtensionPageGuards(page)
  await stubLlmMetadataIndex(context)
})

for (const device of devices) {
  for (const surface of ["popup", "sidepanel"]) {
    test(`${surface} fills the available viewport on ${device.name}`, async ({
      page,
      extensionId,
    }) => {
      await page.addInitScript((profile) => {
        Object.defineProperties(navigator, {
          userAgent: { get: () => profile.userAgent },
          userAgentData: { get: () => ({ mobile: profile.mobileHint }) },
          maxTouchPoints: { get: () => profile.touchPoints },
        })
      }, device)
      await page.setViewportSize({ width: 820, height: 1180 })
      await page.goto(`chrome-extension://${extensionId}/${surface}.html`)
      await waitForExtensionRoot(page)
      const container = page.getByTestId(POPUP_TEST_IDS.scrollContainer)
      await expect(container).toBeVisible()
      await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
      for (const viewport of [
        { width: 820, height: 1180 },
        { width: 1180, height: 820 },
        { width: 390, height: 700 },
      ]) {
        await page.setViewportSize(viewport)
        await expect
          .poll(async () => {
            const box = await container.boundingBox()
            return box ? Math.round(box.width) : 0
          })
          .toBe(viewport.width)
        await expect
          .poll(async () => {
            const box = await container.boundingBox()
            return box ? Math.round(box.height) : 0
          })
          .toBeGreaterThanOrEqual(viewport.height)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true)
        expect(
          await container.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true)
      }
    })
  }
}

for (const surface of ["popup", "sidepanel"]) {
  test(`preserves desktop ${surface} sizing`, async ({ page, extensionId }) => {
    await page.setViewportSize({ width: 820, height: 1180 })
    await page.goto(`chrome-extension://${extensionId}/${surface}.html`)
    await waitForExtensionRoot(page)
    const container = page.getByTestId(POPUP_TEST_IDS.scrollContainer)
    await expect(container).toBeVisible()
    await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
    await expect
      .poll(async () => {
        const box = await container.boundingBox()
        return (
          box && {
            width: Math.round(box.width),
            height: Math.round(box.height),
          }
        )
      })
      .toEqual(
        surface === "popup"
          ? { width: 410, height: 600 }
          : { width: 820, height: 1180 },
      )
  })
}

for (const surface of ["popup", "sidepanel"]) {
  test(`${surface} keeps the mobile seed before application modules load`, async ({
    page,
    extensionId,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperties(navigator, {
        userAgent: {
          get: () =>
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0",
        },
        userAgentData: { get: () => ({ mobile: true }) },
        maxTouchPoints: { get: () => 5 },
      })
    })
    // The classic appearance bootstrap must run; only defer application chunks.
    await page.route("**/chunks/*.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: "" }),
    )
    await page.setViewportSize({ width: 20, height: 600 })
    await page.goto(`chrome-extension://${extensionId}/${surface}.html`)
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.dataset.compactExtensionPage === "mobile",
        ),
      )
      .toBe(true)
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).minWidth,
      ),
    ).toBe("320px")
    expect(
      await page.evaluate(
        () => document.documentElement.getBoundingClientRect().width,
      ),
    ).toBeGreaterThanOrEqual(320)
  })

  test(`${surface} has no desktop width floor while application modules are delayed`, async ({
    page,
    extensionId,
  }) => {
    await page.route("**/chunks/*.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: "" }),
    )
    await page.setViewportSize({ width: 20, height: 600 })
    await page.goto(`chrome-extension://${extensionId}/${surface}.html`)
    await expect
      .poll(() => page.evaluate(() => document.readyState))
      .toBe("complete")
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).minWidth,
      ),
    ).not.toBe("320px")
    expect(
      await page.evaluate(
        () => document.documentElement.getBoundingClientRect().width,
      ),
    ).toBe(20)
  })
}

for (const surface of ["popup", "sidepanel"]) {
  test(`${surface} recovers from tiny mobile host widths`, async ({
    page,
    extensionId,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperties(navigator, {
        userAgent: {
          get: () =>
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0",
        },
        userAgentData: { get: () => ({ mobile: true }) },
        maxTouchPoints: { get: () => 5 },
      })
    })
    await page.setViewportSize({ width: 20, height: 600 })
    await page.goto(`chrome-extension://${extensionId}/${surface}.html`)
    await waitForExtensionRoot(page)
    const container = page.getByTestId(POPUP_TEST_IDS.scrollContainer)
    await expect(container).toBeVisible()
    await expect
      .poll(async () => Math.round((await container.boundingBox())?.width ?? 0))
      .toBeGreaterThanOrEqual(320)

    // First accept the seed width, then verify each usable resize and narrow
    // high-zoom host width after normal sizing has initialized.
    for (const width of [320, 180, 144, 64, 390, 48]) {
      await page.setViewportSize({ width, height: 700 })
      await expect
        .poll(async () =>
          Math.round((await container.boundingBox())?.width ?? 0),
        )
        .toBe(width)
      await expect
        .poll(async () =>
          Math.round((await page.locator("#root").boundingBox())?.width ?? 0),
        )
        .toBe(width)
    }
  })
}

test("desktop sidepanel fills the browser zoomed viewport after reload", async ({
  page,
  extensionId,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`)

  const container = page.getByTestId(POPUP_TEST_IDS.scrollContainer)
  await expect(container).toBeVisible()
  await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()

  for (const zoomPercentage of [100, 150, 200, 250]) {
    const zoomFactor = zoomPercentage / 100
    const appliedZoom = await page.evaluate(async (factor) => {
      const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
        chrome.tabs.getCurrent((currentTab) => {
          const error = chrome.runtime.lastError
          if (error) {
            reject(new Error(error.message))
          } else if (!currentTab?.id) {
            reject(new Error("No current browser tab is available"))
          } else {
            resolve(currentTab)
          }
        })
      })
      await new Promise<void>((resolve, reject) => {
        chrome.tabs.setZoom(tab.id!, factor, () => {
          const error = chrome.runtime.lastError
          if (error) {
            reject(new Error(error.message))
          } else {
            resolve()
          }
        })
      })
      return await new Promise<number>((resolve, reject) => {
        chrome.tabs.getZoom(tab.id!, (currentZoom) => {
          const error = chrome.runtime.lastError
          if (error) {
            reject(new Error(error.message))
          } else {
            resolve(currentZoom)
          }
        })
      })
    }, zoomFactor)
    expect(appliedZoom).toBeCloseTo(zoomFactor)

    await page.reload()
    await waitForExtensionRoot(page)
    await expect(container).toBeVisible()
    await page.getByTestId(POPUP_TEST_IDS.bookmarksTab).click()
    await expect
      .poll(() =>
        page.evaluate((scrollContainerTestId) => {
          const root = document.getElementById("root")
          const container = document.querySelector<HTMLElement>(
            `[data-testid="${scrollContainerTestId}"]`,
          )
          const viewportWidth = Math.round(window.innerWidth)
          return Boolean(
            root &&
              container &&
              Math.round(root.getBoundingClientRect().width) ===
                viewportWidth &&
              Math.round(container.getBoundingClientRect().width) ===
                viewportWidth,
          )
        }, POPUP_TEST_IDS.scrollContainer),
      )
      .toBe(true)
  }
})

for (const surface of ["popup", "sidepanel"]) {
  test(`${surface} preserves Windows touch desktop sizing without client hints`, async ({
    page,
    extensionId,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperties(navigator, {
        userAgent: {
          get: () =>
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
        },
        userAgentData: { get: () => undefined },
        maxTouchPoints: { get: () => 5 },
      })
      Object.defineProperties(screen, {
        width: { get: () => 1366 },
        height: { get: () => 768 },
      })
    })
    await page.route("**/chunks/*.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: "" }),
    )
    await page.setViewportSize({ width: 20, height: 600 })
    await page.goto(`chrome-extension://${extensionId}/${surface}.html`)
    expect(
      await page.evaluate(
        () => document.documentElement.getBoundingClientRect().width,
      ),
    ).toBe(20)
    expect(
      await page.evaluate(
        () => document.documentElement.dataset.compactExtensionPage,
      ),
    ).toBeUndefined()
  })
}
