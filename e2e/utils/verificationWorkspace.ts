import { expect, type Locator, type Page } from "@playwright/test"

import enVerification from "~/locales/en/aiApiVerification.json" with { type: "json" }

import { captureVisualViews } from "./visualCapture"

/** The mobile switcher, status and settings share one aligned toolbar row. */
export async function expectVerificationMobileHeaderAligned(
  workspace: Locator,
) {
  const header = workspace.getByTestId("verification-active-test")
  const label = (await header.getAttribute("aria-label"))!
  const switcher = workspace.locator(
    ".verification-workspace-list-header button",
  )
  const title = switcher.getByText(label, { exact: true })
  const status = header.locator("[data-verification-header-status]:visible")
  await expect(title).toBeVisible()
  await expect(status).toBeVisible()
  const leftIcon = workspace.locator(
    ".verification-workspace-list-header button svg:visible",
  )
  const rightIcon = workspace.locator(
    ".verification-workspace-controls button svg:visible",
  )
  await expect
    .poll(async () => {
      const titleBox = (await title.boundingBox())!
      const icons = await Promise.all([
        leftIcon.boundingBox(),
        rightIcon.boundingBox(),
      ])
      return Math.max(
        ...icons.map((box) =>
          Math.abs(titleBox.y + titleBox.height / 2 - box!.y - box!.height / 2),
        ),
      )
    })
    .toBeLessThanOrEqual(1)
  const leftControl = (await leftIcon.boundingBox())!
  const rightControl = (await workspace
    .locator(".verification-workspace-controls")
    .boundingBox())!
  await expect
    .poll(async () => {
      const titleBox = (await title.boundingBox())!
      const statusBox = (await status.boundingBox())!
      const actionBoxes = await header
        .locator("[data-verification-header-actions]:visible")
        .evaluateAll((elements) =>
          elements.map((element) => element.getBoundingClientRect().toJSON()),
        )
      const bar = (await workspace
        .locator("[data-verification-workspace-bar]")
        .boundingBox())!
      expect(
        Math.abs(
          titleBox.y + titleBox.height / 2 - statusBox.y - statusBox.height / 2,
        ),
      ).toBeLessThanOrEqual(1)
      expect(titleBox.x).toBeGreaterThanOrEqual(
        leftControl.x + leftControl.width,
      )
      expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(rightControl.x)
      // Actions occupy their own mobile row below the test identity.
      for (const action of actionBoxes) {
        expect(action.x).toBeGreaterThanOrEqual(bar.x)
        expect(action.x + action.width).toBeLessThanOrEqual(bar.x + bar.width)
      }
      return Math.max(0, titleBox.x + titleBox.width - statusBox.x)
    })
    .toBeLessThanOrEqual(1)
}

/** Observe the actual exit animation before Radix removes its surface. */
async function expectSheetExit(
  page: Page,
  sheet: Locator,
  close: () => Promise<void>,
  capture: () => Promise<void>,
) {
  await sheet.evaluate((element) => {
    element.setAttribute("data-motion-probe", "closing")
    element.addEventListener("animationstart", (event) => {
      if (
        event.target === element &&
        (event as AnimationEvent).animationName === "exit"
      )
        element.setAttribute("data-observed-exit", "true")
    })
  })
  const closingSurface = page.locator(
    '[data-slot="sheet-content"][data-motion-probe="closing"]',
  )
  // Retain this exact node: Radix may remove it before the first assertion poll.
  const surface = await closingSurface.elementHandle()
  expect(surface).not.toBeNull()
  try {
    await close()
    await expect
      .poll(() => surface!.getAttribute("data-observed-exit"))
      .toBe("true")
    await expect.poll(() => surface!.getAttribute("data-state")).toBe("closed")
    await capture()
    await expect(closingSurface).toHaveCount(0)
  } finally {
    await surface?.dispose()
  }
}

