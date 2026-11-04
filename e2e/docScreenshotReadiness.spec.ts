import path from "node:path"
import { pathToFileURL } from "node:url"
import { expect, test } from "@playwright/test"

const { waitForDocPageReady, waitForDocVisuals, scrollDocPageToAnchor } =
  await import(
    pathToFileURL(path.resolve("scripts/doc-screenshot-readiness.mjs")).href
  )

for (const state of ["pending", "missing", "transparent", "hidden"]) {
  test(`rejects an options page that remains ${state}`, async ({ page }) => {
    await page.setContent(
      state === "missing"
        ? "<main></main>"
        : `<main data-options-page-content style="opacity:${state === "transparent" ? "0" : "1"};display:${state === "hidden" ? "none" : "block"}">Demo</main>${state === "pending" ? "<div data-options-page-pending></div>" : ""}`,
    )
    await expect(waitForDocPageReady(page, { timeout: 200 })).rejects.toThrow(
      "Timeout",
    )
  })
}

test("waits for pending content to finish before allowing capture", async ({
  page,
}) => {
  await page.setContent(
    '<main data-options-page-content style="opacity:0">Demo</main><div data-options-page-pending></div>',
  )
  await page.evaluate(() => {
    setTimeout(() => {
      document.querySelector("[data-options-page-pending]")!.remove()
      document.querySelector<HTMLElement>("main")!.style.opacity = "1"
    }, 100)
  })
  await waitForDocPageReady(page, { timeout: 2000 })
  await expect(page.locator("[data-options-page-pending]")).toHaveCount(0)
  await expect(page.locator("main")).toHaveCSS("opacity", "1")
})

test("rejects a missing requested screenshot anchor", async ({ page }) => {
  await page.setContent("<main>Demo</main>")
  await expect(
    scrollDocPageToAnchor(page, "#missing", { timeout: 200 }),
  ).rejects.toThrow("Timeout")
})

test("waits for chart drawing to settle and rejects a chart that never settles", async ({
  page,
}) => {
  await page.setContent('<canvas width="40" height="40"></canvas>')
  await page.evaluate(() => {
    const context = document.querySelector("canvas")!.getContext("2d")!
    let frame = 0
    const timer = setInterval(() => {
      context.fillStyle = `rgb(${frame++ % 256}, 0, 0)`
      context.fillRect(0, 0, 40, 40)
    }, 16)
    Object.assign(window, { stopDemoChart: () => clearInterval(timer) })
  })
  await expect(waitForDocVisuals(page, { timeout: 500 })).rejects.toThrow(
    "Timeout",
  )
  await page.evaluate(() =>
    (window as unknown as { stopDemoChart: () => void }).stopDemoChart(),
  )
  await waitForDocVisuals(page, { timeout: 2000 })
})
