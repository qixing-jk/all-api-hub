import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { forceExtensionLanguage } from "~~/e2e/utils/commonUserFlows"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

test("dev panel keeps tools readable across surfaces and themes", async ({
  page,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await page.addInitScript(() => {
    localStorage.setItem("aah_dev_features_unlocked", "true")
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  for (const surface of ["options", "popup", "sidepanel"]) {
    await page.goto(`chrome-extension://${extensionId}/${surface}.html`)
    await waitForExtensionRoot(page)
    await page.getByRole("button", { name: "Dev: Open dev panel" }).click()
    const panel = page.getByRole("dialog", { name: "Dev panel", exact: true })
    await expect(panel).toBeVisible()
    await expect(
      panel.getByRole("group", { name: "Build information" }),
    ).toBeVisible()
    await expect(panel.getByText("Dev pages", { exact: true })).toHaveCount(0)
    await panel.getByRole("tab", { name: "Toolbox", exact: true }).click()
    await panel.getByRole("button", { name: "Dialogs", exact: true }).click()
    await expect(
      panel.getByRole("button", {
        name: "Dev: Trigger update log",
        exact: true,
      }),
    ).toBeVisible()
    await captureVisualViews({
      page,
      ready: panel,
      id: `dev-panel-${surface}`,
      extensionDir,
      views: [
        { id: "light", width: 420, height: 820, theme: "light" },
        { id: "dark", width: 320, height: 700, theme: "dark" },
      ],
    })
    // Expanding tools only reveals controls; never dispatch debug mutations.
    const collapsed = panel.locator('button[aria-expanded="false"]')
    while ((await collapsed.count()) > 0) {
      await collapsed.first().click()
    }
    for (const width of [420, 320]) {
      await page.setViewportSize({ width, height: 820 })
      const layout = await panel.evaluate((element) => ({
        overflows: element.scrollWidth > element.clientWidth,
        clippedLabels: Array.from(element.querySelectorAll("button span"))
          .filter((span) => span.scrollWidth > span.clientWidth + 1)
          .map((span) => span.textContent),
      }))
      expect(layout.overflows).toBe(false)
      expect(layout.clippedLabels).toEqual([])
    }
    await panel.getByRole("button", { name: "Close dev panel" }).click()
    await expect(panel).not.toBeVisible()
  }
})

test("auto check-in tools distinguish alarm, inspection, run and reset actions", async ({
  page,
  extensionId,
  extensionDir,
}) => {
  await forceExtensionLanguage(page, "en")
  await page.addInitScript(() =>
    localStorage.setItem("aah_dev_features_unlocked", "true"),
  )
  await page.goto(`chrome-extension://${extensionId}/options.html#autoCheckin`)
  await waitForExtensionRoot(page)
  await page.getByRole("button", { name: "Dev: Open dev panel" }).click()
  const group = page.getByRole("group", { name: "Current page", exact: true })
  const heading = group.getByText("Auto check-in", { exact: true })
  await expect(heading).toBeVisible()
  const actions = heading.locator("xpath=../../..").getByRole("button")
  await expect(actions).toHaveCount(6)
  const icons = await actions.evaluateAll((buttons) =>
    buttons.map((button) => button.querySelector("svg")?.getAttribute("class")),
  )
  expect(icons.every(Boolean)).toBe(true)
  expect(new Set(icons).size).toBe(6)
  await captureVisualViews({
    page,
    ready: group,
    id: "dev-panel-checkin",
    extensionDir,
    views: [
      { id: "light", width: 420, height: 820, theme: "light" },
      { id: "dark", width: 320, height: 700, theme: "dark" },
    ],
  })
})

test("developer pages remain available through the options sidebar", async ({
  page,
  extensionId,
}) => {
  await forceExtensionLanguage(page, "en")
  await page.addInitScript(() =>
    localStorage.setItem("aah_dev_features_unlocked", "true"),
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await waitForExtensionRoot(page)
  const labels = [
    "Browser API Lab (Dev)",
    "Mesh Gradient Lab (Dev)",
    "Unified API Guidance Preview (Dev)",
    "Star Promotion Preview (Dev)",
  ]
  for (const label of labels) {
    const entry = page
      .getByRole("navigation")
      .getByRole("button", { name: label, exact: true })
    await entry.click()
    await expect(entry).toHaveAttribute("aria-current", "page")
  }
})