/** A mobile entry offers test selection; outer Close works before and after choosing. */
export async function expectVerificationMobileEntry({
  page,
  workspace,
  dialog,
  open,
  extensionDir,
  id,
}: {
  page: Page
  workspace: Locator
  dialog: Locator
  open: () => Promise<void>
  extensionDir: string
  id: string
}) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: "no-preference" })
  for (const sidebar of [null, "Detail", "Settings"] as const) {
    await open()
    await expect(workspace).toHaveAttribute("data-layout", "stacked")
    await expect(
      page.getByRole("dialog", { name: "Tests", exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole("dialog", { name: "Tests", exact: true }),
    ).toHaveCSS("animation-name", "none")
    await expect(
      page.getByRole("dialog", { name: "Settings", exact: true }),
    ).toBeHidden()
    if (sidebar === "Detail") {
      const testsSheet = page.getByRole("dialog", {
        name: "Tests",
        exact: true,
      })
      await expectSheetExit(
        page,
        testsSheet,
        () =>
          testsSheet
            .getByRole("button", { name: "Model list", exact: true })
            .click(),
        () =>
          captureVisualViews({
            page,
            ready: workspace,
            id: `${id}-initial-list-exit`,
            extensionDir,
            animations: "allow",
          }),
      )
      await expect(
        page.getByRole("dialog", { name: "Tests", exact: true }),
      ).toBeHidden()
      await expect(
        workspace.locator("[data-verification-detail]:not([hidden])"),
      ).toBeVisible()
      await expectVerificationMobileHeaderAligned(workspace)
      await workspace
        .getByRole("button", { name: /Expand test list/, exact: true })
        .click()
      await expect(testsSheet).toHaveCSS("animation-name", "enter")
      await expectSheetExit(
        page,
        testsSheet,
        () =>
          workspace
            .getByRole("button", { name: /Collapse test list/, exact: true })
            .click(),
        () =>
          captureVisualViews({
            page,
            ready: workspace,
            id: `${id}-manual-list-exit`,
            extensionDir,
            animations: "allow",
          }),
      )
    } else if (sidebar === "Settings") {
      await workspace
        .getByRole("button", {
          name: "Settings",
          exact: true,
        })
        .click()
      await expect(
        page.getByRole("dialog", { name: sidebar, exact: true }),
      ).toBeVisible()
      const settingsSheet = page.getByRole("dialog", {
        name: "Settings",
        exact: true,
      })
      await expect(settingsSheet).toHaveCSS("animation-name", "enter")
      await expectSheetExit(
        page,
        settingsSheet,
        () =>
          workspace
            .getByRole("button", { name: "Settings", exact: true })
            .click(),
        () =>
          captureVisualViews({
            page,
            ready: workspace,
            id: `${id}-settings-exit`,
            extensionDir,
            animations: "allow",
          }),
      )
      await workspace
        .getByRole("button", { name: "Settings", exact: true })
        .click()
    } else {
      await captureVisualViews({
        page,
        ready: workspace,
        id: `${id}-mobile-initial`,
        extensionDir,
      })
    }
    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click()
    await expect(dialog).toBeHidden()
  }
  await page.emulateMedia({ reducedMotion: "reduce" })
  await open()
}

/** The full test list yields its viewport to the selected mobile detail. */
async function expectVerificationMobileSpacing({
  page,
  workspace,
  extensionDir,
  id,
}: {
  page: Page
  workspace: Locator
  extensionDir: string
  id: string
}) {
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(workspace).toHaveAttribute("data-layout", "stacked")
  const dialogBounds = await workspace.evaluate((element) =>
    element
      .closest('[data-slot="modal-panel"], [role="dialog"]')!
      .getBoundingClientRect()
      .toJSON(),
  )
  expect
    .soft(dialogBounds)
    .toMatchObject({ x: 0, y: 0, width: 390, height: 844 })
  const settingsSheet = page.getByRole("dialog", {
    name: "Settings",
    exact: true,
  })
  if (await settingsSheet.isVisible())
    await workspace
      .getByRole("button", { name: "Settings", exact: true })
      .click()
  const testsSheet = page.getByRole("dialog", { name: "Tests", exact: true })
  if (!(await testsSheet.isVisible()))
    await workspace
      .getByRole("button", { name: /Expand test list/, exact: true })
      .click()
  await expect(testsSheet).toBeVisible()
  await expect(testsSheet).toHaveAttribute("data-side", "left")
  const toolbarGaps = await workspace.evaluate((element) => {
    const left = element.querySelector(
      ".verification-workspace-list-header button",
    )!
    const right = element.querySelector(
      ".verification-workspace-controls button",
    )!
    return {
      left:
        left.querySelector("span")!.getBoundingClientRect().left -
        left.querySelector("svg")!.getBoundingClientRect().right,
      right:
        Array.from(right.querySelectorAll("svg"))
          .find((icon) => icon.getBoundingClientRect().width > 0)!
          .getBoundingClientRect().left -
        right.querySelector("span")!.getBoundingClientRect().right,
    }
  })
  expect(toolbarGaps.left).toBeGreaterThanOrEqual(6)
  expect(toolbarGaps.right).toBeGreaterThanOrEqual(6)
  const frame = workspace.locator(".verification-workspace-frame")
  const frameBox = (await frame.boundingBox())!
  await expect
    .poll(() => testsSheet.boundingBox())
    .toMatchObject({
      x: frameBox.x,
      y: frameBox.y,
      width: frameBox.width,
      height: frameBox.height,
    })
  const testsBounds = (await testsSheet.boundingBox())!
  const measureLayout = () =>
    workspace.evaluate((element) => {
      const frame = element
        .querySelector(".verification-workspace-frame")!
        .getBoundingClientRect()
      const bar = element
        .querySelector("[data-verification-workspace-bar]")!
        .getBoundingClientRect()
      const dialog = element
        .closest('[data-slot="modal-panel"], [role="dialog"]')!
        .getBoundingClientRect()
      return {
        frameY: frame.y,
        frameHeight: frame.height,
        toolbarHeight: bar.height,
        dialogY: dialog.y,
        dialogHeight: dialog.height,
      }
    })
  const expandedLayout = await measureLayout()
  expect(testsBounds).toMatchObject({
    x: frameBox.x,
    y: frameBox.y,
    width: frameBox.width,
    height: frameBox.height,
  })
  const collapseTests = workspace.getByRole("button", {
    name: /Collapse test list/,
    exact: true,
  })
  const accessibleTitle = (await testsSheet
    .getByRole("heading", { name: "Tests", exact: true })
    .boundingBox())!
  expect(
    Math.max(accessibleTitle.width, accessibleTitle.height),
  ).toBeLessThanOrEqual(1)
  const firstGroup = testsSheet.getByRole("heading", {
    name: "Routine tests",
    exact: true,
  })
  await captureVisualViews({
    page,
    ready: testsSheet,
    id: `${id}-spacing-expanded`,
    extensionDir,
  })
  expect((await firstGroup.boundingBox())!.y - testsBounds.y).toBe(8)
  const groupBox = (await firstGroup.boundingBox())!
  const listToggleBox = (await collapseTests.boundingBox())!
  await expect(
    testsSheet.getByRole("button", { name: "Close", exact: true }),
  ).toHaveCount(0)
  expect(listToggleBox.y + listToggleBox.height).toBeLessThanOrEqual(
    testsBounds.y,
  )
  expect(groupBox.height).toBeLessThanOrEqual(32)
  expect((await collapseTests.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  const groupSpacing = await testsSheet
    .locator("[data-verification-list-content] > section")
    .evaluateAll((sections) =>
      sections.map((section, index) => {
        const heading = section.querySelector("h6")!.getBoundingClientRect()
        const row = section
          .querySelector("[data-verification-summary]")!
          .getBoundingClientRect()
        const bounds = section.getBoundingClientRect()
        const previous = sections[index - 1]?.getBoundingClientRect()
        return {
          headingToRow: row.top - heading.bottom,
          headingHeight: heading.height,
          separatorBefore: previous ? bounds.top - previous.bottom : 0,
          separatorAfter: previous ? heading.top - bounds.top : 0,
        }
      }),
    )
  console.log(
    "Mobile test group spacing:",
    JSON.stringify({ id, groupSpacing }),
  )
  expect(groupSpacing).toHaveLength(2)
  for (const group of groupSpacing) {
    expect(group.headingToRow).toBeLessThanOrEqual(6)
  }
  const onDemand = groupSpacing[1]!
  expect(onDemand.headingHeight).toBeLessThanOrEqual(24)
  expect(onDemand.separatorBefore).toBeLessThanOrEqual(12)
  expect(onDemand.separatorAfter).toBeLessThanOrEqual(9)
  const first = testsSheet.locator(
    '[data-verification-probe="models"] [data-verification-summary]',
  )
  const second = testsSheet.locator(
    '[data-verification-probe="text-generation"] [data-verification-summary]',
  )
  const firstBox = (await first.boundingBox())!
  const secondBox = (await second.boundingBox())!
  expect(listToggleBox.y + listToggleBox.height).toBeLessThanOrEqual(firstBox.y)
  expect.soft(secondBox.y - firstBox.y - firstBox.height).toBeLessThanOrEqual(4)
  expect(firstBox.height).toBeGreaterThanOrEqual(44)
  await expect(
    testsSheet.locator("[data-verification-detail]:visible"),
  ).toHaveCount(0)
  const detail = workspace.locator("[data-verification-detail]:not([hidden])")
  await expect(detail).toHaveAttribute("aria-hidden", "true")
  await collapseTests.click()
  await expect(testsSheet).toBeHidden()
  console.log(
    "Mobile sidebar layout:",
    JSON.stringify({
      id,
      expanded: expandedLayout,
      collapsed: await measureLayout(),
    }),
  )
  await expect
    .poll(async () => {
      const collapsed = await measureLayout()
      return Math.max(
        ...Object.keys(expandedLayout).map((key) =>
          Math.abs(
            collapsed[key as keyof typeof collapsed] -
              expandedLayout[key as keyof typeof expandedLayout],
          ),
        ),
      )
    })
    .toBeLessThanOrEqual(1)
  const expand = workspace.getByRole("button", {
    name: /Expand test list/,
    exact: true,
  })
  await expect(expand).toBeFocused()
  await expand.click()
  await page.keyboard.press("Escape")
  await expect(testsSheet).toBeHidden()
  await expand.click()
  await page
    .getByTestId("verification-header")
    .click({ position: { x: 8, y: 8 } })
  await expect(testsSheet).toBeHidden()
  await expand.click()
  await first.getByRole("button", { name: "Model list", exact: true }).click()
  await expect(testsSheet).toBeHidden()
  await expect(
    workspace.getByRole("button", { name: /Expand test list/, exact: true }),
  ).toBeVisible()
  await expect(detail).toBeVisible()
  const title = detail.getByRole("heading", { name: "Model list", exact: true })
  const run = detail.getByTestId("probe-intro-run-button")
  await captureVisualViews({
    page,
    ready: workspace,
    id: `${id}-spacing-collapsed`,
    extensionDir,
  })
  const rail = workspace.locator("[data-verification-summary-collapsed] button")
  const railBoxes = await rail.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, height: box.height }
    }),
  )
  expect.soft(railBoxes.every((box) => box.height >= 44)).toBe(true)
  const rows = [...new Set(railBoxes.map((box) => box.y))]
  expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1)
  const detailBox = (await detail.boundingBox())!
  const intro = detail.locator("[data-verification-introduction]")
  const introBox = (await intro.boundingBox())!
  expect(
    Math.abs(detailBox.y + detailBox.height - frameBox.y - frameBox.height),
  ).toBeLessThanOrEqual(1)
  expect(introBox.height).toBeGreaterThanOrEqual(detailBox.height - 36)
  await expect(title).toBeVisible()
  await expect(run).toBeVisible()
  await page.setViewportSize({ width: 390, height: 1000 })
  await expect(detail.getByTestId("probe-intro-icon")).toBeVisible()
  await captureVisualViews({
    page,
    ready: detail,
    id: `${id}-spacing-tall-detail`,
    extensionDir,
  })
  await page.setViewportSize({ width: 390, height: 480 })
  await expect(detail.getByTestId("probe-intro-icon")).toBeHidden()
  if (await run.isVisible()) {
    const action = (await run.boundingBox())!
    const pane = (await detail.boundingBox())!
    expect(action.y + action.height).toBeLessThanOrEqual(pane.y + pane.height)
  }
  await detail.scrollIntoViewIfNeeded()
  await expect(detail).toBeInViewport()
  const compact = await detail.evaluate((element) => {
    const description = element
      .querySelector("[data-verification-introduction] p")!
      .getBoundingClientRect()
    const box = element.getBoundingClientRect()
    return {
      top: description.top,
      bottom: description.bottom,
      detailTop: box.top,
      detailBottom: box.bottom,
    }
  })
  expect(compact.top).toBeGreaterThanOrEqual(compact.detailTop - 1)
  expect(compact.bottom).toBeLessThanOrEqual(compact.detailBottom + 1)
  await captureVisualViews({
    page,
    ready: detail,
    id: `${id}-spacing-short`,
    extensionDir,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(title).toBeVisible()
  // A prompt keeps its natural control height; the introduction uses the rest.
  await workspace
    .getByRole("button", { name: "Text generation", exact: true })
    .click()
  const textDetail = workspace.locator(
    '[data-verification-detail-probe="text-generation"]',
  )
  const composer = textDetail.locator("[data-verification-composer]")
  const input = composer.getByRole("textbox")
  await input.fill("Draft survives list and detail switching")
  await input.evaluate((element) =>
    element.setAttribute("data-mobile-composer-draft", "retained"),
  )
  await workspace
    .getByRole("button", { name: /Expand test list/, exact: true })
    .click()
  await expect(textDetail).toHaveAttribute("aria-hidden", "true")
  await testsSheet
    .getByRole("button", { name: "Text generation", exact: true })
    .click()
  await expect(input).toHaveValue("Draft survives list and detail switching")
  await expect(input).toHaveAttribute("data-mobile-composer-draft", "retained")
  const contentBox = (await textDetail.boundingBox())!
  const composerBox = (await composer.boundingBox())!
  const copyBox = (await textDetail
    .locator("[data-verification-introduction]")
    .boundingBox())!
  expect(copyBox.y + copyBox.height).toBeLessThanOrEqual(composerBox.y + 1)
  expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(
    contentBox.y + contentBox.height + 1,
  )
  await captureVisualViews({
    page,
    ready: textDetail,
    id: `${id}-mobile-composer`,
    extensionDir,
  })
  await page.setViewportSize({ width: 390, height: 480 })
  await expect(textDetail.getByTestId("probe-intro-icon")).toBeHidden()
  await expect(textDetail.getByTestId("probe-intro-run-button")).toBeHidden()
  await expect(input).toBeVisible()
  const send = composer.getByRole("button", { name: "Run", exact: true })
  await send.scrollIntoViewIfNeeded()
  await expect(send).toBeInViewport()
  await captureVisualViews({
    page,
    ready: send,
    id: `${id}-mobile-composer-short`,
    extensionDir,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await workspace
    .getByRole("button", { name: /Expand test list/, exact: true })
    .click()
  return {
    width: testsBounds.width,
    measureLayout,
  }
}

/** Exercise real container CSS and nested Radix layers at the mobile boundary. */
export async function expectVerificationMobileSheet({
  page,
  workspace,
  extensionDir,
  id,
}: {
  page: Page
  workspace: Locator
  extensionDir: string
  id: string
}) {
  const testsGeometry = await expectVerificationMobileSpacing({
    page,
    workspace,
    extensionDir,
    id,
  })
  await page
    .getByRole("dialog", { name: "Tests", exact: true })
    .getByRole("button", { name: "Needle in a haystack", exact: true })
    .click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(workspace).toHaveAttribute("data-layout", "stacked")
  const toggle = workspace.getByRole("button", {
    name: "Settings",
    exact: true,
  })
  await expect(toggle).toBeVisible()
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expectVerificationMobileHeaderAligned(workspace)
    await captureVisualViews({
      page,
      ready: workspace,
      id: `${id}-header-${width}`,
      extensionDir,
    })
  }
  const closedLayout = await testsGeometry.measureLayout()
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click()
  await expect.poll(testsGeometry.measureLayout).toEqual(closedLayout)
  await captureVisualViews({
    page,
    ready: page.locator("[data-verification-settings]:visible"),
    id: `${id}-mobile-settings`,
    extensionDir,
  })
  const sheet = page.getByRole("dialog", { name: "Settings", exact: true })
  const accessibleTitle = (await sheet
    .getByRole("heading", { name: "Settings", exact: true })
    .boundingBox())!
  expect(
    Math.max(accessibleTitle.width, accessibleTitle.height),
  ).toBeLessThanOrEqual(1)
  const bounds = (await sheet.boundingBox())!
  await expect(sheet).toHaveAttribute("data-side", "right")
  await expect(
    page.getByRole("dialog", { name: "Tests", exact: true }),
  ).toBeHidden()
  expect(bounds.width).toBe(testsGeometry.width)
  const firstGroup = sheet.getByRole("heading", {
    name: "Request configuration",
    exact: true,
  })
  const currentGroup = sheet
    .locator("[data-verification-test-settings]:not([hidden]) h6")
    .first()
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await sheet
      .locator("[data-verification-settings-scroll]")
      .evaluate((element) => {
        element.scrollTop = 0
      })
    const settingsBounds = (await sheet.boundingBox())!
    expect((await currentGroup.boundingBox())!.y - settingsBounds.y).toBe(8)
    expect((await firstGroup.boundingBox())!.y).toBeGreaterThan(
      (await currentGroup.boundingBox())!.y,
    )
    await firstGroup.scrollIntoViewIfNeeded()
    expect((await firstGroup.boundingBox())!.height).toBeLessThanOrEqual(32)
    const requestToggle = firstGroup.getByRole("button")
    const requestToggleBox = (await requestToggle.boundingBox())!
    const settingsToggleBox = (await toggle.boundingBox())!
    await expect(
      sheet.getByRole("button", { name: "Close", exact: true }),
    ).toHaveCount(0)
    expect(requestToggleBox.height).toBeGreaterThanOrEqual(44)
    expect(settingsToggleBox.height).toBeGreaterThanOrEqual(44)
    const firstField = sheet.locator(
      "[data-verification-config] h6 + div > :first-child",
    )
    const firstFieldBox = (await firstField.boundingBox())!
    expect(firstFieldBox.y).toBeGreaterThanOrEqual(
      Math.max(
        requestToggleBox.y + requestToggleBox.height,
        settingsToggleBox.y + settingsToggleBox.height,
      ),
    )
    const headingCenters = await firstGroup
      .getByRole("button")
      .evaluate((button) =>
        [button.querySelector("span")!, button.querySelector("svg")!].map(
          (node) => {
            const box = node.getBoundingClientRect()
            return box.y + box.height / 2
          },
        ),
      )
    expect(
      Math.max(...headingCenters) - Math.min(...headingCenters),
    ).toBeLessThanOrEqual(0.5)
    await requestToggle.click()
    await expect(firstField).toBeHidden()
    await expect(sheet).toBeVisible()
    await requestToggle.click()
    await expect(firstField).toBeVisible()
    await captureVisualViews({
      page,
      ready: sheet,
      id: `${id}-request-header-${width}`,
      extensionDir,
    })
  }
  const frameBounds = (await workspace
    .locator(".verification-workspace-frame")
    .boundingBox())!
  expect(bounds.y).toBe(frameBounds.y)
  expect(bounds.height).toBe(frameBounds.height)
  expect(bounds.x + bounds.width).toBe(frameBounds.x + frameBounds.width)
  const apiKey = sheet.getByLabel("API Key", { exact: true })
  const hasKey = await apiKey.count()
  if (hasKey) {
    await apiKey.fill("sk-mobile-unsaved-draft")
    await apiKey.evaluate((element) => {
      element.setAttribute("data-mobile-draft", "retained")
    })
  }
  const selector = sheet
    .locator("[data-verification-config]")
    .getByRole("combobox")
    .first()
  await selector.click()
  const option = page.getByRole("option").first()
  await expect(option).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(option).toBeHidden()
  await expect(sheet).toBeVisible()
  await selector.click()
  await page.getByRole("option").first().click()
  const selection = await selector.textContent()
  const limit = sheet.getByRole("combobox", {
    name: "Maximum text length (tokens)",
    exact: true,
  })
  await limit.click()
  const preset = page.getByRole("option", { name: "Custom", exact: true })
  await expect(preset).toBeVisible()
  await preset.click()
  await expect(limit).toHaveText("Custom")
  const customLength = sheet.getByRole("spinbutton", {
    name: "Custom length (tokens)",
    exact: true,
  })
  await customLength.fill("16384")
  await toggle.click()
  await expect(sheet).toBeHidden()
  await expect.poll(testsGeometry.measureLayout).toEqual(closedLayout)
  await expect(toggle).toBeFocused()
  const selected = workspace.locator("[data-verification-detail]:not([hidden])")
  await expect(selected).toBeVisible()
  await expect(
    workspace.getByRole("button", { name: /Expand test list/, exact: true }),
  ).toBeVisible()
  await captureVisualViews({
    page,
    ready: selected,
    id: `${id}-mobile-collapsed`,
    extensionDir,
  })
  await toggle.click()
  await expect(sheet).toBeVisible()
  await expect(selector).toHaveText(selection!)
  await expect(limit).toHaveText("Custom")
  await expect(customLength).toHaveValue("16384")
  if (hasKey) {
    await expect(apiKey).toHaveValue("sk-mobile-unsaved-draft")
    await expect(apiKey).toHaveAttribute("data-mobile-draft", "retained")
  }
  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  await toggle.click()
  await expect(sheet).toBeVisible()
  await page
    .getByTestId("verification-header")
    .click({ position: { x: 8, y: 8 } })
  await expect(sheet).toBeHidden()
  await expect(workspace).toBeVisible()
  await workspace
    .getByRole("button", { name: /Expand test list/, exact: true })
    .click()
  await expect(selected).toHaveAttribute("aria-hidden", "true")
  await expect(selected).toHaveAttribute("inert", "")
  await page.setViewportSize({ width: 960, height: 900 })
  await expect(workspace).toHaveAttribute("data-layout", "split")
  await expect(selected).toBeVisible()
  await toggle.click()
  await expect(sheet).toBeHidden()
  const settings = workspace.locator("[data-verification-settings]")
  await expect(settings).toBeVisible()
  await expect
    .poll(async () => {
      const left = (await workspace
        .locator("[data-verification-list]")
        .boundingBox())!
      const right = (await settings.boundingBox())!
      return Math.abs(left.width - right.width)
    })
    .toBeLessThanOrEqual(1)
  await expect
    .poll(async () => {
      const detailBox = (await selected.boundingBox())!
      const settingsBox = (await settings.boundingBox())!
      return detailBox.x + detailBox.width - settingsBox.x
    })
    .toBeLessThanOrEqual(1)
  await captureVisualViews({
    page,
    ready: settings,
    id: `${id}-medium-split`,
    extensionDir,
  })
  await page.setViewportSize({ width: 1920, height: 1000 })
  await workspace
    .getByRole("button", {
      name: enVerification.verifyDialog.probes["tool-calling"],
      exact: true,
    })
    .click()
  const toolProbe = workspace.locator(
    '[data-verification-detail-probe="tool-calling"]',
  )
  for (const [view, width, height] of [
    ["wide", 1920, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height })
    await expect(workspace).toHaveAttribute(
      "data-layout",
      view === "wide" ? "split" : "stacked",
    )
    const settingsSheet = page.getByRole("dialog", {
      name: "Settings",
      exact: true,
    })
    if (await settingsSheet.isVisible())
      await workspace
        .getByRole("button", { name: "Settings", exact: true })
        .click()
    const testsSheet = page.getByRole("dialog", { name: "Tests", exact: true })
    if (await testsSheet.isVisible())
      await workspace
        .getByRole("button", { name: /Collapse test list/, exact: true })
        .click()
    await expect(toolProbe).toBeVisible()
    await expectVerificationComposerBelowIntroduction(
      toolProbe,
      enVerification.verifyDialog.intro.probes["tool-calling"],
    )
    const introduction = toolProbe.locator("[data-verification-introduction]")
    const centeringError = await introduction.evaluate((element) => {
      const region = element.getBoundingClientRect()
      const content =
        element.firstElementChild!.firstElementChild!.getBoundingClientRect()
      return Math.abs(
        content.y + content.height / 2 - region.y - region.height / 2,
      )
    })
    expect.soft(centeringError).toBeLessThanOrEqual(1)
    await captureVisualViews({
      page,
      ready: toolProbe.locator("[data-verification-introduction]"),
      id: `${id}-tool-intro-${view}`,
      extensionDir,
    })
  }
}

/** The idle introduction stays above the composer in the selected detail pane. */
export async function expectVerificationComposerBelowIntroduction(
  probe: Locator,
  introduction: string,
) {
  const detail = probe
    .page()
    .locator("[data-verification-detail]:not([hidden])")
  const copy = detail.getByText(introduction, { exact: true })
  const composer = detail.locator("[data-verification-composer]")
  await expect(copy).toBeVisible()
  await expect(composer).toBeVisible()
  const copyBounds = (await copy.boundingBox())!
  const composerBounds = (await composer.boundingBox())!
  const detailBounds = (await detail.boundingBox())!
  expect(copyBounds.y + copyBounds.height).toBeLessThanOrEqual(composerBounds.y)
  expect(composerBounds.y + composerBounds.height).toBeLessThanOrEqual(
    detailBounds.y + detailBounds.height,
  )
}

/** The workspace panes use the dialog width without a second outer gutter. */
export async function expectVerificationWorkspaceFlush(workspace: Locator) {
  await expect
    .poll(() =>
      workspace.evaluate((element) => {
        const shell = element.closest(
          '[data-slot="modal-panel"], [role="dialog"]',
        )!
        const box = element.getBoundingClientRect()
        const outer = shell.getBoundingClientRect()
        return Math.max(
          Math.abs(box.left - outer.left),
          Math.abs(box.right - outer.right),
        )
      }),
    )
    .toBeLessThanOrEqual(1)
}

/** Open the shared settings pane through its public control at any viewport. */
export async function showVerificationSettings(page: Page) {
  // Workspace measurements commit on the next animation frame after resize.
  // Read the settled setting state so an automatic pane closure cannot race this open.
  await page.getByTestId("verification-workspace").evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        const view = element.ownerDocument.defaultView!
        view.requestAnimationFrame(() =>
          view.requestAnimationFrame(() => resolve()),
        )
      }),
  )
  const toggle = page
    .getByTestId("verification-workspace")
    .getByRole("button", {
      name: /^(Settings|配置)$/,
    })
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click()
  await expect(page.locator("[data-verification-settings]")).toBeVisible()
  const sheet = page.locator('[data-slot="sheet-content"][data-side="right"]')
  if (await sheet.isVisible())
    await expect(sheet).toHaveAccessibleName(/^(Settings|配置)$/)
}

/** Resize can reopen the mobile list; select the current test to expose its detail. */
export async function showVerificationTest(page: Page, label: string) {
  const settingsSheet = page.locator(
    '[data-slot="sheet-content"][data-side="right"]',
  )
  if (await settingsSheet.isVisible())
    await page
      .getByTestId("verification-workspace")
      .locator(".verification-workspace-controls button")
      .click()
  const sheet = page.locator('[data-slot="sheet-content"][data-side="left"]')
  if (await sheet.isVisible())
    await sheet.getByRole("button", { name: label, exact: true }).click()
  else if (
    (await page
      .getByTestId("verification-active-test")
      .getAttribute("aria-label")) !== label
  )
    await page.getByRole("button", { name: label, exact: true }).click()
  await expect(page.getByTestId("verification-active-test")).toHaveAttribute(
    "aria-label",
    label,
  )
  await expect(
    page.locator("[data-verification-detail]:not([hidden])"),
  ).toBeVisible()
}
