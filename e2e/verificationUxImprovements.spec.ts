import { writeFile } from "node:fs/promises"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS as IDS } from "~/features/ApiCredentialProfiles/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  seedApiCredentialProfiles,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

for (const width of [390, 1600]) {
  test(`verification task settings and composer review at ${width}px`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width, height: 844 })
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const baseUrl = "https://ux-improvements.example.test"
    await context.route(`${baseUrl}/v1/models`, (route) =>
      route.fulfill({ json: { data: [{ id: "gpt-first" }] } }),
    )
    await seedApiCredentialProfiles(await getServiceWorker(context), [
      createStoredApiCredentialProfile({
        id: "ux-improvements",
        name: "UI review",
        baseUrl,
        apiKey: "synthetic-key",
        apiType: "openai-compatible",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/options.html#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    const workspace = page.getByTestId("verification-workspace")
    const footerClose = page.getByTestId(IDS.verifyDialogCloseButton)
    if (width === 390) await expect.soft(footerClose).toBeHidden()
    else await expect(footerClose).toBeVisible()
    const capture = (id: string) =>
      captureVisualViews({
        page,
        ready: workspace,
        id: `${id}-${width}`,
        extensionDir,
      })
    const inspectMotion = async (
      side: "left" | "right",
      state: "open" | "closed",
    ) => {
      const samples = await workspace.evaluate(
        async (node, { side, state }) => {
          const sheet = node.querySelector<HTMLElement>(
            `.verification-sidebar-sheet[data-side="${side}"][data-state="${state}"]`,
          )
          if (!sheet) return { duration: null, animation: null, frames: [] }
          const style = getComputedStyle(sheet)
          const duration = style.animationDuration
          const animation = style.animationName
          const frames: {
            panel: number
            detail: number
            width: number
            opacity: number
            listRows: number
          }[] = []
          for (let frame = 0; frame < 22 && sheet.isConnected; frame++) {
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            )
            if (!sheet.isConnected) break
            const host = node.querySelector<HTMLElement>(
              ".verification-workspace-frame",
            )!
            const detail = node.querySelector<HTMLElement>(
              "[data-verification-detail]:not([hidden])",
            )!
            const frameBox = host.getBoundingClientRect()
            const detailBox = detail.getBoundingClientRect()
            frames.push({
              panel: sheet.getBoundingClientRect().left - frameBox.left,
              detail: detailBox.left - frameBox.left,
              width: detailBox.width,
              opacity: Number(getComputedStyle(node).opacity),
              listRows: sheet.querySelectorAll("[data-verification-summary]")
                .length,
            })
          }
          return { duration, animation, frames }
        },
        { side, state },
      )
      await writeFile(
        test.info().outputPath(`${side}-${state}-motion.json`),
        JSON.stringify(samples, null, 2),
      )
      expect(samples.duration).toBe("0.18s")
      expect(samples.animation).not.toBe("none")
      expect(samples.frames.length).toBeGreaterThan(1)
      expect(
        Math.max(...samples.frames.map((sample) => Math.abs(sample.panel))),
      ).toBeGreaterThan(1)
      expect(
        samples.frames.every(
          (sample) =>
            Math.abs(sample.detail) < 1 &&
            sample.width > 0 &&
            sample.opacity === 1,
        ),
      ).toBe(true)
      if (side === "left")
        expect(samples.frames.every((sample) => sample.listRows > 0)).toBe(true)
    }
    const initialOptions = page.getByTestId(
      "verification-run-all-options-trigger",
    )
    await initialOptions.click()
    await capture("initial-concurrency")
    await expect(workspace).toHaveAttribute("data-list-collapsed", "false")
    const optionsPopover = page.getByTestId(
      "verification-run-all-options-popover",
    )
    await expect(optionsPopover).toBeVisible()
    await optionsPopover.getByRole("button", { name: /2 Moderate/ }).click()
    await expect(initialOptions).toHaveText(/^2$/)
    await page.keyboard.press("Escape")
    await expect(optionsPopover).toBeHidden()
    await expect(workspace).toHaveAttribute("data-list-collapsed", "false")
    await expect(initialOptions).toBeFocused()
    await initialOptions.click()
    await optionsPopover.getByRole("button", { name: /1 Safe/ }).click()
    await page.keyboard.press("Escape")
    await expect(initialOptions).toHaveText(/^1$/)
    if (width === 390) {
      await page.emulateMedia({ reducedMotion: "no-preference" })
      const listToggle = workspace.locator(
        ".verification-workspace-list-header button",
      )
      await listToggle.click()
      await inspectMotion("left", "closed")
      await expect(
        workspace.getByRole("dialog", { name: "Tests", exact: true }),
      ).toBeHidden()
      await listToggle.click()
      await inspectMotion("left", "open")
      await page.emulateMedia({ reducedMotion: "reduce" })
    }
    await expect(
      workspace.getByRole("button", {
        name: "Tool/function calling",
        exact: true,
      }),
    ).toBeVisible()
    const longName = workspace
      .getByRole("button", { name: "Tool/function calling", exact: true })
      .locator("span")
      .filter({ hasText: /^Tool\/function calling$/ })
      .last()
    expect(
      await longName.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true)
    const contextName = workspace.getByRole("button", {
      name: "Context capacity test",
      exact: true,
    })
    const contextHelp = workspace.getByRole("button", {
      name: "About the context capacity test",
      exact: true,
    })
    const nameBox = await contextName.boundingBox()
    const helpBox = await contextHelp.boundingBox()
    expect.soft(nameBox).not.toBeNull()
    expect.soft(helpBox).not.toBeNull()
    expect
      .soft(helpBox!.x - (nameBox!.x + nameBox!.width))
      .toBeLessThanOrEqual(10)
    expect
      .soft(helpBox!.x - (nameBox!.x + nameBox!.width))
      .toBeGreaterThanOrEqual(0)
    await capture("test-names")
    const initialListIcon = await workspace
      .locator(".verification-workspace-list-header button svg:visible")
      .boundingBox()
    const initialSettingsIcon = await workspace
      .locator(".verification-workspace-controls button svg:visible")
      .boundingBox()
    await workspace
      .getByRole("button", { name: "Needle in a haystack", exact: true })
      .click()
    await expect(
      workspace.getByRole("group", { name: "Text lengths (tokens)" }),
    ).toBeVisible()
    await capture("current-test-action")
    await capture("mobile-navigation")
    if (width === 390) {
      const selectedListIcon = await workspace
        .locator(".verification-workspace-list-header button svg:visible")
        .boundingBox()
      const selectedSettingsIcon = await workspace
        .locator(".verification-workspace-controls button svg:visible")
        .boundingBox()
      expect(Math.abs(selectedListIcon!.x - initialListIcon!.x)).toBeLessThan(1)
      expect(
        Math.abs(selectedSettingsIcon!.x - initialSettingsIcon!.x),
      ).toBeLessThan(1)
      await expect(
        workspace.getByRole("button", {
          name: /Expand test list/,
          exact: true,
        }),
      ).toContainText("Needle in a haystack")
      await expect(
        workspace.getByRole("button", { name: "Settings", exact: true }),
      ).toContainText("Settings")
      const switcherBox = await workspace
        .getByRole("button", { name: /Expand test list/ })
        .boundingBox()
      const statusBox = await workspace
        .locator("[data-verification-header-identity]")
        .boundingBox()
      const settingsBox = await workspace
        .getByRole("button", { name: "Settings", exact: true })
        .boundingBox()
      expect(switcherBox!.x + switcherBox!.width).toBeLessThanOrEqual(
        statusBox!.x,
      )
      expect(statusBox!.x + statusBox!.width).toBeLessThanOrEqual(
        settingsBox!.x,
      )
    }
    const configuration = workspace.getByRole("button", {
      name: "Settings",
      exact: true,
    })
    const detailBeforeSettings = await workspace
      .locator("[data-verification-detail]:not([hidden])")
      .boundingBox()
    if (width === 390)
      await page.emulateMedia({ reducedMotion: "no-preference" })
    if ((await configuration.getAttribute("aria-expanded")) !== "true")
      await configuration.click()
    if (width === 390) {
      await inspectMotion("right", "open")
      const samples = await workspace.evaluate(async (node) => {
        const values: { left: number; width: number; opacity: number }[] = []
        for (let frame = 0; frame < 16; frame++) {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          )
          const detail = node.querySelector<HTMLElement>(
            "[data-verification-detail]:not([hidden])",
          )
          if (detail) {
            const bounds = detail.getBoundingClientRect()
            values.push({
              left: bounds.left,
              width: bounds.width,
              opacity: Number(getComputedStyle(node).opacity),
            })
          }
        }
        return values
      })
      await test.info().attach("settings-overlay-motion", {
        body: JSON.stringify(samples),
        contentType: "application/json",
      })
      await writeFile(
        test.info().outputPath("settings-overlay-motion.json"),
        JSON.stringify(samples, null, 2),
      )
      expect(samples.length).toBeGreaterThan(0)
      expect(
        Math.min(...samples.map((sample) => sample.width)),
      ).toBeGreaterThan(0)
      expect(
        Math.max(
          ...samples.map((sample) =>
            Math.abs(sample.left - detailBeforeSettings!.x),
          ),
        ),
      ).toBeLessThan(1)
      expect(samples.every((sample) => sample.opacity === 1)).toBe(true)
      await page.emulateMedia({ reducedMotion: "reduce" })
    }
    const quick = workspace.getByLabel("Test only the longest text", {
      exact: true,
    })
    await quick.scrollIntoViewIfNeeded()
    await expect(quick).toBeVisible()
    await initialOptions.click()
    await expect(configuration).toHaveAttribute("aria-expanded", "true")
    await expect(quick).toBeVisible()
    await expect(optionsPopover).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(optionsPopover).toBeHidden()
    await expect(configuration).toHaveAttribute("aria-expanded", "true")
    await expect(quick).toBeVisible()
    await capture("needle-settings-preview")
    const cost = workspace.locator(
      '[data-verification-test-settings]:not([hidden]) [aria-live="polite"]',
    )
    await expect(cost).toBeVisible()
    await expect(cost).toContainText("Requests: 3")
    await quick.click()
    await expect(cost).toContainText("Requests: 6")
    await quick.click()
    await configuration.click()
    if (width === 390) {
      await page.emulateMedia({ reducedMotion: "no-preference" })
      await configuration.click()
      await expect(quick).toBeVisible()
      await configuration.click()
      await inspectMotion("right", "closed")
      await page.emulateMedia({ reducedMotion: "reduce" })
    }
    const tests = workspace.getByRole("button", {
      name: /Expand test list/,
      exact: true,
    })
    if (await tests.isVisible()) await tests.click()
    await workspace
      .getByRole("button", { name: "Q&A test", exact: true })
      .click()
    const question = workspace.getByRole("textbox", {
      name: "Question",
      exact: true,
    })
    await expect(question).toBeVisible()
    await capture("reference-answer-access")
    await workspace
      .getByRole("button", { name: "Edit reference answer", exact: true })
      .click()
    await expect(
      workspace.getByRole("textbox", {
        name: "Reference answer (optional)",
        exact: true,
      }),
    ).toBeFocused()
    await configuration.click()
    const concurrency = page.getByTestId("verification-run-all-options-trigger")
    await expect(concurrency).toHaveText(/^1$/)
    await concurrency.hover()
    await expect(
      page.getByRole("tooltip").filter({ hasText: "Parallel: 1" }),
    ).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(
      page.getByRole("tooltip").filter({ hasText: "Parallel: 1" }),
    ).toBeHidden()
    await capture("routine-concurrency-value")
    await captureVisualViews({
      page,
      ready: workspace,
      id: `compact-footer-${width}`,
      extensionDir,
      views: [{ id: "dark", width, height: 844, theme: "dark" }],
    })
    await question.focus()
    await expect(
      workspace
        .locator("[data-verification-detail]:not([hidden])")
        .getByText("Enter runs · Shift+Enter adds a line", {
          exact: true,
        }),
    ).toBeVisible()
    await capture("keyboard-hint")
    if (await tests.isVisible()) await tests.click()
    await workspace
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    const prompt = workspace.getByRole("textbox", {
      name: "Text generation prompt",
      exact: true,
    })
    await expect(prompt).toBeVisible()
    await prompt.focus()
    await capture("prompt-save-scope")
    const saveHint = workspace
      .locator("[data-verification-detail]:not([hidden])")
      .getByText("Auto-save", { exact: true })
    await expect(saveHint).toBeVisible()
    await saveHint.hover()
    await expect(
      page.getByRole("tooltip").filter({
        hasText: "Auto-saved for this test across accounts and credentials.",
      }),
    ).toBeVisible()
    await page
      .locator(".verification-dialog")
      .getByRole("button", {
        name: "Close",
        exact: true,
      })
      .first()
      .click()
    await expect(workspace).toBeHidden()
    if (width === 390) {
      await forceExtensionLanguage(page, "zh-CN")
      await page.reload()
      await waitForExtensionRoot(page)
      await page.getByTestId(IDS.verifyButton).click()
      await capture("mobile-list-zh")
      await workspace
        .getByRole("button", { name: "文本生成", exact: true })
        .click()
      await capture("mobile-text-header-zh")
      const textTitle = workspace.locator(
        ".verification-workspace-list-header button span",
      )
      const textWidth = await textTitle.evaluate((node) => ({
        visible: node.clientWidth,
        full: node.scrollWidth,
      }))
      expect(textWidth.visible).toBeGreaterThanOrEqual(textWidth.full)
      await workspace.getByRole("button", { name: /文本生成.*展开/ }).click()
      await workspace
        .getByRole("button", { name: "模型列表", exact: true })
        .click()
      await expect(
        workspace.getByRole("button", { name: /模型列表.*展开/ }),
      ).toBeVisible()
      await capture("mobile-header-zh")
      await page.setViewportSize({ width: 320, height: 844 })
      await workspace.getByRole("button", { name: /模型列表.*展开/ }).click()
      await workspace
        .getByRole("button", { name: "上下文容量测试", exact: true })
        .click()
      await expect(
        workspace.getByRole("button", { name: /上下文容量测试.*展开/ }),
      ).toBeInViewport()
      await expect(
        workspace.getByRole("button", { name: "配置", exact: true }),
      ).toBeInViewport()
      await capture("mobile-header-zh-320")
      await context.unroute(`${baseUrl}/v1/models`)
      await context.route(`${baseUrl}/v1/models`, (route) =>
        route.fulfill({ json: { data: [] } }),
      )
      await page.setViewportSize({ width: 390, height: 844 })
      await page.reload()
      await waitForExtensionRoot(page)
      await page.getByTestId(IDS.verifyButton).click()
      await workspace
        .getByRole("button", { name: "文本生成", exact: true })
        .click()
      await expect(
        workspace
          .locator("[data-verification-test-header]:not([hidden])")
          .getByText("请输入模型 ID 后运行该测试。", { exact: true }),
      ).toBeVisible()
      await capture("mobile-text-header-missing-model-zh")
      const missingModelTitle = workspace.locator(
        ".verification-workspace-list-header button span",
      )
      const missingModelWidth = await missingModelTitle.evaluate((node) => ({
        visible: node.clientWidth,
        full: node.scrollWidth,
      }))
      expect(missingModelWidth.visible).toBeGreaterThanOrEqual(
        missingModelWidth.full,
      )
    }
  })
}
