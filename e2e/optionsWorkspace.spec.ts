import { ACCOUNT_MANAGEMENT_TEST_IDS as accountIds } from "~/features/AccountManagement/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import accountCopy from "~/locales/en/account.json" with { type: "json" }
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { readVisualThemeRoleColor } from "~~/e2e/utils/visualTheme"

test("navigation follows light and dark surface roles across theme switches", async ({
  page,
  context,
  extensionId,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await page.setViewportSize({ width: 1440, height: 960 })
  for (const preset of ["default", "anthropic"] as const) {
    for (const themeMode of ["light", "dark"] as const) {
      await seedUserPreferences(worker, { themeMode, appearance: { preset } })
      await page.goto(`chrome-extension://${extensionId}/options.html#basic`)
      await page.reload()
      await expect(
        page.getByRole("main").getByRole("heading").first(),
      ).toBeVisible()
      const navigationSurface = page.getByRole("navigation").locator("..")
      const navigationColor = await navigationSurface.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      )
      const workspaceColor = await page
        .getByRole("main")
        .evaluate((element) => {
          for (
            let node: Element | null = element;
            node;
            node = node.parentElement
          ) {
            const color = getComputedStyle(node).backgroundColor
            if (color !== "rgba(0, 0, 0, 0)") return color
          }
          return "transparent"
        })
      if (themeMode === "dark") {
        expect(navigationColor).not.toBe(workspaceColor)
      } else {
        expect(navigationColor).toBe(workspaceColor)
      }
      expect(navigationColor).toBe(
        await readVisualThemeRoleColor(page, "--sidebar"),
      )
    }
  }
})

for (const width of [1024, 1440, 390, 320]) {
  test(`page headers keep descriptions readable and actions ordered at ${width}px`, async ({
    page,
    context,
    extensionId,
  }, testInfo) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await page.setViewportSize({ width, height: 960 })
    await page.goto(`chrome-extension://${extensionId}/options.html#account`)
    const main = page.getByRole("main")
    const heading = main.getByRole("heading", {
      name: accountCopy.title,
      exact: true,
    })
    const description = main.getByText(accountCopy.description, { exact: true })
    const actions = page.getByTestId(accountIds.headerActions)
    await expect(description).toBeVisible()
    await expect(async () => {
      const titleBox = (await heading.boundingBox())!
      const actionsBox = (await actions.boundingBox())!
      const descriptionBox = (await description.boundingBox())!
      expect(descriptionBox.y).toBeGreaterThanOrEqual(
        titleBox.y + titleBox.height,
      )
      if (width < 768) {
        expect(actionsBox.y).toBeGreaterThanOrEqual(
          descriptionBox.y + descriptionBox.height,
        )
        const buttons = await actions.getByRole("button").all()
        let previousTop = -Infinity
        for (const button of buttons) {
          const box = (await button.boundingBox())!
          if (box.y > previousTop + 1) {
            expect(Math.abs(box.x - descriptionBox.x)).toBeLessThanOrEqual(1)
          }
          previousTop = box.y
        }
      } else {
        expect(descriptionBox.y).toBeGreaterThanOrEqual(
          actionsBox.y + actionsBox.height,
        )
      }
      const expectedWidth = await description.evaluate((element) => {
        const header = element.closest(
          '[class*="[container-type:inline-size]"]',
        )!
        return Math.min(
          header.getBoundingClientRect().width,
          parseFloat(getComputedStyle(element).maxWidth),
        )
      })
      expect(
        Math.abs(descriptionBox.width - expectedWidth),
      ).toBeLessThanOrEqual(1)
    }).toPass({ timeout: 3000 })
    await page.screenshot({
      path: testInfo.outputPath(`description-${width}.png`),
      animations: "disabled",
    })
  })
}

for (const width of [1440, 390, 320]) {
  test(`workspace actions and settings remain usable at ${width}px`, async ({
    page,
    context,
    extensionId,
  }, testInfo) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, {
      models: ["gpt-4o", "claude-sonnet-4"],
    })
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, { themeMode: "light" })
    await seedStoredAccounts(worker, [
      createStoredAccount({ id: "workspace-alpha", site_name: "Alpha API" }),
      createStoredAccount({ id: "workspace-beta", site_name: "Beta API" }),
    ])
    await page.setViewportSize({ width, height: 960 })
    await page.goto(`chrome-extension://${extensionId}/options.html#account`)
    const main = page.getByRole("main")
    await expect(
      main.getByRole("heading", { name: "Account Management", exact: true }),
    ).toBeVisible()
    const header = page.getByRole("banner")
    const language = header.getByRole("button", {
      name: /^Interface language selector:/,
    })
    await expect(language).toBeInViewport()
    await language.click()
    await expect(
      page.getByRole("menuitemradio", { name: "English", exact: true }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(language).toBeFocused()
    await expect(
      header.getByRole("button", { name: "More", exact: true }),
    ).toHaveCount(0)

    const actions = page.getByTestId(accountIds.headerActions)
    const add = page.getByTestId(accountIds.addAccountButton)
    await expect(add).toBeInViewport()
    await expect(
      actions.getByRole("button", { name: "More", exact: true }),
    ).toHaveCount(0)
    for (const button of await actions.getByRole("button").all()) {
      await expect(button).toBeInViewport()
    }
    const importButton = page.getByTestId(accountIds.bookmarkImportButton)
    await importButton.click()
    const dialog = page.getByTestId(accountIds.bookmarkImportDialog)
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible()
    await expect(importButton).toBeFocused()

    for (const route of [
      "account",
      "keys",
      "models?accountId=workspace-alpha",
      "basic",
    ]) {
      await page.goto(`chrome-extension://${extensionId}/options.html#${route}`)
      await expect(main.getByRole("heading").first()).toBeVisible()
      if (route === "keys") {
        const keyActions = main.getByRole("group").first()
        await expect(
          keyActions.getByRole("button", { name: "More", exact: true }),
        ).toHaveCount(0)
        expect(await keyActions.getByRole("button").count()).toBeGreaterThan(1)
        for (const button of await keyActions.getByRole("button").all()) {
          await expect(button).toBeInViewport()
        }
      }
      if (route.startsWith("models")) {
        await expect(
          page.getByTestId(MODEL_LIST_TEST_IDS.modelDisplay),
        ).toBeVisible()
      }
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`${route.split("?")[0]}-${width}.png`),
        animations: "disabled",
      })
    }

    if (width === 1440) {
      const section = page.locator("#general-display")
      const heading = section.getByRole("heading").first()
      const field = page.locator("#display-currency-unit")
      await expect
        .poll(
          async () =>
            (await field.boundingBox())!.x - (await heading.boundingBox())!.x,
        )
        .toBeGreaterThan(180)
    }
    await seedUserPreferences(worker, {
      themeMode: "dark",
      appearance: { density: "compact", textSize: "extra-large" },
    })
    await page.reload()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expect(main.getByRole("heading").first()).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`basic-${width}-dark-large.png`),
      animations: "disabled",
    })
  })
}
