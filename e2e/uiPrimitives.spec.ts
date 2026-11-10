import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "@playwright/test"
import react from "@vitejs/plugin-react"
import { createServer, type ViteDevServer } from "vite"

const repoRoot = fileURLToPath(new URL("../", import.meta.url))
let server: ViteDevServer
let baseUrl: string

test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: path.join(repoRoot, "e2e/fixtures/uiPrimitives"),
    plugins: [react()],
    resolve: {
      alias: [
        {
          find: "~/features/ManagedSiteChannels/filters/channelFilters",
          replacement: path.join(
            repoRoot,
            "e2e/fixtures/uiPrimitives/channelFilters.ts",
          ),
        },
        {
          find: "~/services/productAnalytics/runtime/dispatch",
          replacement: path.join(
            repoRoot,
            "e2e/fixtures/uiPrimitives/analytics.ts",
          ),
        },
        { find: "~", replacement: path.join(repoRoot, "src") },
        { find: "~~", replacement: repoRoot },
      ],
    },
    define: { __AAH_DEV_IDENTITY__: "null" },
    server: {
      host: "127.0.0.1",
      port: 0,
      watch: null,
      fs: { allow: [repoRoot] },
    },
  })
  await server.listen()
  baseUrl = server.resolvedUrls!.local[0]!
})

test.afterAll(async () => {
  await server?.close()
})

test("a failed save restores Escape dismissal after disabling the focused button", async ({
  page,
}, testInfo) => {
  await page.goto(baseUrl)
  await page.getByRole("button", { name: "Edit channel rules" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("switch").click()
  const save = dialog.getByTestId("managed-site-channels-filter-save-button")
  await save.click()
  await expect(save).toBeDisabled()
  await expect(save).not.toBeFocused()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(new Event("fixture-save-failed")),
  )
  await expect(save).toBeEnabled()
  await page.screenshot({
    path: testInfo.outputPath("failed-save-focus.png"),
    animations: "disabled",
  })
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
})

test("a compact alert without an icon stacks its action on narrow screens", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto(baseUrl)
  const notice = page.getByRole("region", { name: "Iconless notice" })
  await notice.scrollIntoViewIfNeeded()
  const copy = await notice
    .getByText("This compact notice has no leading icon.")
    .boundingBox()
  const action = await notice
    .getByRole("button", { name: "Review details" })
    .boundingBox()
  if (!copy || !action) throw new Error("Missing alert bounds")
  await notice.screenshot({
    path: testInfo.outputPath("iconless-alert.png"),
    animations: "disabled",
  })
  expect(action.y).toBeGreaterThanOrEqual(copy.y + copy.height)
})

test("composed headers and actions fit narrow and wide layouts", async ({
  page,
}, testInfo) => {
  await page.goto(baseUrl)
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 1000 })
    const compositions = page.getByRole("region", { name: "Compositions" })
    await expect(compositions).toBeVisible()
    await compositions.screenshot({
      path: testInfo.outputPath(`compositions-${width}.png`),
      animations: "disabled",
    })
    expect(
      await compositions.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true)
    const search = await page
      .getByRole("textbox", { name: "Search keys" })
      .boundingBox()
    const heading = await page
      .getByRole("heading", {
        name: "Repair results with a longer localized heading",
      })
      .boundingBox()
    if (!search || !heading) throw new Error("Missing card header bounds")
    if (width === 320)
      expect(search.y).toBeGreaterThan(heading.y + heading.height)
    else expect(search.x).toBeGreaterThan(heading.x + heading.width)
    await expect(
      page.getByRole("spinbutton", { name: "Exchange rate" }),
    ).toHaveAccessibleDescription(
      "Enter the CNY value of one US dollar. Enter a positive number.",
    )
  }
})

test("vertical line tabs align with their keyboard navigation", async ({
  page,
}, testInfo) => {
  await page.goto(baseUrl)
  const list = page.getByRole("tablist", { name: "Views" })
  await expect(list).toHaveAttribute("aria-orientation", "vertical")
  await expect(list).toHaveCSS("flex-direction", "column")
  await page.getByRole("tab", { name: "Results", exact: true }).focus()
  await page.keyboard.press("ArrowDown")
  await expect(
    page.getByRole("tab", { name: "Readiness", exact: true }),
  ).toBeFocused()
  await expect(page.getByRole("tabpanel")).toHaveText("Account readiness")
  await page.getByRole("region", { name: "Navigation" }).screenshot({
    path: testInfo.outputPath("vertical-tabs.png"),
    animations: "disabled",
  })
})

