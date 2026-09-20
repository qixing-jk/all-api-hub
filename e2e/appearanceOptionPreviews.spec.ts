import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import en from "~/locales/en/settings.json" with { type: "json" }
import zhCN from "~/locales/zh-CN/settings.json" with { type: "json" }
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

for (const { width, language, copy } of [
  { width: 1280, language: "en", copy: en },
  { width: 390, language: "en", copy: en },
  { width: 320, language: "en", copy: en },
  { width: 390, language: "zh-CN", copy: zhCN },
]) {
  test(`appearance options show their own effects at ${width}px in ${language}`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await forceExtensionLanguage(page, language)
    await stubLlmMetadataIndex(context)
    await seedUserPreferences(await getServiceWorker(context), {
      themeMode: "dark",
      appearance: {
        density: "compact",
        textSize: "extra-large",
        fontFamily: "serif",
      },
    })
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
    await page
      .getByRole("button", { name: copy.appearance.title, exact: true })
      .click()
    const drawer = page.getByRole("dialog", { name: copy.appearance.title })
    const mode = drawer.getByRole("group", {
      name: copy.theme.mode,
      exact: true,
    })
    const light = mode
      .getByRole("radio", { name: copy.theme.light, exact: true })
      .locator("..")
      .locator("[data-color-scope]")
    const dark = mode
      .getByRole("radio", { name: copy.theme.dark, exact: true })
      .locator("..")
      .locator("[data-color-scope]")
    await expect(light).toHaveCSS("background-color", "rgb(255, 255, 255)")
    await expect(dark).not.toHaveCSS("background-color", "rgb(255, 255, 255)")
    await mode
      .getByRole("radio", { name: copy.theme.dark, exact: true })
      .focus()
    await page.mouse.move(0, 0)
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`options-top-${width}.png`),
    })

    const density = drawer.getByRole("group", {
      name: copy.appearance.density,
      exact: true,
    })
    const gaps: number[] = []
    for (const name of [
      copy.appearance.densities.compact,
      copy.appearance.densities.default,
      copy.appearance.densities.comfortable,
    ]) {
      const sample = density
        .getByRole("radio", { name, exact: true })
        .locator("..")
        .locator("[data-theme-density]")
      gaps.push(
        await sample.evaluate((el) => parseFloat(getComputedStyle(el).rowGap)),
      )
    }
    expect(gaps[0]).toBeLessThan(gaps[1])
    expect(gaps[1]).toBeLessThan(gaps[2])
    const sizes = drawer.getByRole("group", {
      name: copy.appearance.textSize,
      exact: true,
    })
    for (const [name, size] of [
      [copy.appearance.textSizes.default, "16px"],
      [copy.appearance.textSizes.large, "18px"],
      [copy.appearance.textSizes.extraLarge, "20px"],
    ]) {
      await expect(
        sizes
          .getByRole("radio", { name, exact: true })
          .locator("..")
          .getByText("Aa", { exact: true }),
      ).toHaveCSS("font-size", size)
    }
    const fonts = drawer.getByRole("group", {
      name: copy.appearance.font,
      exact: true,
    })
    await expect(
      fonts
        .getByRole("radio", { name: copy.appearance.fonts.sans, exact: true })
        .locator("..")
        .getByText("Aa", { exact: true }),
    ).not.toHaveCSS("font-family", /Georgia/)
    await expect(
      fonts
        .getByRole("radio", { name: copy.appearance.fonts.serif, exact: true })
        .locator("..")
        .getByText("Aa", { exact: true }),
    ).toHaveCSS("font-family", /Georgia/)

    for (const group of await drawer.getByRole("group").all()) {
      await group.scrollIntoViewIfNeeded()
      expect(
        await group.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
      for (const label of await group.locator("label").all()) {
        expect(
          await label.evaluate(
            (el) =>
              el.scrollWidth <= el.clientWidth &&
              el.scrollHeight <= el.clientHeight,
          ),
        ).toBe(true)
      }
    }
    await density.scrollIntoViewIfNeeded()
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`options-typography-${width}.png`),
    })
    await drawer
      .getByRole("group", { name: copy.appearance.contentWidth, exact: true })
      .scrollIntoViewIfNeeded()
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`options-layout-${width}.png`),
    })
    const large = sizes.getByRole("radio", {
      name: copy.appearance.textSizes.large,
      exact: true,
    })
    await large.locator("..").click()
    await expect(large).toBeChecked()
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-density",
      "compact",
    )
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-text-size",
      "large",
    )
    await large.focus()
    await page.keyboard.press("ArrowRight")
    await expect(
      sizes.getByRole("radio", {
        name: copy.appearance.textSizes.extraLarge,
        exact: true,
      }),
    ).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(
      page.getByRole("button", { name: copy.appearance.title, exact: true }),
    ).toBeFocused()
  })
}
