import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
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

test("verification sidebar boundaries stay aligned throughout animated toggles", async ({
  context,
  extensionId,
  extensionDir,
  page,
}, testInfo) => {
  await stubLlmMetadataIndex(context)
  await forceExtensionLanguage(page, "zh-CN")
  await seedApiCredentialProfiles(await getServiceWorker(context), [
    createStoredApiCredentialProfile({
      name: "动画测试",
      baseUrl: "https://api.example.invalid",
      apiKey: "synthetic-key",
      telemetryConfig: { mode: "disabled" },
    }),
  ])
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  await page.getByTestId(IDS.verifyButton).first().click()
  const workspace = page.getByTestId("verification-workspace")
  await expect(workspace.locator("[data-verification-settings]")).toBeVisible()
  await expect(
    workspace.getByRole("heading", { name: "模型列表" }),
  ).toBeVisible()
  await workspace.evaluate(async (root) => {
    await document.fonts.ready
    await Promise.allSettled(
      root.getAnimations({ subtree: true }).map((a) => a.finished),
    )
  })

  for (const side of ["list", "settings"] as const) {
    for (const interrupted of [false, true]) {
      for (const expanded of [false, true]) {
        const samples = await workspace.evaluate(
          async (root, { side, interrupted }) => {
            const bar = root.querySelector("[data-verification-workspace-bar]")!
            const toggle = bar.querySelector<HTMLButtonElement>(
              side === "list"
                ? "button[aria-controls]"
                : ".verification-workspace-controls button",
            )!
            const frame = root.querySelector(".verification-workspace-frame")!
            const list = root.querySelector("[data-verification-list]")!
            const detail = root.querySelector(
              "[data-verification-detail]:not([hidden])",
            )!
            const header = bar.querySelector(
              ".verification-workspace-list-header",
            )!
            const controls = bar.querySelector(
              ".verification-workspace-controls",
            )!
            const settings = root.querySelector("[data-verification-settings]")!
            const samples: {
              time: number
              listGap: number
              headerGap: number
              settingsGap: number
              paneGap: number
              edge: number
              barHeight: number
              titleLines: number
              horizontalScrollbars: string[]
            }[] = []
            const start = performance.now()
            let reversals = 0
            toggle.click()
            await new Promise<void>((resolve) => {
              const sample = () => {
                if (
                  interrupted &&
                  reversals < 2 &&
                  performance.now() - start >= 60 * (reversals + 1)
                ) {
                  toggle.click()
                  reversals++
                }
                const bounds = detail.getBoundingClientRect()
                const listBounds = list.getBoundingClientRect()
                const title = controls.querySelector(
                  ".verification-settings-title",
                )!
                const titleRange = document.createRange()
                titleRange.selectNodeContents(title)
                const scrollContainers = [
                  ...root.querySelectorAll<HTMLElement>("*"),
                ]
                for (
                  let parent = root.parentElement;
                  parent;
                  parent = parent.parentElement
                )
                  scrollContainers.push(parent)
                samples.push({
                  time: performance.now() - start,
                  listGap: bounds.left - listBounds.right,
                  headerGap: header.getBoundingClientRect().right - bounds.left,
                  settingsGap:
                    bounds.right - controls.getBoundingClientRect().left,
                  paneGap:
                    bounds.right -
                    Math.min(
                      frame.getBoundingClientRect().right,
                      settings.getBoundingClientRect().left,
                    ),
                  edge:
                    side === "list"
                      ? listBounds.right
                      : settings.getBoundingClientRect().left,
                  barHeight: bar.getBoundingClientRect().height,
                  titleLines: new Set(
                    Array.from(titleRange.getClientRects(), (rect) => rect.top),
                  ).size,
                  horizontalScrollbars: scrollContainers
                    .filter(
                      (element) =>
                        element.clientWidth > 0 &&
                        element.scrollWidth > element.clientWidth + 1 &&
                        ["auto", "scroll"].includes(
                          getComputedStyle(element).overflowX,
                        ),
                    )
                    .map(
                      (element) => `${element.tagName}.${element.className}`,
                    ),
                })
                if (performance.now() - start < 450)
                  requestAnimationFrame(sample)
                else resolve()
              }
              requestAnimationFrame(sample)
            })
            return samples
          },
          { side, interrupted },
        )
        await testInfo.attach(
          `${side}-${expanded ? "open" : "close"}-${interrupted ? "interrupted" : "normal"}`,
          {
            body: JSON.stringify(samples, null, 2),
            contentType: "application/json",
          },
        )
        expect
          .soft(Math.max(...samples.map((s) => Math.abs(s.listGap))))
          .toBeLessThanOrEqual(1)
        expect
          .soft(Math.max(...samples.map((s) => Math.abs(s.headerGap))))
          .toBeLessThanOrEqual(1)
        expect
          .soft(
            Math.max(...samples.map((s) => s.barHeight)) -
              Math.min(...samples.map((s) => s.barHeight)),
          )
          .toBeLessThanOrEqual(1)
        expect
          .soft(Math.max(...samples.map((s) => s.titleLines)))
          .toBeLessThanOrEqual(1)
        expect.soft(samples.flatMap((s) => s.horizontalScrollbars)).toEqual([])
        // Snapping straight to the end must not pass as an aligned animation.
        const edges = samples.map((sample) => sample.edge)
        const minEdge = Math.min(...edges)
        const maxEdge = Math.max(...edges)
        expect
          .soft(
            edges.filter((edge) => edge > minEdge + 1 && edge < maxEdge - 1)
              .length,
          )
          .toBeGreaterThanOrEqual(2)
        // The closed settings control occupies 48px above the full-width detail.
        if (side === "settings") {
          expect
            .soft(Math.max(...samples.map((s) => Math.max(0, -s.settingsGap))))
            .toBeLessThanOrEqual(1)
          expect
            .soft(Math.max(...samples.map((s) => Math.abs(s.paneGap))))
            .toBeLessThanOrEqual(1)
        }
      }
    }
  }
  if (process.env.AAH_VISUAL_CAPTURE_DIR) {
    await captureVisualViews({
      page,
      ready: workspace,
      id: "expanded",
      extensionDir,
    })
    const toggle = workspace.getByRole("button", { name: "配置", exact: true })
    await toggle.click()
    await workspace.evaluate(async (root) => {
      await Promise.allSettled(
        root
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished),
      )
      root
        .querySelector<HTMLButtonElement>(
          ".verification-workspace-controls button",
        )!
        .click()
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      // Retain an actual opening frame without allowing screenshots to finish transitions.
      for (const animation of root.getAnimations({ subtree: true })) {
        animation.pause()
        animation.currentTime = 30
      }
    })
    await captureVisualViews({
      page,
      ready: workspace,
      id: "settings-opening",
      extensionDir,
      animations: "allow",
    })
    await workspace.evaluate((root) => {
      for (const animation of root.getAnimations({ subtree: true }))
        animation.play()
    })
  }
})