test("badge hover feedback belongs to interactive badges", async ({ page }) => {
  await page.goto(baseUrl)
  const status = page.getByText("Static status", { exact: true })
  const idle = await status.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  )
  await status.hover()
  await expect.soft(status).toHaveCSS("background-color", idle)
  const link = page.getByRole("link", { name: "Open status" })
  const linkIdle = await link.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  )
  await link.hover()
  await expect(link).not.toHaveCSS("background-color", linkIdle)
})

test("compact toggles accept near-edge clicks without changing disabled controls", async ({
  page,
}, testInfo) => {
  await page.goto(baseUrl)
  const checkbox = page.getByRole("checkbox", {
    name: "Select account",
    exact: true,
  })
  await expect(checkbox).toHaveAttribute("aria-checked", "mixed")
  for (const control of [
    checkbox,
    page.getByRole("switch", { name: "Enable sync" }),
  ]) {
    await control.scrollIntoViewIfNeeded()
    const box = await control.boundingBox()
    if (!box) throw new Error("Missing toggle bounds")
    await page.mouse.click(box.x + box.width / 2, box.y - 3)
    await expect.soft(control).toBeChecked()
  }
  for (const control of [
    page.getByRole("checkbox", { name: "Disabled selection" }),
    page.getByRole("switch", { name: "Disabled sync" }),
  ]) {
    await control.scrollIntoViewIfNeeded()
    const box = await control.boundingBox()
    if (!box) throw new Error("Missing disabled toggle bounds")
    await page.mouse.click(box.x + box.width / 2, box.y - 3)
    await expect(control).not.toBeChecked()
  }
  await page.getByRole("region", { name: "Compact targets" }).screenshot({
    path: testInfo.outputPath("compact-targets.png"),
    animations: "disabled",
  })
})

test("an open row menu keeps its source row highlighted", async ({
  page,
}, testInfo) => {
  await page.goto(baseUrl)
  const row = page.getByRole("row", { includeHidden: true })
  const idle = await row.evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.getByRole("button", { name: "Account actions" }).click()
  await page.getByRole("menuitem", { name: "Inspect account" }).hover()
  await page.screenshot({
    path: testInfo.outputPath("expanded-row.png"),
    animations: "disabled",
  })
  await expect(row).not.toHaveCSS("background-color", idle)
  await page.keyboard.press("Escape")
  await page.mouse.move(0, 0)
  await expect(row).toHaveCSS("background-color", idle)
})

test("a combobox list contains scrolling when its last choice is reached", async ({
  page,
}, testInfo) => {
  await page.goto(baseUrl)
  await page.getByRole("combobox", { name: "Choose model" }).click()
  const list = page.getByRole("listbox")
  await expect(list).toBeVisible()
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await list.screenshot({
    path: testInfo.outputPath("combobox-list.png"),
    animations: "disabled",
  })
  const before = await page.evaluate(() => window.scrollY)
  await list.hover()
  await page.mouse.wheel(0, 400)
  await expect(list).toHaveCSS("overscroll-behavior-y", "contain")
  expect(await page.evaluate(() => window.scrollY)).toBe(before)
})

test("invalid textareas expose a distinct error border in both themes", async ({
  page,
}, testInfo) => {
  await page.goto(baseUrl)
  const valid = page.getByRole("textbox", { name: "Valid JSON", exact: true })
  const invalid = page.getByRole("textbox", {
    name: "Invalid JSON",
    exact: true,
  })
  await expect(invalid).toBeVisible()
  for (const theme of ["light", "dark"]) {
    await page
      .locator("html")
      .evaluate(
        (el, dark) => el.classList.toggle("dark", dark),
        theme === "dark",
      )
    await page.getByRole("region", { name: "Textareas" }).screenshot({
      path: testInfo.outputPath(`textarea-${theme}.png`),
      animations: "disabled",
    })
    const normalBorder = await valid.evaluate(
      (el) => getComputedStyle(el).borderColor,
    )
    await expect.soft(invalid).not.toHaveCSS("border-color", normalBorder)
  }
})