test("verification sidebars release their space and retain the selected test", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  await stubLlmMetadataIndex(context)
  await forceExtensionLanguage(page, "zh-CN")
  await seedApiCredentialProfiles(await getServiceWorker(context), [
    createStoredApiCredentialProfile({
      name: "布局测试",
      baseUrl: "https://api.example.invalid",
      apiKey: "synthetic-key",
      telemetryConfig: { mode: "disabled" },
    }),
  ])
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  await page.getByTestId(IDS.verifyButton).first().click()

  const workspace = page.getByTestId("verification-workspace")
  const bar = workspace.locator("[data-verification-workspace-bar]")
  const frame = workspace.locator(".verification-workspace-frame")
  const list = workspace.locator("[data-verification-list]")
  const detail = workspace.locator("[data-verification-detail]:visible")
  const settings = page.locator("[data-verification-settings]:visible")
  const settingsToggle = bar.getByRole("button", { name: "配置", exact: true })
  const introduction = detail.getByRole("heading", { name: "模型列表" })
  await expect(settings).toBeVisible()
  await expect(introduction).toBeVisible()
  await captureVisualViews({
    page,
    ready: workspace,
    id: "expanded",
    extensionDir,
  })
  const barBox = (await bar.boundingBox())!
  const frameBox = (await frame.boundingBox())!
  // The toolbar and all three panes share continuous boundaries.
  expect
    .soft(Math.abs(frameBox.y - barBox.y - barBox.height))
    .toBeLessThanOrEqual(1)
  const listBox = (await list.boundingBox())!
  const detailBox = (await detail.boundingBox())!
  const settingsBox = (await settings.boundingBox())!
  expect
    .soft(Math.abs(detailBox.x - listBox.x - listBox.width))
    .toBeLessThanOrEqual(1)
  expect
    .soft(Math.abs(settingsBox.x - detailBox.x - detailBox.width))
    .toBeLessThanOrEqual(1)

  for (const [id, collapseList, collapseSettings] of [
    ["list-collapsed", true, false],
    ["both-collapsed", true, true],
    ["settings-collapsed", false, true],
  ] as const) {
    const listToggle = bar.getByRole("button", { name: /测试侧栏/ })
    if (
      (await listToggle.getAttribute("aria-expanded")) !== String(!collapseList)
    )
      await listToggle.click()
    if (
      (await settingsToggle.getAttribute("aria-expanded")) !==
      String(!collapseSettings)
    )
      await settingsToggle.click()
    await expect(introduction).toBeVisible()
    await captureVisualViews({ page, ready: workspace, id, extensionDir })
    const bounds = (await detail.boundingBox())!
    if (collapseList) {
      const railBox = (await list.boundingBox())!
      expect.soft(railBox.width).toBeCloseTo(56, 0)
      expect
        .soft(Math.abs(bounds.x - frameBox.x - railBox.width))
        .toBeLessThanOrEqual(1)
      await expect(
        list.locator("[data-verification-summary-collapsed]").first(),
      ).toBeVisible()
    }
    if (collapseSettings) {
      await expect(settings).toBeHidden()
      expect
        .soft(Math.abs(bounds.x + bounds.width - frameBox.x - frameBox.width))
        .toBeLessThanOrEqual(1)
    }
  }

  const listToggle = bar.getByRole("button", { name: /测试侧栏/ })
  if ((await listToggle.getAttribute("aria-expanded")) !== "false")
    await listToggle.click()
  await page.setViewportSize({ width: 420, height: 840 })
  await expect(detail).toBeVisible()
  await expect(
    detail.getByText("获取接口返回的模型名称与数量，供后续测试选择模型。"),
  ).toBeVisible()
  await captureVisualViews({
    page,
    ready: workspace,
    id: "narrow-collapsed",
    extensionDir,
  })
  await listToggle.click()
  await expect(
    page
      .getByRole("dialog", { name: "测试项目", exact: true })
      .getByRole("button", { name: "文本生成", exact: true }),
  ).toBeVisible()
  await settingsToggle.click()
  await expect(settings).toBeVisible()
  await captureVisualViews({
    page,
    ready: settings,
    id: "narrow-settings",
    extensionDir,
  })
  await page.getByRole("dialog", { name: "配置", exact: true }).focus()
  await page.keyboard.press("Escape")
  await expect(settings).toBeHidden()
  await expect(settingsToggle).toBeFocused()

  await page.setViewportSize({ width: 1024, height: 768 })
  await settingsToggle.click()
  await expect(settings).toBeVisible()
  await captureVisualViews({
    page,
    ready: settings,
    id: "medium-settings",
    extensionDir,
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => document.documentElement.classList.add("dark"))
  await captureVisualViews({
    page,
    ready: workspace,
    id: "expanded-dark",
    extensionDir,
  })
  await expect
    .poll(() =>
      workspace.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1)
})
