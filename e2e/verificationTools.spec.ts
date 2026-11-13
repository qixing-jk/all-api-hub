import { writeFile } from "node:fs/promises"
import type { AddressInfo } from "node:net"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  getApiCredentialProfileVerifyProbeTestId,
  API_CREDENTIAL_PROFILES_TEST_IDS as IDS,
} from "~/features/ApiCredentialProfiles/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import enVerification from "~/locales/en/aiApiVerification.json" with { type: "json" }
import zhVerification from "~/locales/zh-CN/aiApiVerification.json" with { type: "json" }
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import {
  DRAWING_VERIFICATION_OUTCOMES,
  PELICAN_EXECUTION_MODES,
} from "~/services/verification/modelQuality/constants"
import {
  API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
  type ApiVerificationHistoryConfig,
  type ApiVerificationHistoryTarget,
} from "~/services/verification/verificationResultHistory/types"
import { serializeVerificationHistoryTarget } from "~/services/verification/verificationResultHistory/utils"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  seedApiCredentialProfiles,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
  getStoredUserPreferences,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { createDrawingServer } from "~~/e2e/utils/verificationDrawingServer"
import {
  expectVerificationComposerBelowIntroduction,
  expectVerificationMobileEntry,
  expectVerificationMobileHeaderAligned,
  expectVerificationMobileSheet,
  expectVerificationWorkspaceFlush,
  showVerificationSettings,
  showVerificationTest,
} from "~~/e2e/utils/verificationWorkspace"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import { buildNewApiToken } from "~~/tests/test-utils/newApiToken"

for (const source of ["profile", "account"] as const) {
  test(`mobile ${source} toolbar titles and composer fit without wasted space`, async ({
    context,
    extensionId,
    extensionDir,
    page,
  }) => {
    const baseUrl = "https://mobile-verification.example"
    await forceExtensionLanguage(page, "zh-CN")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    if (source === "profile") {
      await seedApiCredentialProfiles(worker, [
        createStoredApiCredentialProfile({ baseUrl, apiKey: "synthetic-key" }),
      ])
    } else {
      await stubNewApiSiteRoutes(context, {
        baseUrl,
        models: ["gpt-quality"],
        initialTokens: [buildNewApiToken({ key: "synthetic-key" })],
      })
      await seedStoredAccounts(worker, [
        createStoredAccount({ site_url: baseUrl }),
      ])
    }
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 380, height: 960 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}${source === "account" ? "?accountId=e2e-account-1" : ""}#${source === "profile" ? MENU_ITEM_IDS.API_CREDENTIAL_PROFILES : MENU_ITEM_IDS.MODELS}`,
    )
    await waitForExtensionRoot(page)
    await page
      .getByTestId(
        source === "profile"
          ? IDS.verifyButton
          : MODEL_LIST_TEST_IDS.verifyApiButton,
      )
      .first()
      .click()
    const workspace = page.getByTestId("verification-workspace")
    const testsSheet = page.getByRole("dialog", {
      name: zhVerification.verifyDialog.workspace.tests,
      exact: true,
    })
    if (!(await testsSheet.isVisible())) {
      await workspace
        .locator(".verification-workspace-list-header button")
        .click()
    }
    await page
      .getByRole("button", { name: "工具/函数调用", exact: true })
      .click()
    await expect(testsSheet).toBeHidden()
    // Capture the original layout even when the subsequent regression assertion fails.
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("mobile-tools.png"),
      animations: "disabled",
    })
    for (const width of [320, 380, 420]) {
      await page.setViewportSize({ width, height: 960 })
      await expectVerificationMobileHeaderAligned(workspace)
      const title = workspace.locator(
        ".verification-workspace-list-header button span",
      )
      expect(
        await title.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        ),
        "the full test title must be readable",
      ).toBeLessThanOrEqual(1)
    }
    await page.setViewportSize({ width: 380, height: 960 })
    const switcher = workspace.locator(
      ".verification-workspace-list-header button",
    )
    const status = workspace.locator(
      "[data-verification-header-status]:visible",
    )
    const toolbarBefore = await workspace
      .locator("[data-verification-workspace-bar]")
      .boundingBox()
    await page.emulateMedia({ reducedMotion: "no-preference" })
    await switcher.click()
    await expect(testsSheet).toBeVisible()
    await expect(testsSheet).toHaveCSS("animation-name", "enter")
    await expect(switcher).toContainText("工具/函数调用")
    await expect(status).toBeVisible()
    expect(
      await workspace
        .locator("[data-verification-workspace-bar]")
        .boundingBox(),
    ).toEqual(toolbarBefore)
    await page
      .getByRole("dialog")
      .filter({ has: workspace })
      .screenshot({
        path: test.info().outputPath("mobile-list-open.png"),
        animations: "disabled",
      })
    await switcher.click()
    await expect(testsSheet).toBeHidden()
    const rail = workspace.locator("[data-verification-list]").filter({
      has: page.locator("[data-verification-summary-collapsed]"),
    })
    await expect(rail).toBeVisible()
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("mobile-rail-ready.png"),
      animations: "allow",
    })
    const railMotion = await rail.evaluate((element) => {
      const animation = element.getAnimations()[0]
      if (!animation?.effect) return null
      const duration = animation.effect.getComputedTiming().duration
      if (typeof duration !== "number") return null
      animation.pause()
      animation.currentTime = duration / 2
      return {
        opacity: Number(getComputedStyle(element).opacity),
        top: element.getBoundingClientRect().top,
      }
    })
    expect(
      railMotion,
      "the horizontal test rail should reveal gradually",
    ).not.toBeNull()
    expect(railMotion!.opacity).toBeGreaterThan(0)
    expect(railMotion!.opacity).toBeLessThan(1)
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("mobile-rail-mid-transition.png"),
      animations: "allow",
    })
    if (process.env.AAH_VISUAL_CAPTURE_DIR) {
      for (let frame = 0; frame <= 6; frame++) {
        await rail.evaluate((element, fraction) => {
          const animation = element.getAnimations()[0]!
          const duration = animation.effect!.getComputedTiming().duration
          if (typeof duration === "number")
            animation.currentTime = duration * fraction
        }, frame / 6)
        await captureVisualViews({
          page,
          ready: rail,
          extensionDir,
          id: `rail-${source}-phase-${String(frame).padStart(3, "0")}`,
          animations: "allow",
        })
      }
    }
    await rail.evaluate((element) => element.getAnimations()[0]!.finish())
    await expect(rail).toHaveCSS("opacity", "1")
    expect((await rail.boundingBox())!.y).toBeGreaterThan(railMotion!.top)
    await page.emulateMedia({ reducedMotion: "reduce" })
    expect(
      await rail.evaluate((element) => element.getAnimations().length),
    ).toBe(0)
    await workspace
      .getByRole("button", { name: "文本生成", exact: true })
      .click()
    const detail = workspace.locator(
      '[data-verification-detail-probe="text-generation"]',
    )
    const composer = detail.locator("[data-verification-composer]")
    await expect(composer.getByRole("textbox")).toBeVisible()
    const input = composer.locator('[data-slot="input-group"]')
    for (const width of [320, 380, 420]) {
      await page.setViewportSize({ width, height: 960 })
      const model = composer.getByRole("button", { name: "模型", exact: true })
      const run = composer.getByRole("button", { name: "运行", exact: true })
      const modelBox = (await model.boundingBox())!
      const runBox = (await run.boundingBox())!
      expect(
        Math.abs(
          modelBox.y + modelBox.height / 2 - runBox.y - runBox.height / 2,
        ),
      ).toBeLessThanOrEqual(1)
    }
    await page.setViewportSize({ width: 380, height: 960 })
    await composer.getByRole("textbox").blur()
    await page.mouse.move(0, 0)
    await expect(page.getByRole("tooltip")).toBeHidden()
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("mobile-composer.png"),
      animations: "disabled",
    })
    const pane = (await detail.boundingBox())!
    const inputBounds = (await input.boundingBox())!
    expect(
      pane.y + pane.height - inputBounds.y - inputBounds.height,
      "composer should sit near the bottom of the detail pane",
    ).toBeLessThanOrEqual(24)
    await expect(input.getByLabel("自动保存", { exact: true })).toBeVisible()
    await input.getByLabel("自动保存", { exact: true }).focus()
    await expect(page.getByRole("tooltip")).toContainText(
      zhVerification.verifyDialog.composer.savedScope,
    )
  })
}

for (const source of ["profile", "account"] as const) {
  for (const outcome of Object.values(DRAWING_VERIFICATION_OUTCOMES)) {
    test(`restored ${outcome} history in the ${source} workspace`, async ({
      context,
      extensionId,
      extensionDir,
      page,
    }) => {
      const fixture = createDrawingServer()
      await new Promise<void>((resolve) =>
        fixture.server.listen(0, "127.0.0.1", resolve),
      )
      const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`
      try {
        await forceExtensionLanguage(page, "zh-CN")
        await stubLlmMetadataIndex(context)
        const worker = await getServiceWorker(context)
        if (source === "profile") {
          await seedApiCredentialProfiles(worker, [
            createStoredApiCredentialProfile({
              id: "history",
              name: "历史结果测试",
              apiType: "openai-compatible",
              baseUrl,
              apiKey: "synthetic-key",
              telemetryConfig: { mode: "disabled" },
            }),
          ])
        } else {
          await stubNewApiSiteRoutes(context, {
            baseUrl,
            models: ["gpt-quality"],
            initialTokens: [buildNewApiToken({ key: "synthetic-key" })],
          })
          await seedStoredAccounts(worker, [
            createStoredAccount({ site_url: baseUrl }),
          ])
          await context.route(`${baseUrl}/v1/chat/completions`, (route) =>
            route.continue(),
          )
        }
        const targets: ApiVerificationHistoryTarget[] =
          source === "profile"
            ? [
                { kind: "profile", profileId: "history" },
                {
                  kind: "profile-model",
                  profileId: "history",
                  modelId: "gpt-quality",
                },
              ]
            : [
                {
                  kind: "account-model",
                  accountId: "e2e-account-1",
                  modelId: "gpt-quality",
                },
              ]
        const verifiedAt = Date.now() - 2 * 24 * 60 * 60 * 1000
        const history: ApiVerificationHistoryConfig = {
          version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
          lastUpdated: verifiedAt,
          lastOrphanSweepAt: Date.now(),
          drawingSummaries: targets.map((target) => ({
            target,
            targetKey: serializeVerificationHistoryTarget(target),
            verifiedAt,
            apiType: "openai-compatible",
            modelId: "gpt-quality",
            latencyMs: 20000,
            executionMode: PELICAN_EXECUTION_MODES.Reply,
            outcome,
            steps: 0,
            calls: 0,
            files: outcome === DRAWING_VERIFICATION_OUTCOMES.Generated ? 1 : 0,
          })),
          summaries: targets.map((target) => ({
            target,
            targetKey: serializeVerificationHistoryTarget(target),
            verifiedAt,
            apiType: "openai-compatible",
            status: "fail",
            resolvedModelId: "gpt-quality",
            probes: [
              {
                id: "models",
                status: "pass",
                latencyMs: 120,
                summary: "Saved model-list result",
              },
              {
                id: "text-generation",
                status: "fail",
                latencyMs: 300,
                summary: "Saved connection failure",
              },
              {
                id: "structured-output",
                status: "unsupported",
                latencyMs: 100,
                summary: "Saved unsupported result",
              },
            ],
          })),
        }
        await setPlasmoStorageValue(
          worker,
          STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
          history,
          { lock: STORAGE_LOCKS.API_VERIFICATION_HISTORY },
        )
        await page.emulateMedia({ reducedMotion: "reduce" })
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(
          `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}${source === "account" ? "?accountId=e2e-account-1" : ""}#${source === "profile" ? MENU_ITEM_IDS.API_CREDENTIAL_PROFILES : MENU_ITEM_IDS.MODELS}`,
        )
        await waitForExtensionRoot(page)
        await page
          .getByTestId(
            source === "profile"
              ? IDS.verifyButton
              : MODEL_LIST_TEST_IDS.verifyApiButton,
          )
          .first()
          .click()
        const workspace = page.getByTestId("verification-workspace")
        await workspace
          .getByRole("button", { name: "绘图测试", exact: true })
          .click()
        const detail = workspace.locator(
          "[data-verification-detail]:not([hidden])",
        )
        const header = workspace.locator("[data-verification-header-identity]")
        await expect(header).toContainText("上次")
        await page.mouse.move(0, 0)
        await expect(
          page.getByText("模型数据加载成功", { exact: true }),
        ).toBeHidden()
        await captureVisualViews({
          page,
          ready: detail,
          id: `history-${source}-${outcome}-drawing`,
          extensionDir,
          views:
            source === "account" &&
            outcome === DRAWING_VERIFICATION_OUTCOMES.Generated
              ? [
                  { id: "mobile", width: 390, height: 844, theme: "light" },
                  { id: "short", width: 375, height: 669, theme: "light" },
                  { id: "desktop", width: 1280, height: 960, theme: "light" },
                  { id: "dark", width: 390, height: 844, theme: "dark" },
                ]
              : undefined,
        })
        const introduction = detail.locator("[data-verification-introduction]")
        await expect(introduction).toContainText(
          zhVerification.verifyDialog.tools.pelican.description,
        )
        await expect(introduction).toContainText(
          zhVerification.verifyDialog.history.storage.drawing,
        )
        const historyButton = header.getByRole("button")
        const badge = historyButton.locator('[data-slot="badge"]')
        expect(
          (await historyButton.boundingBox())!.height,
        ).toBeGreaterThanOrEqual(44)
        expect((await badge.boundingBox())!.height).toBeLessThanOrEqual(24)
        await expectVerificationMobileHeaderAligned(workspace)
        if (outcome === DRAWING_VERIFICATION_OUTCOMES.Generated) {
          for (const name of ["模型列表", "文本生成", "结构化输出"]) {
            await workspace.getByRole("button", { name, exact: true }).click()
            await expect(
              detail.locator("[data-verification-introduction]"),
            ).toContainText(zhVerification.verifyDialog.history.storage.probe)
            await expect(
              detail.getByRole("region", { name: "执行结果" }),
            ).toHaveCount(0)
            await page.mouse.move(0, 0)
            await captureVisualViews({
              page,
              ready: detail,
              id: `history-${source}-${name === "模型列表" ? "pass" : name === "文本生成" ? "fail" : "unsupported"}-probe`,
              extensionDir,
            })
          }
          await workspace
            .getByRole("button", { name: "绘图测试", exact: true })
            .click()
          await detail.getByTestId("probe-intro-run-button").click()
          await expect(detail.getByTestId("pelican-svg-preview")).toBeVisible()
          await expect(
            header.locator("[data-verification-header-status]:not([hidden])"),
          ).not.toContainText("上次")
          await expect(header.locator("time")).toHaveCount(0)
          await expect(
            detail.locator("[data-verification-introduction]"),
          ).toHaveCount(0)
        }
      } finally {
        await new Promise<void>((resolve, reject) =>
          fixture.server.close((error) => (error ? reject(error) : resolve())),
        )
      }
    })
  }
  test(`mobile settings sheet in the ${source} workspace`, async ({
    context,
    extensionId,
    extensionDir,
    page,
  }) => {
    const baseUrl = "https://mobile-verification.example.test"
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await context.route(`${baseUrl}/v1/models`, (route) =>
      route.fulfill({ json: { data: [{ id: "gpt-quality" }] } }),
    )
    const worker = await getServiceWorker(context)
    if (source === "profile") {
      await seedApiCredentialProfiles(worker, [
        createStoredApiCredentialProfile({
          id: "mobile",
          name: "Mobile verification",
          apiType: "openai-compatible",
          baseUrl,
          apiKey: "synthetic-key",
          telemetryConfig: { mode: "disabled" },
        }),
      ])
    } else {
      await stubNewApiSiteRoutes(context, {
        baseUrl,
        models: ["gpt-quality"],
        initialTokens: [buildNewApiToken({ key: "synthetic-key" })],
      })
      await seedStoredAccounts(worker, [
        createStoredAccount({ site_url: baseUrl }),
      ])
    }
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1920, height: 1000 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}${source === "account" ? "?accountId=e2e-account-1" : ""}#${source === "profile" ? MENU_ITEM_IDS.API_CREDENTIAL_PROFILES : MENU_ITEM_IDS.MODELS}`,
    )
    await waitForExtensionRoot(page)
    const launch = page
      .getByTestId(
        source === "profile"
          ? IDS.verifyButton
          : MODEL_LIST_TEST_IDS.verifyApiButton,
      )
      .first()
    const workspace = page.getByTestId("verification-workspace")
    await expectVerificationMobileEntry({
      page,
      workspace,
      dialog: page.locator('[data-slot="modal-content"]'),
      open: () => launch.click(),
      extensionDir,
      id: source,
    })
    await expectVerificationMobileSheet({
      page,
      workspace,
      extensionDir,
      id: source,
    })
    await workspace
      .getByRole("button", { name: "Model list", exact: true })
      .click()
    await workspace
      .locator("[data-verification-detail]:not([hidden])")
      .getByTestId("probe-intro-run-button")
      .click()
    const summary = workspace.locator("[data-verification-header-content]")
    await expect(summary).toBeVisible()
    await expect(summary).not.toBeEmpty()
    await expectVerificationMobileHeaderAligned(workspace)
    const identity = (await workspace
      .locator("[data-verification-header-identity]")
      .boundingBox())!
    expect((await summary.boundingBox())!.y).toBeGreaterThanOrEqual(
      identity.y + identity.height,
    )
    await captureVisualViews({
      page,
      ready: summary,
      id: `${source}-header-summary`,
      extensionDir,
    })
  })
  test(`generation result details in the ${source} workspace`, async ({
    context,
    extensionId,
    extensionDir,
    page,
  }) => {
    const fixture = createDrawingServer({
      textResponse: () => "OK",
      reasoningText: "The requested answer is OK. Return only that answer.",
    })
    await new Promise<void>((resolve) =>
      fixture.server.listen(0, "127.0.0.1", resolve),
    )
    const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`
    try {
      await stubLlmMetadataIndex(context)
      await forceExtensionLanguage(page, "zh-CN")
      const worker = await getServiceWorker(context)
      if (source === "profile") {
        await seedApiCredentialProfiles(worker, [
          createStoredApiCredentialProfile({
            id: "result-tabs",
            name: "结果展示测试",
            apiType: "openai-compatible",
            baseUrl,
            apiKey: "synthetic-key",
            telemetryConfig: { mode: "disabled" },
          }),
        ])
      } else {
        await stubNewApiSiteRoutes(context, {
          baseUrl,
          models: ["gpt-quality"],
          initialTokens: [buildNewApiToken({ key: "synthetic-key" })],
        })
        await seedStoredAccounts(worker, [
          createStoredAccount({ site_url: baseUrl }),
        ])
        await context.route(`${baseUrl}/v1/chat/completions`, (route) =>
          route.continue(),
        )
      }
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.setViewportSize({ width: 1280, height: 960 })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}${source === "account" ? "?accountId=e2e-account-1" : ""}#${source === "profile" ? MENU_ITEM_IDS.API_CREDENTIAL_PROFILES : MENU_ITEM_IDS.MODELS}`,
      )
      await waitForExtensionRoot(page)
      await page
        .getByTestId(
          source === "profile"
            ? IDS.verifyButton
            : MODEL_LIST_TEST_IDS.verifyApiButton,
        )
        .first()
        .click()
      const probe = page.locator('[data-verification-probe="text-generation"]')
      await probe.getByRole("button", { name: "文本生成", exact: true }).click()
      const detail = page.locator(
        '[data-verification-detail-probe="text-generation"]',
      )
      await expectVerificationComposerBelowIntroduction(
        probe,
        zhVerification.verifyDialog.intro.probes["text-generation"],
      )
      const prompt = detail.getByRole("textbox", {
        name: "文本生成 提示词",
        exact: true,
      })
      await prompt.fill("Reply with exactly: OK. This is an unsaved edit.")
      await prompt.press("Enter")
      const result = detail.getByRole("region", {
        name: "执行结果",
        exact: true,
      })
      await expect(probe.locator("[data-verification-summary]")).toContainText(
        "通过",
      )
      await expect(result.getByText("OK", { exact: true })).toBeVisible()
      await expect(
        result.getByRole("button", { name: "执行结果", exact: true }),
      ).toHaveCount(0)
      await expect(
        result.getByText(
          zhVerification.verifyDialog.summaries.textGenerationSucceeded,
        ),
      ).toHaveCount(0)
      await expect(result.getByText("输入 token", { exact: true })).toHaveCount(
        0,
      )
      await expect(result.getByRole("log", { name: "测试过程" })).toBeVisible()
      expect((await result.boundingBox())!.height).toBeGreaterThan(300)
      expect((await detail.boundingBox())!.x).toBeLessThan(
        (await page.locator("[data-verification-settings]").boundingBox())!.x,
      )
      await expect(
        result.getByRole("button", {
          name: zhVerification.verifyDialog.generation.reasoning,
          exact: true,
        }),
      ).toBeVisible()
      expect(fixture.requests).toHaveLength(1)
      expect(fixture.prompts).toEqual([
        "Reply with exactly: OK. This is an unsaved edit.",
      ])
      // Results remain readable when prompt controls use most of a short pane.
      const workspace = page.getByTestId("verification-workspace")
      await page.setViewportSize({ width: 420, height: 480 })
      await expect(workspace).toHaveAttribute("data-layout", "stacked")
      const testsSheet = page.getByRole("dialog", {
        name: zhVerification.verifyDialog.workspace.tests,
        exact: true,
      })
      if (await testsSheet.isVisible())
        await workspace
          .getByRole("button", { name: /收起测试侧栏/, exact: false })
          .click()
      await expect(result).toBeVisible()
      expect((await result.boundingBox())!.height).toBeGreaterThanOrEqual(128)
      await expectVerificationMobileHeaderAligned(workspace)
      const statisticsButton = workspace
        .getByTestId("verification-active-test")
        .getByRole("button", { name: "统计", exact: true })
      await expect(statisticsButton).toBeInViewport()
      await captureVisualViews({
        page,
        ready: result,
        id: `generation-${source}-short`,
        extensionDir,
      })
      await page.setViewportSize({ width: 420, height: 900 })
      await captureVisualViews({
        page,
        ready: result,
        id: `generation-${source}-narrow`,
        extensionDir,
      })
      await page.setViewportSize({ width: 1280, height: 960 })
      await expect(workspace).toHaveAttribute("data-layout", "split")
      const expandTests = workspace.getByRole("button", {
        name: zhVerification.verifyDialog.workspace.expandTests,
        exact: false,
      })
      if (await expandTests.isVisible()) await expandTests.click()
      await captureVisualViews({
        page,
        ready: result,
        // Keep scroll-driven fades at the current scroll position; reduced motion
        // already stabilizes ordinary transitions in this workflow.
        animations: "allow",
        id: `generation-${source}`,
        extensionDir,
        views: [
          { id: "light", width: 1280, height: 960, theme: "light" },
          { id: "dark", width: 1280, height: 960, theme: "dark" },
        ],
      })
      await result
        .getByRole("button", {
          name: zhVerification.verifyDialog.generation.reasoning,
        })
        .click()
      await expect(
        result.getByText(
          "The requested answer is OK. Return only that answer.",
        ),
      ).toBeVisible()
      // Keep evidence in view when the statistics capture changes to mobile.
      await workspace
        .getByRole("button", {
          name: zhVerification.verifyDialog.workspace.collapseTests,
          exact: false,
        })
        .click()
      const settingsToggle = workspace.getByRole("button", {
        name: zhVerification.verifyDialog.workspace.settings,
        exact: true,
      })
      if ((await settingsToggle.getAttribute("aria-expanded")) === "true")
        await settingsToggle.click()
      await page
        .locator("[data-verification-active-test]")
        .getByRole("button", { name: "统计", exact: true })
        .click()
      const statistics = page.getByRole("dialog", {
        name: "统计",
        exact: true,
      })
      await expect(statistics).toBeVisible()
      await captureVisualViews({
        page,
        ready: statistics,
        extensionDir,
        id: `statistics-${source}`,
        views: [
          { id: "light", width: 1280, height: 960, theme: "light" },
          { id: "narrow", width: 420, height: 900, theme: "light" },
          { id: "dark", width: 1280, height: 960, theme: "dark" },
        ],
      })
      await expect
        .poll(async () => {
          const popup = (await statistics.boundingBox())!
          const trigger = (await page
            .locator("[data-verification-active-test]")
            .getByRole("button", { name: "统计", exact: true })
            .boundingBox())!
          return Math.min(
            Math.abs(popup.y + popup.height - trigger.y),
            Math.abs(popup.y - trigger.y - trigger.height),
          )
        })
        .toBeLessThanOrEqual(12)
      await expect(
        statistics.getByText("输入 token", { exact: true }),
      ).toBeVisible()
      await statistics
        .getByRole("button", { name: "指标说明", exact: true })
        .click()
      const metricsHelp = page.getByRole("tooltip").filter({
        hasText: zhVerification.verifyDialog.generation.metricsHint,
      })
      await expect(metricsHelp).toBeVisible()
      const statisticsBounds = (await statistics.boundingBox())!
      const hintBounds = (await metricsHelp.boundingBox())!
      const left = Math.min(statisticsBounds.x, hintBounds.x)
      const top = Math.min(statisticsBounds.y, hintBounds.y)
      await page.screenshot({
        path: test.info().outputPath(`metrics-help-${source}.png`),
        animations: "disabled",
        clip: {
          x: left,
          y: top,
          width:
            Math.max(
              statisticsBounds.x + statisticsBounds.width,
              hintBounds.x + hintBounds.width,
            ) - left,
          height:
            Math.max(
              statisticsBounds.y + statisticsBounds.height,
              hintBounds.y + hintBounds.height,
            ) - top,
        },
      })
      await page.keyboard.press("Escape")
      await expect(metricsHelp).toBeHidden()
      await expect(statistics).toBeVisible()
      await expect(result).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(statistics).toBeHidden()
      await result.getByRole("button", { name: "请求详情" }).click()
      await expect(result.getByText(/"text": "OK"/)).toBeVisible()
      await result
        .getByRole("button", { name: "请求详情", exact: true })
        .click()
      expect(fixture.requests).toHaveLength(1)
    } finally {
      fixture.server.closeAllConnections()
      await new Promise<void>((resolve) =>
        fixture.server.close(() => resolve()),
      )
    }
  })
}

for (const source of ["profile", "account"] as const) {
  test(`on-demand Q&A uses the ${source} connection without changing routine results`, async ({
    context,
    extensionDir,
    extensionId,
    page,
  }) => {
    let finishStream!: () => void
    const streamGate = new Promise<void>((resolve) => {
      finishStream = resolve
    })
    const initialText =
      "**Calculating**\n\n" +
      Array.from(
        { length: 24 },
        (_, index) =>
          `Observed step ${index + 1}: checking the supplied information.\n\n`,
      ).join("")
    const fixture = createDrawingServer({
      textResponse: () => initialText + "FINAL_ANSWER: 21",
      reasoningText:
        Array.from(
          { length: 12 },
          (_, i) =>
            `Reasoning observation ${i + 1}: considering the available information.`,
        ).join("\n\n") + "\n\nCheck the question before answering.",
      streamTextChunks: (text) => [
        text.slice(0, initialText.length),
        text.slice(initialText.length),
      ],
      afterStreamChunk: async (_request, index) => {
        if (index === 0) await streamGate
      },
    })
    await new Promise<void>((resolve) =>
      fixture.server.listen(0, "127.0.0.1", resolve),
    )
    const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`
    try {
      await stubLlmMetadataIndex(context)
      await forceExtensionLanguage(page, "en")
      const worker = await getServiceWorker(context)
      if (source === "profile") {
        await seedApiCredentialProfiles(worker, [
          createStoredApiCredentialProfile({
            id: "qa-profile",
            name: "Q&A fixture",
            apiType: "openai-compatible",
            baseUrl,
            apiKey: "synthetic-key",
            telemetryConfig: { mode: "disabled" },
          }),
        ])
      } else {
        await stubNewApiSiteRoutes(context, {
          baseUrl,
          models: ["gpt-quality"],
          initialTokens: [buildNewApiToken({ key: "synthetic-key" })],
        })
        await seedStoredAccounts(worker, [
          createStoredAccount({ site_url: baseUrl }),
        ])
        await context.route(`${baseUrl}/v1/chat/completions`, (route) =>
          route.continue(),
        )
      }
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.setViewportSize({ width: 1280, height: 960 })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}${source === "account" ? "?accountId=e2e-account-1" : ""}#${source === "profile" ? MENU_ITEM_IDS.API_CREDENTIAL_PROFILES : MENU_ITEM_IDS.MODELS}`,
      )
      await waitForExtensionRoot(page)
      await page
        .getByTestId(
          source === "profile"
            ? IDS.verifyButton
            : MODEL_LIST_TEST_IDS.verifyApiButton,
        )
        .first()
        .click()
      const panel = page.getByRole("region", { name: "Q&A test", exact: true })
      await panel.getByRole("button", { name: "Q&A test", exact: true }).click()
      await expect(
        page.getByRole("region", { name: "Routine tests", exact: true }),
      ).not.toContainText("Q&A test")
      const questionInput = page.getByRole("textbox", {
        name: "Question",
        exact: true,
      })
      await expect(questionInput).toBeVisible()
      await page.locator('[data-slot="modal-panel"]').screenshot({
        path: test.info().outputPath("qa-idle-composer-order.png"),
        animations: "disabled",
      })
      await expectVerificationComposerBelowIntroduction(
        panel,
        enVerification.verifyDialog.tools.questionAnswer.description,
      )
      // Explicit line breaks keep overflow independent of platform font metrics.
      const defaultQuestion = await questionInput.inputValue()
      await questionInput.fill(
        Array.from(
          { length: 20 },
          (_, index) => `Question line ${index + 1}`,
        ).join("\n"),
      )
      expect(
        await questionInput.evaluate((element) => element.clientHeight),
      ).toBeLessThanOrEqual(160)
      expect(
        await questionInput.evaluate((element) => element.scrollHeight),
      ).toBeGreaterThan(160)
      await questionInput.fill(defaultQuestion)
      await expect(
        page.getByRole("button", { name: "Question", exact: true }),
      ).toHaveCount(0)
      await expect(panel.getByRole("combobox")).toHaveCount(0)
      if (source === "profile") {
        const drawing = page.getByRole("region", {
          name: "Drawing test",
          exact: true,
        })
        await drawing
          .getByRole("button", { name: "Drawing test", exact: true })
          .click()
        const drawingSettings = await page
          .getByRole("group", {
            name: "Current test · Drawing test",
            exact: true,
          })
          .boundingBox()
        await page.locator('[data-slot="modal-panel"]').screenshot({
          path: test.info().outputPath("drawing-settings-reference.png"),
          animations: "disabled",
        })
        await panel
          .getByRole("button", { name: "Q&A test", exact: true })
          .click()
        const settings = page.getByRole("group", {
          name: "Current test · Q&A test",
          exact: true,
        })
        const questionSettings = await settings.boundingBox()
        const reference = await settings
          .getByRole("textbox", { name: "Reference answer (optional)" })
          .boundingBox()
        const question = await questionInput.boundingBox()
        expect(Math.abs(questionSettings!.x - drawingSettings!.x)).toBeLessThan(
          2,
        )
        expect(
          Math.abs(questionSettings!.width - drawingSettings!.width),
        ).toBeLessThan(2)
        expect(question!.x + question!.width).toBeLessThanOrEqual(reference!.x)
        expect(reference!.height).toBeLessThanOrEqual(40)
        await writeFile(
          test.info().outputPath("settings-geometry.json"),
          JSON.stringify(
            { drawingSettings, questionSettings, reference, question },
            null,
            2,
          ),
        )
        await page.locator('[data-slot="modal-panel"]').screenshot({
          path: test.info().outputPath("qa-profile-idle.png"),
          animations: "disabled",
        })
      }
      await expect(
        page.getByRole("textbox", { name: "Question", exact: true }),
      ).toContainText("黑色")
      await panel
        .getByRole("button", { name: "Run Q&A test", exact: true })
        .click()
      await expect(
        panel.getByText("Calculating", { exact: true }),
      ).toBeVisible()
      await expect(
        panel.getByText("Matches reference", { exact: true }),
      ).toHaveCount(0)
      const process = panel.getByRole("log", { name: "Test process" })
      const scroll = process
        .locator('[data-slot="conversation-content"]')
        .locator("..")
      await expect
        .poll(() => scroll.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(100)
      await expect(process.getByRole("status")).toContainText(
        "Writing response",
      )
      await captureVisualViews({
        page,
        ready: process,
        extensionDir,
        // Keep scroll-driven fades at the current scroll position; reduced motion
        // already stabilizes ordinary transitions in this workflow.
        animations: "allow",
        id: `qa-${source}-following`,
        views: [{ id: "light", width: 1280, height: 960, theme: "light" }],
      })
      // Exercise reader intent: the scroller distinguishes user input from its
      // own layout/streaming scroll corrections.
      await scroll.hover()
      await page.mouse.wheel(0, -10000)
      await expect
        .poll(() => scroll.evaluate((element) => element.scrollTop))
        .toBeLessThan(10)
      await expect(
        process.getByRole("button", { name: "Jump to latest" }),
      ).toBeVisible()
      await expect(
        page
          .getByTestId("verification-config")
          .getByRole("button", { name: "Request configuration" }),
      ).toHaveAttribute("aria-expanded", "true")
      await expect(
        page.getByRole("group", {
          name: "Current test · Q&A test",
          exact: true,
        }),
      ).toBeVisible()
      await expect(questionInput).toBeDisabled()
      const preview = process.locator('[data-slot="reasoning-preview"]')
      await expect(preview).toBeVisible()
      const previewBounds = await preview.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const paragraphs = element.querySelectorAll("p")
        return {
          height: bounds.height,
          firstTop: paragraphs[0]!.getBoundingClientRect().top - bounds.top,
          lastBottom:
            paragraphs[paragraphs.length - 1]!.getBoundingClientRect().bottom -
            bounds.bottom,
        }
      })
      expect(previewBounds.height).toBeLessThanOrEqual(80)
      expect(previewBounds.firstTop).toBeLessThan(0)
      expect(Math.abs(previewBounds.lastBottom)).toBeLessThan(3)
      await expect
        .poll(() =>
          preview.evaluate((element) =>
            parseFloat(
              getComputedStyle(element).getPropertyValue("--scroll-fade-t"),
            ),
          ),
        )
        .toBeGreaterThan(0)
      await captureVisualViews({
        page,
        ready: process,
        extensionDir,
        // Keep scroll-driven fades at the current scroll position; reduced motion
        // already stabilizes ordinary transitions in this workflow.
        animations: "allow",
        id: `qa-${source}-compact`,
        views: [
          { id: "light", width: 1280, height: 960, theme: "light" },
          { id: "narrow", width: 420, height: 900, theme: "light" },
          { id: "dark", width: 1280, height: 960, theme: "dark" },
        ],
      })
      await process
        .getByRole("button", { name: "Reasoning", exact: true })
        .click()
      // The process viewport owns scrolling; expanded thoughts are not clipped
      // inside a second, independently scrolling box.
      await expect
        .poll(() =>
          process
            .locator('[data-slot="reasoning-content"]')
            .evaluate((element) => element.scrollHeight - element.clientHeight),
        )
        .toBeLessThan(2)
      await expect(
        process.getByText("Check the question before answering."),
      ).toBeVisible()
      await process
        .getByRole("button", { name: "Collapse reasoning", exact: true })
        .click()
      await expect(
        process.getByRole("button", { name: "Reasoning", exact: true }),
      ).toBeFocused()
      await expect(preview).toBeVisible()
      await process
        .getByRole("button", { name: "Reasoning", exact: true })
        .click()
      await page.locator('[data-slot="modal-panel"]').screenshot({
        path: test.info().outputPath(`qa-${source}-streaming.png`),
        animations: "disabled",
      })
      await captureVisualViews({
        page,
        ready: process.getByRole("button", { name: "Reasoning", exact: true }),
        extensionDir,
        // Keep scroll-driven fades at the current scroll position; reduced motion
        // already stabilizes ordinary transitions in this workflow.
        animations: "allow",
        id: `qa-${source}-expanded`,
        views: [{ id: "light", width: 1280, height: 960, theme: "light" }],
      })
      const reasoningOffset = async () => {
        const heading = (await process
          .getByRole("button", { name: "Reasoning", exact: true })
          .boundingBox())!
        return heading.y - (await scroll.boundingBox())!.y
      }
      const inspectedOffset = await reasoningOffset()
      finishStream()
      await expect(
        panel.getByText("Matches reference", { exact: true }).first(),
      ).toBeVisible()
      await expect
        .poll(async () => Math.abs((await reasoningOffset()) - inspectedOffset))
        .toBeLessThan(3)
      await expect(
        process.getByText("Check the question before answering."),
      ).toBeVisible()
      await process
        .getByRole("button", { name: "Jump to final answer" })
        .click()
      await expect
        .poll(() =>
          scroll.evaluate(
            (element) =>
              element.scrollHeight - element.clientHeight - element.scrollTop,
          ),
        )
        .toBeLessThan(10)
      const statisticsTrigger = page
        .locator("[data-verification-active-test]")
        .getByRole("button", { name: "Statistics", exact: true })
      await statisticsTrigger.click()
      const performance = page.getByRole("dialog", {
        name: "Statistics",
        exact: true,
      })
      await expect(
        performance.getByText("Output speed", { exact: true }),
      ).toBeVisible()
      await expect(
        performance.getByText("First output", { exact: true }),
      ).toBeVisible()
      await statisticsTrigger.click()
      expect(fixture.requests).toHaveLength(1)
      expect(fixture.requests[0]!.stream).toBe(true)
      const comparison = page.getByRole("group", { name: "Answer comparison" })
      await comparison
        .getByRole("button", { name: "Answer comparison", exact: true })
        .click()
      await expect(comparison.getByRole("definition")).toHaveText(["21", "21"])
      expect(JSON.stringify(fixture.requests[0])).not.toContain('"21"')
      await expect(
        page
          .getByTestId("verification-header")
          .getByText("Not tested", { exact: true }),
      ).toHaveCount(0)
      if (source === "profile") {
        await page.locator('[data-slot="modal-panel"]').screenshot({
          path: test.info().outputPath("qa-profile-result.png"),
          animations: "disabled",
        })
        await page.evaluate(() =>
          document.documentElement.classList.add("dark"),
        )
        await page.locator('[data-slot="modal-panel"]').screenshot({
          path: test.info().outputPath("qa-profile-dark.png"),
          animations: "disabled",
        })
        await page.evaluate(() =>
          document.documentElement.classList.remove("dark"),
        )
        await page.setViewportSize({ width: 420, height: 900 })
        await showVerificationTest(page, "Q&A test")
        await comparison.scrollIntoViewIfNeeded()
        expect(
          await comparison.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true)
        await page.locator('[data-slot="modal-panel"]').screenshot({
          path: test.info().outputPath("qa-profile-comparison-narrow.png"),
          animations: "disabled",
        })
        await page.setViewportSize({ width: 1280, height: 960 })
        await showVerificationSettings(page)
        await page
          .getByRole("textbox", { name: "Question", exact: true })
          .fill("Explain a rainbow.")
        await page
          .getByRole("textbox", { name: "Reference answer (optional)" })
          .fill("Private reference for the reviewer")
        await expect(
          page
            .getByTestId("verification-active-test")
            .getByRole("status")
            .filter({ hasText: "The question or reference has changed." }),
        ).toBeVisible()
        await expect(comparison.getByRole("definition")).toHaveText([
          "21",
          "21",
        ])
        await page
          .getByRole("button", { name: "Run Q&A test", exact: true })
          .first()
          .click()
        await expect(
          page
            .getByTestId("verification-active-test")
            .getByText("Does not match reference", { exact: true })
            .first(),
        ).toBeVisible()
        expect(JSON.stringify(fixture.requests.at(-1))).not.toContain(
          "Private reference",
        )
        await expect(
          page.getByRole("group", {
            name: "Current test · Q&A test",
            exact: true,
          }),
        ).toBeVisible()
        await page
          .getByRole("textbox", { name: "Reference answer (optional)" })
          .fill("")
        await page
          .getByRole("button", { name: "Run Q&A test", exact: true })
          .first()
          .click()
        await expect(
          page
            .getByTestId("verification-active-test")
            .getByText("Response received", { exact: true })
            .first(),
        ).toBeVisible()
        expect(fixture.requests.at(-1)!.messages).toEqual([
          { role: "user", content: "Explain a rainbow." },
        ])
        await expect
          .poll(
            async () =>
              (await getStoredUserPreferences(worker)).questionAnswerTest,
          )
          .toMatchObject({ question: "Explain a rainbow." })
        await page.setViewportSize({ width: 420, height: 900 })
        await showVerificationTest(page, "Q&A test")
        await page
          .locator("[data-verification-detail]:not([hidden])")
          .scrollIntoViewIfNeeded()
        expect(
          await panel.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true)
        await page.locator('[data-slot="modal-panel"]').screenshot({
          path: test.info().outputPath("qa-profile-narrow.png"),
          animations: "disabled",
        })
        await showVerificationSettings(page)
        await expect(
          page
            .getByTestId("verification-workspace")
            .getByRole("button", { name: "Settings", exact: true }),
        ).toHaveAttribute("aria-expanded", "true")
        await page
          .getByTestId("verification-workspace")
          .getByRole("button", { name: "Settings", exact: true })
          .click()
        await showVerificationTest(page, "Q&A test")
        await page
          .getByRole("button", {
            name: "Reset question and answer",
            exact: true,
          })
          .click()
        await expect(questionInput).toContainText("黑色")
        await showVerificationSettings(page)
        await expect(
          page.getByRole("textbox", { name: "Reference answer (optional)" }),
        ).toHaveValue("21")
        await expect
          .poll(
            async () =>
              (await getStoredUserPreferences(worker)).questionAnswerTest,
          )
          .toMatchObject({
            referenceAnswer: "21",
            question: expect.stringContaining("黑色"),
          })
      }
    } finally {
      finishStream()
      fixture.server.closeAllConnections()
      await new Promise<void>((resolve) =>
        fixture.server.close(() => resolve()),
      )
    }
  })
}

test("routine and needle parallelism persists, refills slots and cancels active streams", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  const release: (() => void)[] = []
  const fixture = createDrawingServer({
    textResponse: () => "Partial **answer",
    afterStreamChunk: () =>
      new Promise<void>((resolve) => release.push(resolve)),
  })
  await new Promise<void>((resolve) =>
    fixture.server.listen(0, "127.0.0.1", resolve),
  )
  const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`
  try {
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    const worker = await getServiceWorker(context)
    await seedApiCredentialProfiles(worker, [
      createStoredApiCredentialProfile({
        id: "parallel",
        name: "Parallel fixture",
        apiType: "openai-compatible",
        baseUrl,
        apiKey: "synthetic-key",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1280, height: 960 })
    const open = async () => {
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
      )
      await waitForExtensionRoot(page)
      await page.getByTestId(IDS.verifyButton).click()
      await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
        "gpt-quality",
      )
    }
    await open()
    const runOptions = page.getByRole("button", {
      name: "Run preferences and concurrency settings",
      exact: true,
    })
    await runOptions.click()
    const concurrency = page.getByRole("spinbutton", {
      name: "Tests at once",
      exact: true,
    })
    await expect(concurrency).toBeEnabled()
    await concurrency.fill("2")
    await concurrency.press("Tab")
    await expect(concurrency).toHaveValue("2")
    await expect
      .poll(
        async () =>
          (await getStoredUserPreferences(worker)).verificationConcurrency,
      )
      .toMatchObject({ routine: 2 })
    await runOptions.click()
    await page
      .getByRole("button", { name: "Run routine tests", exact: true })
      .click()
    await expect.poll(() => release.length).toBe(2)
    const textProbe = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    await textProbe
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    await expect(textProbe.getByText("Partial", { exact: false })).toBeVisible()
    await expect(runOptions).toHaveCount(0)
    await expect(concurrency).toHaveCount(0)
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("routine-parallel-streaming.png"),
      animations: "disabled",
    })
    release[0]!()
    await expect.poll(() => release.length).toBe(3)
    await page.getByRole("button", { name: "Stop", exact: true }).click()
    await expect(page.getByTestId(IDS.verifyDialogCloseButton)).toBeEnabled()
    expect(fixture.requests).toHaveLength(3)
    await page.getByTestId(IDS.verifyDialogCloseButton).click()
    await open()
    await runOptions.click()
    await expect(concurrency).toHaveValue("2")
    await runOptions.click()
    await showVerificationSettings(page)
    const needle = page.getByRole("region", {
      name: "Needle in a haystack",
      exact: true,
    })
    await needle
      .getByRole("button", { name: "Needle in a haystack", exact: true })
      .click()
    const needleConcurrency = page.getByRole("spinbutton", {
      name: "Combinations at once",
      exact: true,
    })
    await needleConcurrency.fill("2")
    await needleConcurrency.press("Tab")
    await expect
      .poll(
        async () =>
          (await getStoredUserPreferences(worker)).verificationConcurrency,
      )
      .toEqual({ routine: 2, needle: 2 })
    await needle
      .getByRole("button", { name: /^Run .* row \(3 requests\)$/ })
      .last()
      .click()
    await expect.poll(() => release.length).toBe(5)
    await needle.getByRole("button", { name: /10%: Running/ }).click()
    await expect(
      needle
        .getByTestId("verification-generation-output")
        .getByText("Partial", { exact: false }),
    ).toBeVisible()
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("needle-parallel-streaming.png"),
      animations: "disabled",
    })
    await page
      .locator("[data-verification-active-test]")
      .getByRole("button", { name: "Stop", exact: true })
      .click()
    await expect(page.locator("[data-verification-active-test]")).toContainText(
      "Processed 2/3",
    )
    const resultHeader = page.locator("[data-verification-active-test]")
    const scoreBounds = (await resultHeader
      .getByText("0/6 matched", { exact: true })
      .boundingBox())!
    const runBounds = (await resultHeader
      .getByRole("button", { name: "Run", exact: true })
      .boundingBox())!
    expect(runBounds.x).toBeGreaterThan(scoreBounds.x)
    await page.setViewportSize({ width: 420, height: 900 })
    await page
      .getByTestId("verification-workspace")
      .getByRole("button", {
        name: "Settings",
        exact: true,
      })
      .click()
    await expect(resultHeader).toBeVisible()
    const mobileTestSwitcher = page
      .getByTestId("verification-workspace")
      .getByRole("button", { name: /^Needle in a haystack ·/ })
    await expect(mobileTestSwitcher).toBeVisible()
    const titleBounds = (await mobileTestSwitcher.boundingBox())!
    const narrowScoreBounds = (await resultHeader
      .getByText("0/6 matched", { exact: true })
      .boundingBox())!
    expect(titleBounds.y + titleBounds.height).toBeLessThanOrEqual(
      narrowScoreBounds.y,
    )
    await page.setViewportSize({ width: 1280, height: 960 })
    await captureVisualViews({
      page,
      ready: needle.getByRole("table"),
      id: "needle-stopped-result",
      extensionDir,
      views: [
        { id: "desktop", width: 1280, height: 960, theme: "light" },
        { id: "narrow", width: 420, height: 900, theme: "light" },
        { id: "dark", width: 1280, height: 960, theme: "dark" },
      ],
    })
    expect(fixture.requests).toHaveLength(5)
    await page.getByTestId(IDS.verifyDialogCloseButton).click()
    await open()
    await showVerificationSettings(page)
    await needle
      .getByRole("button", { name: "Needle in a haystack", exact: true })
      .click()
    await expect(needleConcurrency).toHaveValue("2")
  } finally {
    release.forEach((resolve) => resolve())
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

test("Q&A edits and hints follow the shared prompt flow in Chinese", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  const fixture = createDrawingServer({
    textResponse: () =>
      "计算九乘九，可以将九个九相加。\n\n9 × 9 = 81，因此最终答案是 81。\n\nFINAL_ANSWER: 81",
  })
  await new Promise<void>((resolve) =>
    fixture.server.listen(0, "127.0.0.1", resolve),
  )
  const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`
  try {
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "zh-CN")
    await seedApiCredentialProfiles(await getServiceWorker(context), [
      createStoredApiCredentialProfile({
        id: "qa-zh",
        name: "问答测试",
        apiType: "openai-compatible",
        baseUrl,
        apiKey: "synthetic-key",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1280, height: 1000 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).first().click()
    const panel = page.getByRole("region", { name: "问答测试", exact: true })
    await panel.getByRole("button", { name: "问答测试", exact: true }).click()
    await expect(
      page.getByRole("textbox", { name: "问题", exact: true }),
    ).toHaveAccessibleDescription("Enter 运行 · Shift+Enter 换行")
    const rules = page.getByRole("button", { name: "比对规则", exact: true })
    await expect(rules).toHaveAttribute("aria-expanded", "false")
    await expect(
      panel.getByText(
        zhVerification.verifyDialog.tools.questionAnswer.description,
        { exact: true },
      ),
    ).toBeVisible()
    await expect(panel.getByRole("list", { name: "测试步骤" })).toHaveCount(0)
    await expect(panel.getByRole("combobox")).toHaveCount(0)
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("qa-zh-idle.png"),
      animations: "disabled",
    })
    await page
      .getByRole("group", { name: "当前测试 · 问答测试", exact: true })
      .screenshot({
        path: test.info().outputPath("qa-zh-settings.png"),
        animations: "disabled",
      })
    for (const width of [1280, 420]) {
      await page.setViewportSize({ width, height: 1000 })
      await showVerificationSettings(page)
      const settings = page.getByRole("group", {
        name: "当前测试 · 问答测试",
        exact: true,
      })
      const input = settings.getByRole("textbox", {
        name: "参考答案（选填）",
        exact: true,
      })
      await expect(input).not.toHaveAttribute("aria-describedby", /.+/)
      const fieldBox = await input.boundingBox()
      const rulesBox = await rules.boundingBox()
      expect(rulesBox!.y).toBeGreaterThanOrEqual(fieldBox!.y + fieldBox!.height)
      expect(Math.abs(rulesBox!.x - fieldBox!.x)).toBeLessThan(2)
      await rules.click()
      await expect(rules).toHaveAttribute("aria-expanded", "true")
      await expect(
        settings.getByText(/２１ 能匹配 21，21个 不能匹配 21/),
      ).toBeVisible()
      await expect(
        settings.getByText("参考答案仅在本地使用，不发送给模型。", {
          exact: true,
        }),
      ).toBeVisible()
      await settings.scrollIntoViewIfNeeded()
      await settings.screenshot({
        path: test.info().outputPath(`qa-zh-rules-${width}.png`),
        animations: "disabled",
      })
      expect(
        await settings.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true)
      await rules.click()
      if (width === 420) {
        await settings.scrollIntoViewIfNeeded()
        await settings.screenshot({
          path: test.info().outputPath("qa-zh-settings-narrow.png"),
          animations: "disabled",
        })
      }
    }
    await page.setViewportSize({ width: 1280, height: 1000 })
    await page
      .getByRole("textbox", { name: "问题", exact: true })
      .fill("九乘九等于多少？")
    await page
      .getByRole("textbox", { name: "参考答案（选填）", exact: true })
      .fill("81")
    await expect(
      page.getByRole("button", { name: "重置题目与参考答案", exact: true }),
    ).toBeVisible()
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("qa-zh-edit.png"),
      animations: "disabled",
    })
    await page
      .getByRole("button", { name: "运行问答测试", exact: true })
      .first()
      .click()
    await expect(
      page
        .getByTestId("verification-active-test")
        .getByText("与参考答案一致", { exact: true }),
    ).toBeVisible()
    expect(fixture.requests).toHaveLength(1)
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("qa-zh-result.png"),
      animations: "disabled",
    })
    const result = panel.getByRole("region", { name: "执行结果", exact: true })
    const response = result
      .getByRole("region", { name: "模型回答", exact: true })
      .getByText("计算九乘九，可以将九个九相加。", { exact: true })
    const runQuestion = result
      .getByRole("region", { name: "本次使用的问题", exact: true })
      .getByText("九乘九等于多少？", { exact: true })
    await expect(runQuestion).toBeVisible()
    await expect(
      page.getByRole("button", { name: "当前测试 · 问答测试", exact: true }),
    ).toHaveAttribute("aria-expanded", "true")
    await expect(
      page
        .getByTestId("verification-config")
        .getByRole("button", { name: "请求配置", exact: true }),
    ).toHaveAttribute("aria-expanded", "true")
    await captureVisualViews({
      page,
      ready: result,
      extensionDir,
      id: "qa-restored",
      views: [
        { id: "light", width: 1280, height: 1000, theme: "light" },
        { id: "narrow", width: 420, height: 1000, theme: "light" },
        { id: "dark", width: 1280, height: 1000, theme: "dark" },
      ],
    })
    const typography = []
    for (const font of ["sans", "serif"] as const) {
      await page.evaluate((value) => {
        document.documentElement.dataset.themeFont = value
      }, font)
      const styles = []
      for (const text of [response, runQuestion]) {
        styles.push(
          await text.evaluate((element) => {
            const style = getComputedStyle(element)
            return {
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              lineHeight: style.lineHeight,
              letterSpacing: style.letterSpacing,
            }
          }),
        )
      }
      typography.push({ font, response: styles[0], question: styles[1] })
      await result.screenshot({
        path: test.info().outputPath(`qa-zh-typography-${font}.png`),
        animations: "disabled",
      })
    }
    await writeFile(
      test.info().outputPath("qa-typography.json"),
      JSON.stringify(typography, null, 2),
    )
    for (const measured of typography) {
      expect(
        measured.response,
        `Q&A typography with ${measured.font} appearance`,
      ).toEqual(measured.question)
    }
    await page.getByRole("textbox", { name: "问题", exact: true }).fill(" ")
    await expect(
      page.getByRole("textbox", { name: "问题", exact: true }),
    ).toHaveAttribute("aria-invalid", "true")
    await expect(
      page.getByText("请填写问题后再运行测试。", { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "运行问答测试", exact: true }).first(),
    ).toBeDisabled()
    await expect(
      page
        .getByTestId("verification-active-test")
        .getByRole("status")
        .filter({ hasText: "问题或参考答案已修改。" }),
    ).toBeVisible()
    const comparison = page.getByRole("button", {
      name: "答案对照",
      exact: true,
    })
    if ((await comparison.getAttribute("aria-expanded")) === "false")
      await comparison.click()
    await expect(
      page.getByRole("group", { name: "答案对照" }).getByRole("definition"),
    ).toHaveText(["81", "81"])
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("qa-zh-stale-and-empty.png"),
      animations: "disabled",
    })
  } finally {
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

test("verification tests run concurrently and cancel independently", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  let releaseDrawing!: () => void
  let releaseCapacity!: () => void
  const drawingGate = new Promise<void>((resolve) => {
    releaseDrawing = resolve
  })
  const capacityGate = new Promise<void>((resolve) => {
    releaseCapacity = resolve
  })
  const fixture = createDrawingServer({
    beforeRespond: async (request) => {
      const prompt = String(request.messages.at(-1)?.content)
      if (prompt.includes("pelican")) await drawingGate
      if (prompt.startsWith("Read the following reference text."))
        await capacityGate
    },
  })
  await new Promise<void>((resolve) =>
    fixture.server.listen(0, "127.0.0.1", resolve),
  )
  try {
    const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await seedApiCredentialProfiles(await getServiceWorker(context), [
      createStoredApiCredentialProfile({
        id: "concurrent-verification",
        name: "Concurrent verification",
        apiType: "openai-compatible",
        baseUrl,
        apiKey: "synthetic-key",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1920, height: 1000 })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await expect(page.getByTestId(IDS.verifyButton)).toHaveAttribute(
      "aria-label",
      "Test API",
    )
    await page.getByTestId(IDS.verifyButton).click()
    await expect(
      page
        .getByTestId("verification-header")
        .getByRole("heading", { name: "API Testing", exact: true }),
    ).toBeVisible()
    await expect(
      page
        .getByTestId("verification-header")
        .getByText("Not tested", { exact: true }),
    ).toHaveCount(0)
    await expect(page.getByTestId("verification-header")).toContainText(
      "Credential: Concurrent verification",
    )
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )
    await captureVisualViews({
      page,
      ready: page.getByTestId("verification-config"),
      id: "credential-wide",
      extensionDir,
    })
    await expect(
      page.getByRole("heading", { name: "What this test checks", exact: true }),
    ).toHaveCount(0)
    await expect
      .poll(() =>
        page
          .locator("[data-verification-detail]:not([hidden])")
          .evaluate((element) => element.scrollHeight - element.clientHeight),
      )
      .toBeLessThanOrEqual(1)
    await captureVisualViews({
      page,
      ready: page.getByTestId("verification-config"),
      id: "credential-tall",
      extensionDir,
      views: [{ id: "tall", width: 1280, height: 1280, theme: "light" }],
    })
    expect(
      (await page.locator('[data-slot="modal-panel"]').boundingBox())!.width,
    ).toBeGreaterThanOrEqual(1000)
    const modelsBox = (await page
      .getByTestId(getApiCredentialProfileVerifyProbeTestId("models"))
      .boundingBox())!
    const textBox = (await page
      .getByTestId(getApiCredentialProfileVerifyProbeTestId("text-generation"))
      .boundingBox())!
    const routine = page.getByRole("region", {
      name: "Routine tests",
      exact: true,
    })
    const onDemand = page.getByRole("region", {
      name: "On-demand tests",
      exact: true,
    })
    await expect(routine).toContainText("Model list")
    await expect(onDemand).toContainText("Drawing test")
    await expect(onDemand).toContainText("Context capacity test")
    await expect(
      onDemand.getByText("Run individually", { exact: true }),
    ).toHaveCount(0)
    const pendingStatusEdges = await page
      .locator(
        "[data-verification-list] [data-verification-summary] [data-slot=badge]",
      )
      .evaluateAll((badges) =>
        badges.map((badge) => badge.getBoundingClientRect().right),
      )
    expect(pendingStatusEdges).toHaveLength(9)
    expect(
      Math.max(...pendingStatusEdges) - Math.min(...pendingStatusEdges),
    ).toBeLessThanOrEqual(1)
    await expect(
      page.getByRole("button", { name: "Run routine tests", exact: true }),
    ).toBeEnabled()
    const toolBox = (await page
      .getByTestId(getApiCredentialProfileVerifyProbeTestId("tool-calling"))
      .boundingBox())!
    expect(textBox.x).toBeCloseTo(modelsBox.x, 0)
    expect(textBox.y).toBeGreaterThanOrEqual(modelsBox.y + modelsBox.height)
    expect(toolBox.x).toBeCloseTo(textBox.x, 0)
    expect(toolBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height)
    expect(modelsBox.width).toBeCloseTo(textBox.width, 0)
    const routineBox = (await routine.boundingBox())!
    const onDemandBox = (await onDemand.boundingBox())!
    expect(onDemandBox.x).toBeCloseTo(routineBox.x, 0)
    expect(onDemandBox.y).toBeGreaterThanOrEqual(
      routineBox.y + routineBox.height,
    )
    expect(textBox.height).toBeLessThan(100)
    const textProbe = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    const titleBox = (await textProbe
      .locator("[data-verification-summary]")
      .getByText("Text generation", { exact: true })
      .boundingBox())!
    const statusBox = (await textProbe
      .getByText("Pending", { exact: true })
      .boundingBox())!
    expect(statusBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height)
    expect(statusBox.x).toBeGreaterThanOrEqual(titleBox.x)
    await captureVisualViews({
      page,
      ready: routine,
      id: "credential-dark",
      extensionDir,
      views: [{ id: "dark", width: 1280, height: 900, theme: "dark" }],
    })
    const drawing = page.getByTestId("verification-tools-panel")
    for (const [name, description] of [
      ["Model list", enVerification.verifyDialog.intro.probes.models],
      [
        "Text generation",
        enVerification.verifyDialog.intro.probes["text-generation"],
      ],
      [
        "Tool/function calling",
        enVerification.verifyDialog.intro.probes["tool-calling"],
      ],
      [
        "Structured output",
        enVerification.verifyDialog.intro.probes["structured-output"],
      ],
      ["Web search", enVerification.verifyDialog.intro.probes["web-search"]],
      ["Drawing test", enVerification.verifyDialog.tools.pelican.description],
      ["Context capacity test", enVerification.verifyDialog.tools.context.hint],
    ] as const) {
      await page.getByRole("button", { name, exact: true }).click()
      await captureVisualViews({
        page,
        ready: page.getByTestId("verification-config"),
        id: `all-intros-${name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
        extensionDir,
      })
      const selectedDetail = page.locator(
        "[data-verification-detail]:not([hidden])",
      )
      const explanation = selectedDetail.getByText(description, { exact: true })
      await expect(explanation).toBeVisible()
      await expect(
        selectedDetail.getByRole("list", { name: "Test steps" }),
      ).toHaveCount(0)
      const title = selectedDetail.getByRole("heading", { name, exact: true })
      await expect(title).toHaveCount(1)
      await expect(title).toHaveCSS("text-align", "center")
      const titleBox = (await title.boundingBox())!
      const descriptionBox = (await explanation.boundingBox())!
      expect(titleBox.y + titleBox.height).toBeLessThan(descriptionBox.y)
      const detailBox = (await selectedDetail.boundingBox())!
      expect(
        Math.abs(
          titleBox.x + titleBox.width / 2 - detailBox.x - detailBox.width / 2,
        ),
      ).toBeLessThanOrEqual(1)
      await expect
        .poll(() =>
          page
            .locator("[data-verification-detail]:not([hidden])")
            .evaluate((element) => element.scrollHeight - element.clientHeight),
        )
        .toBeLessThanOrEqual(1)
    }
    const drawingBox = (await drawing.boundingBox())!
    const idleCapacityBox = (await onDemand
      .getByRole("region", { name: "Context capacity test", exact: true })
      .boundingBox())!
    expect(idleCapacityBox.x).toBeCloseTo(drawingBox.x, 0)
    expect(idleCapacityBox.y).toBeGreaterThanOrEqual(
      drawingBox.y + drawingBox.height,
    )
    await page
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    await drawing
      .getByRole("button", { name: "Run drawing test", exact: true })
      .click()
    await expect.poll(() => fixture.requests.length).toBe(1)
    const text = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    await text
      .getByText("Select Run to start this test.", { exact: true })
      .getByRole("button", { name: "Run", exact: true })
      .click()
    await expect(
      text
        .locator('[data-verification-summary] [data-slot="badge"]')
        .filter({ hasText: "Pass" }),
    ).toBeVisible()
    await text
      .getByRole("button", { name: "Text generation", exact: true })
      .click()
    const resultTitle = page
      .locator("[data-verification-workspace-bar]")
      .getByText("Text generation", { exact: true })
    await expect(resultTitle).toBeVisible()
    const capacity = page.getByRole("region", {
      name: "Context capacity test",
      exact: true,
    })
    await capacity
      .getByRole("button", { name: "Context capacity test", exact: true })
      .click()
    await capacity
      .getByRole("button", { name: "Run context probe", exact: true })
      .click()
    await expect.poll(() => fixture.requests.length).toBe(3)
    await capacity.getByRole("button", { name: "Stop", exact: true }).click()
    await expect(
      page
        .getByTestId("verification-active-test")
        .getByRole("status", { name: "Context capacity result" }),
    ).toHaveAttribute("title", /Probe stopped/)
    await expect(
      drawing.getByRole("button", { name: "Stop", exact: true }),
    ).toBeEnabled()
    await drawing.scrollIntoViewIfNeeded()
    await page.locator('[data-slot="modal-panel"]').screenshot({
      path: test.info().outputPath("concurrent-verification.png"),
      animations: "disabled",
    })
    releaseDrawing()
    await expect(page.getByTestId("pelican-svg-preview")).toBeHidden()
    await expect(
      capacity.getByRole("button", {
        name: "Context capacity test",
        exact: true,
      }),
    ).toHaveAttribute("aria-expanded", "true")
    await drawing
      .getByRole("button", { name: "Drawing test", exact: true })
      .click()
    await expect(page.getByTestId("pelican-svg-preview")).toBeVisible()
    await page.setViewportSize({ width: 1920, height: 1200 })
    await captureVisualViews({
      page,
      ready: drawing,
      id: "drawing-room-to-expand",
      extensionDir,
    })
    await expect
      .poll(() =>
        drawing
          .locator("[data-verification-detail]")
          .evaluate((element) => element.scrollHeight - element.clientHeight),
      )
      .toBeLessThanOrEqual(1)
    expect((await drawing.boundingBox())!.width).toBeCloseTo(
      drawingBox.width,
      0,
    )
    const drawingDetail = (await drawing
      .locator("[data-verification-detail]")
      .boundingBox())!
    expect(drawingDetail.x).toBeGreaterThan(drawingBox.x + drawingBox.width)
    expect(drawingDetail.width).toBeGreaterThan(drawingBox.width)
    await captureVisualViews({
      page,
      ready: drawing,
      id: "credential-drawing-result",
      extensionDir,
    })
    await expect(
      drawing.getByRole("button", { name: "Execution result", exact: true }),
    ).toHaveCount(0)
    expect((await drawing.boundingBox())!.width).toBeCloseTo(
      drawingBox.width,
      0,
    )
    await page.setViewportSize({ width: 1280, height: 650 })
    const list = page.locator("[data-verification-list]")
    const detail = drawing.locator("[data-verification-detail]")
    // Resizing may clip the workspace in the modal body. Bring the list into
    // that outer viewport before exercising its independent inner scrolling.
    await list.scrollIntoViewIfNeeded()
    await expect
      .poll(() =>
        page
          .locator('[data-slot="modal-body"]')
          .evaluate((element) => element.scrollHeight - element.clientHeight),
      )
      .toBeLessThanOrEqual(1)
    const beforeScroll = (await detail.boundingBox())!
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(
      0,
    )
    expect((await detail.boundingBox())!.y).toBeCloseTo(beforeScroll.y, 0)
    expect((await detail.boundingBox())!.height).toBeCloseTo(
      beforeScroll.height,
      0,
    )
    await expect(
      capacity.getByRole("button", { name: "Run context probe", exact: true }),
    ).toBeInViewport()
    await expect(page.getByTestId(IDS.verifyDialogCloseButton)).toBeEnabled()
    await page.reload()
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await expect(
      page
        .getByTestId("verification-tools-panel")
        .getByTestId("pelican-history-summary"),
    ).toContainText("Drawing generated")
    await expect(
      page.getByTestId(
        getApiCredentialProfileVerifyProbeTestId("text-generation"),
      ),
    ).toContainText("Pass")
    await page.setViewportSize({ width: 380, height: 800 })
    await expect(
      page
        .locator("[data-verification-detail]:not([hidden])")
        .getByRole("heading", { name: "Model list", exact: true }),
    ).toHaveCount(0)
    await expect(
      page
        .locator("[data-verification-detail]:not([hidden])")
        .getByRole("list", { name: "Test steps" }),
    ).toBeHidden()
    const narrowModels = (await page
      .getByTestId(getApiCredentialProfileVerifyProbeTestId("models"))
      .boundingBox())!
    const narrowText = (await text.boundingBox())!
    expect(narrowText.y).toBeGreaterThanOrEqual(
      narrowModels.y + narrowModels.height,
    )
    expect(
      await page
        .locator('[data-slot="modal-body"]')
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
    await captureVisualViews({
      page,
      ready: text,
      id: "credential-narrow-result",
      extensionDir,
    })
  } finally {
    releaseDrawing()
    releaseCapacity()
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

for (const mode of ["Streaming", "Non-streaming"] as const) {
  test(`agent drawing executes JavaScript in the extension (${mode})`, async ({
    context,
    extensionId,
    extensionDir,
    page,
  }) => {
    const fixture = createDrawingServer({
      reasoningText: "Inspect the virtual workspace, then create the drawing.",
    })
    await new Promise<void>((resolve) =>
      fixture.server.listen(0, "127.0.0.1", resolve),
    )
    try {
      const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`
      await stubLlmMetadataIndex(context)
      await forceExtensionLanguage(page, "en")
      await seedApiCredentialProfiles(await getServiceWorker(context), [
        createStoredApiCredentialProfile({
          id: "agent-drawing",
          name: "Agent drawing target",
          apiType: "openai-compatible",
          baseUrl,
          apiKey: "synthetic-key",
          telemetryConfig: { mode: "disabled" },
        }),
      ])
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
      )
      await waitForExtensionRoot(page)
      await page.getByTestId(IDS.verifyButton).click()
      await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
        "gpt-quality",
      )
      await page.getByRole("combobox", { name: "Test mode" }).click()
      await page.getByRole("option", { name: mode, exact: true }).click()
      await expect(page.getByTestId("verification-tools-panel")).toBeVisible()
      expect(fixture.requests).toHaveLength(0)
      await page
        .getByRole("button", { name: "Drawing test", exact: true })
        .click()
      const agentSwitch = page.getByRole("switch", { name: "Agent test mode" })
      await expect(agentSwitch).not.toBeChecked()
      await agentSwitch.click()
      await page
        .getByRole("button", { name: "Run drawing test", exact: true })
        .click()
      const result = page.getByTestId("agent-test-result")
      await expect(result).toContainText("An SVG file was generated", {
        timeout: 30_000,
      })
      const preview = page.getByTestId("pelican-svg-preview")
      await expect
        .poll(() =>
          preview.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true)
      await expect(
        page
          .getByTestId("verification-workspace")
          .getByRole("button", { name: "Settings", exact: true }),
      ).toHaveAttribute("aria-expanded", "true")
      await agentSwitch.scrollIntoViewIfNeeded()
      await page.locator('[data-slot="modal-panel"]').screenshot({
        path: test.info().outputPath("agent-summary.png"),
        animations: "disabled",
      })
      await preview.scrollIntoViewIfNeeded()
      await page.locator('[data-slot="modal-panel"]').screenshot({
        path: test.info().outputPath("drawing-result.png"),
        animations: "disabled",
      })
      expect(fixture.requests).toHaveLength(2)
      expect(
        fixture.requests.every(
          (request) => Boolean(request.stream) === (mode === "Streaming"),
        ),
      ).toBe(true)
      const feedback = String(
        fixture.requests[1]?.messages.find((message) => message.role === "tool")
          ?.content,
      )
      expect(feedback).toContain("workspace checked")
      expect(feedback).toContain('"network":"undefined"')
      const process = page.getByRole("log", { name: "Test process" })
      await expect(process).toContainText("execute_js")
      await process.getByRole("button", { name: /execute_js/ }).click()
      await expect(process).toContainText("workspace checked")
      await expect(
        page.getByRole("button", { name: "Tool activity", exact: true }),
      ).toHaveCount(0)
      if (mode === "Streaming") {
        const blocks = process.getByRole("listitem")
        await expect(blocks).toHaveCount(4)
        await expect(blocks.nth(0)).toContainText("Reasoning")
        await expect(blocks.nth(1)).toContainText("execute_js")
        await expect(blocks.nth(2)).toContainText("Reasoning")
        await expect(blocks.nth(3)).toContainText("Created pelican.svg.")
      }
      await captureVisualViews({
        page,
        ready: process,
        // Keep scroll-driven fades at the current scroll position; reduced motion
        // already stabilizes ordinary transitions in this workflow.
        animations: "allow",
        id: `agent-process-${mode.toLowerCase()}`,
        extensionDir,
        views: [
          { id: "light", width: 1280, height: 960, theme: "light" },
          { id: "narrow", width: 420, height: 900, theme: "light" },
          { id: "dark", width: 1280, height: 960, theme: "dark" },
        ],
      })
      await page
        .getByRole("button", { name: "Workspace files", exact: true })
        .click()
      await expect(
        page.getByRole("button", { name: "pelican.svg", exact: true }),
      ).toBeVisible()
      await result.scrollIntoViewIfNeeded()
      await page.locator('[data-slot="modal-panel"]').screenshot({
        path: test.info().outputPath("agent-tools.png"),
        animations: "disabled",
      })
      await page.reload()
      await waitForExtensionRoot(page)
      await page.getByTestId(IDS.verifyButton).click()
      await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
        "gpt-quality",
      )
      const drawingHistory = page
        .getByTestId("verification-tools-panel")
        .getByTestId("pelican-history-summary")
      await expect(drawingHistory).toContainText("Drawing generated")
      await expect(drawingHistory).not.toContainText(
        "Only the run summary was saved",
      )
      await expect(page.getByTestId("pelican-svg-preview")).toHaveCount(0)
      expect(fixture.requests).toHaveLength(2)
      await page
        .getByRole("button", { name: "Drawing test", exact: true })
        .click()
      await drawingHistory.scrollIntoViewIfNeeded()
      await page.locator('[data-slot="modal-panel"]').screenshot({
        path: test.info().outputPath("drawing-history-restored.png"),
        animations: "disabled",
      })
      await captureVisualViews({
        page,
        ready: drawingHistory,
        id: `drawing-history-${mode}`,
        extensionDir,
        views: [
          { id: "desktop", width: 1280, height: 960, theme: "light" },
          { id: "narrow", width: 420, height: 900, theme: "light" },
          { id: "dark", width: 1280, height: 960, theme: "dark" },
        ],
      })
      const historyBadge = drawingHistory.getByRole("button", {
        name: /^Previously:/,
      })
      const activeDrawing = page.getByTestId("verification-active-test")
      await expect(historyBadge.locator("button")).toHaveCount(0)
      await historyBadge.hover()
      const historyHint = page
        .getByRole("tooltip")
        .filter({ hasText: "History does not retain the drawing" })
      await expect(historyHint).toBeVisible()
      await expect(historyHint).toHaveCSS("opacity", "0.9")
      await page.locator('[data-slot="modal-panel"]').screenshot({
        path: test.info().outputPath("drawing-history-tooltip.png"),
        animations: "disabled",
      })
      await page.keyboard.press("Escape")
      await expect(historyHint).toBeHidden()
      await historyBadge.focus()
      await expect(historyHint).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(historyHint).toBeHidden()
      await expect(page.getByRole("dialog")).toBeVisible()
      await page.setViewportSize({ width: 380, height: 800 })
      await historyBadge.scrollIntoViewIfNeeded()
      const touch = await context.newCDPSession(page)
      try {
        await touch.send("Emulation.setTouchEmulationEnabled", {
          enabled: true,
        })
        const bounds = (await historyBadge.boundingBox())!
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
          ],
        })
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        })
        await expect(historyHint).toBeVisible()
        await expect(historyHint).toHaveCSS("opacity", "0.9")
        await expect(activeDrawing).toHaveAttribute(
          "aria-label",
          "Drawing test",
        )
        await page.locator('[data-slot="modal-panel"]').screenshot({
          path: test.info().outputPath("drawing-history-tooltip-narrow.png"),
          animations: "disabled",
        })
        await page.keyboard.press("Escape")
        await expect(historyHint).toBeHidden()
      } finally {
        await touch.send("Emulation.setTouchEmulationEnabled", {
          enabled: false,
        })
        await touch.detach()
      }
      await page.setViewportSize({ width: 1280, height: 720 })
      await page
        .getByRole("button", { name: "Clear history", exact: true })
        .click()
      await expect(page.getByTestId("pelican-history-summary")).toHaveCount(0)
      await page.reload()
      await waitForExtensionRoot(page)
      await page.getByTestId(IDS.verifyButton).click()
      await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
        "gpt-quality",
      )
      await expect(page.getByTestId("pelican-history-summary")).toHaveCount(0)
    } finally {
      fixture.server.closeAllConnections()
      await new Promise<void>((resolve) =>
        fixture.server.close(() => resolve()),
      )
    }
  })
}

test("the shared verification tools run an on-demand drawing test", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  const fixture = createDrawingServer()
  await new Promise<void>((resolve) =>
    fixture.server.listen(0, "127.0.0.1", resolve),
  )
  const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`

  try {
    const worker = await getServiceWorker(context)
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await seedApiCredentialProfiles(worker, [
      createStoredApiCredentialProfile({
        id: "drawing",
        name: "Drawing target",
        apiType: "openai-compatible",
        baseUrl,
        apiKey: "synthetic-key",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    // The drawing test reuses the dialog's model, so wait for discovery.
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )

    // Discovery is visible, while inference still requires an explicit action.
    const sourceLink = page
      .getByTestId("verification-header")
      .getByRole("link", { name: baseUrl, exact: true })
    await expect(sourceLink).toHaveAttribute("href", baseUrl)
    const sourcePagePromise = context.waitForEvent("page")
    await sourceLink.click()
    const sourcePage = await sourcePagePromise
    await sourcePage.waitForURL(`${baseUrl}/`)
    await sourcePage.close()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(page.getByTestId("verification-tools-panel")).toBeVisible()
    expect(fixture.requests).toHaveLength(0)
    const drawingPanel = page.getByTestId("verification-tools")
    const onDemandGroup = page.getByRole("region", {
      name: "On-demand tests",
      exact: true,
    })
    await expect(onDemandGroup.getByTestId("verification-tools")).toBeVisible()
    await drawingPanel
      .getByRole("button", { name: "Drawing test", exact: true })
      .click()
    const drawingPrompt = page.getByRole("textbox", {
      name: "Drawing test prompt",
      exact: true,
    })
    await expectVerificationComposerBelowIntroduction(
      drawingPanel,
      enVerification.verifyDialog.tools.pelican.description,
    )
    await expect(drawingPrompt).toBeVisible()
    for (const width of [1280, 420]) {
      await page.setViewportSize({ width, height: 1000 })
      await showVerificationTest(page, "Drawing test")
      await expect(drawingPrompt).toBeVisible()
    }
    await page.setViewportSize({ width: 1280, height: 1000 })
    expect(fixture.requests).toHaveLength(0)
    await expect(
      page
        .getByRole("button", {
          name: "Run drawing test",
          exact: true,
        })
        .first(),
    ).toHaveText("Run")
    await captureVisualViews({
      page,
      ready: drawingPanel,
      id: "drawing-settings-collapsed",
      extensionDir,
    })
    await drawingPanel.screenshot({
      path: test.info().outputPath("drawing-settings-collapsed-panel.png"),
      animations: "disabled",
    })
    await expect(drawingPrompt).toBeVisible()
    await captureVisualViews({
      page,
      ready: drawingPanel,
      id: "drawing-settings-expanded",
      extensionDir,
    })
    await drawingPanel.screenshot({
      path: test.info().outputPath("drawing-settings-expanded-panel.png"),
      animations: "disabled",
    })
    await page
      .getByRole("button", { name: "Run drawing test", exact: true })
      .click()

    const preview = page.getByTestId("pelican-svg-preview")
    await expect(preview).toBeVisible({ timeout: 30_000 })
    const drawingResult = page.getByRole("region", {
      name: "Execution result",
      exact: true,
    })
    await expect(drawingResult.getByTestId("pelican-svg-preview")).toBeVisible()
    await showVerificationSettings(page)
    const drawingResultBox = (await drawingResult.boundingBox())!
    const drawingSettingsBox = (await page
      .getByRole("group", { name: "Current test · Drawing test", exact: true })
      .boundingBox())!
    expect(drawingResultBox.x + drawingResultBox.width).toBeLessThanOrEqual(
      drawingSettingsBox.x,
    )
    await captureVisualViews({
      page,
      ready: preview,
      id: "drawing-result",
      extensionDir,
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "dark", theme: "dark", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    await expect(
      page.getByRole("region", { name: "On-demand tests", exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole("region", {
        name: "Execution result",
        exact: true,
      }),
    ).toBeVisible()
    // A visible <img> can still be a failed load; require decoded pixels.
    await expect
      .poll(
        () =>
          preview.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        { timeout: 10_000 },
      )
      .toBe(true)

    expect(fixture.prompts).toHaveLength(1)
    expect(fixture.prompts[0]).toContain("pelican")

    // Capture through the dialog body so the bottom save bar is included even
    // when the panel itself is clipped by the dialog viewport.
    const panel = page.getByTestId("verification-tools")
    await panel.scrollIntoViewIfNeeded()
    await panel.screenshot({
      path: test.info().outputPath("verification-tools-full.png"),
    })
    await test.info().attach("verification-tools-full", {
      path: test.info().outputPath("verification-tools-full.png"),
      contentType: "image/png",
    })

    await page.getByTestId("verification-tools-panel").screenshot({
      path: test.info().outputPath("verification-tools.png"),
    })
    await test.info().attach("verification-tools", {
      path: test.info().outputPath("verification-tools.png"),
      contentType: "image/png",
    })

    const chinesePage = await context.newPage()
    await forceExtensionLanguage(chinesePage, "zh-CN")
    await chinesePage.setViewportSize({ width: 1000, height: 1000 })
    await chinesePage.emulateMedia({ reducedMotion: "reduce" })
    await chinesePage.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(chinesePage)
    await chinesePage.getByTestId(IDS.verifyButton).click()
    await showVerificationSettings(chinesePage)
    await expect(chinesePage.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )
    await chinesePage.getByRole("dialog").screenshot({
      path: test.info().outputPath("verification-config-boundary-zh-CN.png"),
      animations: "disabled",
    })
    const chineseDrawing = chinesePage.getByTestId("verification-tools")
    await chineseDrawing
      .getByRole("button", { name: "绘图测试", exact: true })
      .click()
    await expect(
      chinesePage.getByRole("textbox", {
        name: "绘图测试 提示词",
        exact: true,
      }),
    ).toBeVisible()
    await chineseDrawing.screenshot({
      path: test.info().outputPath("drawing-settings-expanded-zh-CN.png"),
      animations: "disabled",
    })
    await chinesePage.getByRole("dialog").screenshot({
      path: test.info().outputPath("verification-dialog-zh-CN.png"),
      animations: "disabled",
    })
    await chinesePage.setViewportSize({ width: 480, height: 1140 })
    const chineseSettingsToggle = chinesePage
      .getByTestId("verification-workspace")
      .getByRole("button", { name: "配置", exact: true })
    if ((await chineseSettingsToggle.getAttribute("aria-expanded")) === "true")
      await chineseSettingsToggle.click()
    await chinesePage
      .getByRole("button", { name: "工具/函数调用", exact: true })
      .click()
    await chinesePage.locator('[data-slot="modal-body"]').evaluate((body) => {
      body.scrollTop = 0
    })
    await captureVisualViews({
      page: chinesePage,
      ready: chinesePage.getByRole("button", {
        name: "工具/函数调用",
        exact: true,
      }),
      id: "narrow-idle-detail",
      extensionDir,
    })
    await captureVisualViews({
      page: chinesePage,
      ready: chinesePage.getByRole("button", {
        name: "工具/函数调用",
        exact: true,
      }),
      id: "narrow-single-column",
      extensionDir,
      views: [{ id: "narrow", width: 479, height: 1135, theme: "light" }],
    })
    const idleProbe = chinesePage.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("tool-calling"),
    )
    const spacingPath = test.info().outputPath("narrow-spacing.json")
    await writeFile(
      spacingPath,
      JSON.stringify({
        row: await idleProbe
          .locator(
            "[data-verification-summary], [data-verification-summary-collapsed]",
          )
          .boundingBox(),
        detail: await chinesePage
          .locator("[data-verification-detail]:visible")
          .boundingBox(),
        actions: await chinesePage
          .locator('[data-slot="action-group"]')
          .filter({
            has: chinesePage.getByRole("button", {
              name: "运行常规测试",
              exact: true,
            }),
          })
          .boundingBox(),
      }),
    )
    await test.info().attach("narrow-spacing", {
      path: spacingPath,
      contentType: "application/json",
    })
    await chinesePage.close()
  } finally {
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

test("an edited probe prompt persists and is used by the next run", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  const fixture = createDrawingServer()
  await new Promise<void>((resolve) =>
    fixture.server.listen(0, "127.0.0.1", resolve),
  )
  const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`

  try {
    await page.emulateMedia({ reducedMotion: "reduce" })
    const worker = await getServiceWorker(context)
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await seedApiCredentialProfiles(worker, [
      createStoredApiCredentialProfile({
        id: "prompt",
        name: "Prompt target",
        apiType: "openai-compatible",
        baseUrl,
        apiKey: "synthetic-key",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )

    await page.setViewportSize({ width: 1600, height: 1000 })
    const dialog = page.locator('[data-slot="modal-panel"]')
    const textProbe = page.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    const selectText = textProbe.getByRole("button", {
      name: "Text generation",
      exact: true,
    })
    await selectText.click()
    await showVerificationSettings(page)
    const settings = page.locator("[data-verification-settings]")
    const textbox = page.getByRole("textbox", {
      name: "Text generation prompt",
      exact: true,
    })
    await expect(textbox).toHaveValue("Reply with exactly: OK")
    const detail = page.locator(
      '[data-verification-detail-probe="text-generation"]',
    )
    const before = (await detail.boundingBox())!
    const dialogBefore = (await dialog.boundingBox())!
    await textbox.fill(Array(80).fill("A line of prompt content").join("\n"))
    expect((await detail.boundingBox())!.height).toBeCloseTo(before.height, 0)
    expect((await dialog.boundingBox())!.height).toBeCloseTo(
      dialogBefore.height,
      0,
    )
    expect(
      await textbox.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true)
    await textbox.fill("Reply with exactly: EDITED")
    await expect
      .poll(
        async () =>
          (await getStoredUserPreferences(worker)).verificationProbePrompts,
      )
      .toMatchObject({ "text-generation": "Reply with exactly: EDITED" })
    await page
      .getByRole("button", { name: "Drawing test", exact: true })
      .click()
    await expect(textbox).toBeHidden()
    await selectText.click()
    await expect(textbox).toHaveValue("Reply with exactly: EDITED")
    for (const width of [1280, 1000, 420]) {
      await page.setViewportSize({ width, height: 850 })
      await showVerificationSettings(page)
      await page
        .getByTestId("verification-workspace")
        .getByRole("button", { name: "Settings", exact: true })
        .click()
      await expect(settings).toBeHidden()
      await expect(dialog).toBeVisible()
      await showVerificationTest(page, "Text generation")
      await expect(textbox).toBeVisible()
      await expect(textbox).toHaveValue("Reply with exactly: EDITED")
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true)
    }
    await page.setViewportSize({ width: 1600, height: 1000 })
    await showVerificationSettings(page)
    await page.reload()
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
      "gpt-quality",
    )
    await selectText.click()
    await expect(textbox).toHaveValue("Reply with exactly: EDITED")
    const requestCount = fixture.prompts.length
    const inlineRun = textProbe
      .getByText("Select Run to start this test.", { exact: true })
      .getByRole("button", { name: "Run", exact: true })
    await textbox.press("Enter")
    await expect.poll(() => fixture.prompts.length).toBe(requestCount + 1)
    expect(fixture.prompts.at(-1)).toBe("Reply with exactly: EDITED")
    const result = textProbe.getByRole("region", {
      name: "Execution result",
      exact: true,
    })
    await expect(result).toBeVisible()
    await expect(inlineRun).toHaveCount(0)
    await expect(textbox).toBeVisible()
    const sent = result.getByRole("region", {
      name: "Question used for this run",
    })
    await expect(sent).toHaveText("Reply with exactly: EDITED")
    await textbox.fill("Next prompt")
    await expect(sent).toHaveText("Reply with exactly: EDITED")
    const detailsToggle = result.getByRole("button", {
      name: "Request details",
      exact: true,
    })
    await detailsToggle.click()
    await expect(result).toContainText("svg")
    await detailsToggle.click()
    await settings.evaluate((element) => {
      element.scrollTop = 0
    })
    await textProbe.locator("[data-verification-detail]").screenshot({
      path: test.info().outputPath("conversation-detail.png"),
      animations: "disabled",
    })
    await dialog.screenshot({
      path: test.info().outputPath("three-column-profile-result.png"),
      animations: "disabled",
    })
    await captureVisualViews({
      page,
      ready: result,
      id: "prompt-auto-result",
      extensionDir,
    })
    await page
      .getByRole("button", { name: "Reset this prompt", exact: true })
      .click()
    await expect
      .poll(
        async () =>
          (await getStoredUserPreferences(worker)).verificationProbePrompts,
      )
      .not.toHaveProperty("text-generation")
    await expect(textbox).toHaveValue("Reply with exactly: OK")
    await page.reload()
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await selectText.click()
    await expect(
      textProbe.getByRole("button", { name: /^Previously:/ }).first(),
    ).toBeVisible()
  } finally {
    fixture.server.closeAllConnections()
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  }
})

test("account verification configuration aligns fields without empty grid cells", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  await stubLlmMetadataIndex(context)
  await forceExtensionLanguage(page, "zh-CN")
  await stubNewApiSiteRoutes(context, {
    models: ["gpt-oss-20b"],
    initialTokens: [
      {
        id: 1,
        user_id: 1,
        key: "synthetic-key",
        status: 1,
        name: "default group (auto)",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 1000,
        unlimited_quota: true,
        model_limits_enabled: false,
        model_limits: "",
        allow_ips: "",
        used_quota: 0,
        group: "default",
      },
    ],
  })
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({ site_name: "12" }),
  ])
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?accountId=e2e-account-1#${MENU_ITEM_IDS.MODELS}`,
  )
  await waitForExtensionRoot(page)
  const verifyButton = page
    .getByTestId(MODEL_LIST_TEST_IDS.verifyApiButton)
    .first()
  await expect(verifyButton).toBeVisible()
  await expect(verifyButton).toHaveAttribute("aria-label", "测试 API")
  await expect(
    page.getByTestId(MODEL_LIST_TEST_IDS.verifyCliSupportButton).first(),
  ).toHaveAttribute("aria-label", "CLI 兼容性测试")
  let releaseKeys!: () => void
  const keysReady = new Promise<void>((resolve) => {
    releaseKeys = resolve
  })
  await context.route("**/api/token/**", async (route) => {
    await keysReady
    await route.fallback()
  })
  await verifyButton.click()
  const header = page.getByTestId("verification-header")
  await expect(header.getByText("账号：12", { exact: true })).toBeVisible()
  await expect(header.getByRole("note")).toHaveCount(0)
  const help = header.getByRole("button", { name: "测试说明", exact: true })
  await expect(help).toHaveAccessibleDescription(
    "结果仅适用于本次测试的接口、模型和请求配置。",
  )
  await help.focus()
  await help.press("Enter")
  await expect(
    page
      .getByRole("tooltip")
      .filter({ hasText: "结果仅适用于本次测试的接口、模型和请求配置。" }),
  ).toHaveText("结果仅适用于本次测试的接口、模型和请求配置。")
  await help.press("Escape")
  await expect(
    page
      .getByRole("tooltip")
      .filter({ hasText: "结果仅适用于本次测试的接口、模型和请求配置。" }),
  ).toHaveCount(0)
  await expect(header).toBeVisible()
  await expect(header.getByTestId("verification-config")).toHaveCount(0)
  const config = page.getByTestId("verification-config")
  await expect(config).toBeVisible()
  const key = config.getByRole("combobox", { name: "密钥", exact: true })
  const api = config.getByRole("combobox", { name: "接口类型", exact: true })
  const model = config.getByRole("textbox", { name: "模型", exact: true })
  const mode = config.getByRole("combobox", { name: "测试方式", exact: true })
  const profile = config.getByRole("combobox", {
    name: "客户端模拟",
    exact: true,
  })
  await expect(key).toHaveText("正在加载密钥...")
  await expect(key).toHaveAttribute("aria-busy", "true")
  await expect(key).toBeDisabled()
  await expect(page.getByText("正在加载密钥...", { exact: true })).toHaveCount(
    1,
  )
  await page.locator('[data-slot="modal-panel"]').screenshot({
    path: test.info().outputPath("account-key-loading.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    ready: config,
    id: "account-key-loading",
    extensionDir,
  })
  releaseKeys()
  await expect(model).toHaveValue("gpt-oss-20b")
  await expect(key).toBeEnabled()
  await header.getByText("API 测试", { exact: true }).click()
  await page.getByRole("button", { name: "绘图测试", exact: true }).click()
  await captureVisualViews({
    page,
    ready: config,
    id: "account-wide",
    extensionDir,
  })
  await expectVerificationWorkspaceFlush(
    page.getByTestId("verification-workspace"),
  )
  expect(
    (await page.locator('[data-slot="modal-panel"]').boundingBox())!.width,
  ).toBeGreaterThanOrEqual(1000)
  const modelsBox = (await page
    .getByTestId("verify-probe-models")
    .boundingBox())!
  const textBox = (await page
    .getByTestId("verify-probe-text-generation")
    .boundingBox())!
  expect(textBox.x).toBeCloseTo(modelsBox.x, 0)
  expect(textBox.y).toBeGreaterThanOrEqual(modelsBox.y + modelsBox.height)
  expect(modelsBox.width).toBeCloseTo(textBox.width, 0)
  const desktop = await Promise.all(
    [key, api, model, mode, profile].map((field) => field.boundingBox()),
  )
  expect(
    Math.max(...desktop.map((box) => box!.x)) -
      Math.min(...desktop.map((box) => box!.x)),
  ).toBeLessThanOrEqual(2)
  expect(desktop[2]!.width).toBeCloseTo(desktop[3]!.width, 0)
  const modelsProbe = page.getByTestId("verify-probe-models")
  const titleBounds = await modelsProbe
    .locator("[data-verification-summary]")
    .boundingBox()
  const runBounds = await modelsProbe
    .locator("[data-verification-summary]")
    .getByRole("button", { name: "运行", exact: true })
    .boundingBox()
  expect(
    Math.abs(
      titleBounds!.y +
        titleBounds!.height / 2 -
        (runBounds!.y + runBounds!.height / 2),
    ),
  ).toBeLessThanOrEqual(2)
  await config.screenshot({
    path: test.info().outputPath("account-config-desktop.png"),
    animations: "disabled",
  })
  await page.locator('[data-slot="modal-panel"]').screenshot({
    path: test.info().outputPath("account-dialog-desktop.png"),
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1280, height: 1280 })
  await page.getByRole("button", { name: "文本生成", exact: true }).click()
  const inlineRun = page
    .getByText("点击 运行 开始本项测试。", { exact: true })
    .getByRole("button", { name: "运行", exact: true })
  await expect(inlineRun).toBeEnabled()
  await captureVisualViews({
    page,
    ready: inlineRun,
    id: "inline-run-chinese",
    extensionDir,
    views: [
      { id: "light", width: 1280, height: 1280, theme: "light" },
      { id: "dark", width: 1280, height: 1280, theme: "dark" },
    ],
  })
  await inlineRun.focus()
  await page.keyboard.press("Tab")
  await page.keyboard.press("Shift+Tab")
  await expect(inlineRun).toBeFocused()
  expect(
    await inlineRun.evaluate((button) => button.matches(":focus-visible")),
  ).toBe(true)
  await captureVisualViews({
    page,
    ready: inlineRun,
    id: "inline-run-keyboard-focus",
    extensionDir,
  })
  const workspace = page.getByTestId("verification-workspace")
  const showTests = async () => {
    const toggle = workspace.locator(
      ".verification-workspace-list-header button",
    )
    if ((await toggle.getAttribute("aria-expanded")) === "false")
      await toggle.click()
  }
  const contextPanel = page.getByRole("region", {
    name: "上下文容量测试",
    exact: true,
  })
  const contextSelection = contextPanel.getByRole("button", {
    name: "上下文容量测试",
    exact: true,
  })
  const contextHelp = contextPanel.getByRole("button", {
    name: "上下文容量测试说明",
    exact: true,
  })
  const contextSummary = contextPanel.locator("[data-verification-summary]")
  const contextStatus = contextSummary.getByText("待运行", { exact: true })
  for (const [width, height] of [
    [1280, 1280],
    [660, 1280],
    [420, 1280],
    [1280, 480],
  ] as const) {
    await page.setViewportSize({ width, height })
    await showTests()
    await page.getByRole("button", { name: "文本生成", exact: true }).click()
    await showTests()
    await contextHelp.click()
    const contextTooltip = page.getByRole("tooltip")
    await expect(contextTooltip).toContainText("每批累计输入预算约 8M tokens")
    // Tooltip text can be mounted before its floating position is calculated.
    await expect
      .poll(async () => {
        const tooltip = await contextTooltip.boundingBox()
        const anchor = await contextHelp.boundingBox()
        if (!tooltip || !anchor) return false
        const gapAbove = anchor.y - tooltip.y - tooltip.height
        const gapBelow = tooltip.y - anchor.y - anchor.height
        const gapLeft = anchor.x - tooltip.x - tooltip.width
        const gapRight = tooltip.x - anchor.x - anchor.width
        const overlapsX =
          tooltip.x < anchor.x + anchor.width &&
          tooltip.x + tooltip.width > anchor.x
        const overlapsY =
          tooltip.y < anchor.y + anchor.height &&
          tooltip.y + tooltip.height > anchor.y
        return (
          (overlapsX &&
            ((gapAbove >= 0 && gapAbove <= 16) ||
              (gapBelow >= 0 && gapBelow <= 16))) ||
          (overlapsY &&
            ((gapLeft >= 0 && gapLeft <= 16) ||
              (gapRight >= 0 && gapRight <= 16)))
        )
      })
      .toBe(true)
    await expect
      .poll(() =>
        contextTooltip.evaluate((tooltip) => {
          const box = tooltip.getBoundingClientRect()
          const root = tooltip.getRootNode() as Document | ShadowRoot
          return (
            [
              [box.left + 6, box.top + 6],
              [box.right - 6, box.bottom - 6],
            ] as const
          ).every(([x, y]) => {
            const hit = root.elementFromPoint(x, y)
            return hit !== null && tooltip.contains(hit)
          })
        }),
      )
      .toBe(true)
    await expect(contextSelection).toHaveAttribute("aria-expanded", "false")
    await captureVisualViews({
      page,
      ready: contextHelp,
      id: `context-help-${width}-${height}`,
      extensionDir,
    })
    await expect
      .poll(() =>
        page
          .locator("[data-verification-list]")
          .evaluate((list) => list.scrollWidth - list.clientWidth),
      )
      .toBeLessThanOrEqual(1)
    const tooltipBox = (await contextTooltip.boundingBox())!
    expect(tooltipBox.x).toBeGreaterThanOrEqual(0)
    expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(width)
    expect(tooltipBox.y).toBeGreaterThanOrEqual(0)
    expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(height)
    const labelBox = (await contextSelection.boundingBox())!
    const helpBox = (await contextHelp.boundingBox())!
    const badgeBox = (await contextStatus.boundingBox())!
    expect(helpBox.x - labelBox.x - labelBox.width).toBeGreaterThanOrEqual(0)
    expect(helpBox.x - labelBox.x - labelBox.width).toBeLessThanOrEqual(10)
    expect(
      badgeBox.x >= helpBox.x + helpBox.width ||
        badgeBox.y >= helpBox.y + helpBox.height,
    ).toBe(true)
    await contextSelection.focus()
    // Keep the status click valid when the viewport moves the dialog after its
    // geometry checks, as can happen while responsive layout settles.
    await page.setViewportSize({ width, height: height - 48 })
    await expect(contextTooltip).toHaveCount(0)
    await contextSummary.scrollIntoViewIfNeeded()
    // Target the selection button's hit area over the status, so Playwright
    // checks that the button receives the click instead of accepting any
    // descendant of the summary (such as the adjacent help control).
    await contextSelection.click({
      position: await contextStatus.evaluate((badge) => {
        const summary = badge.closest("[data-verification-summary]")!
        const selection = summary.querySelector("button[aria-expanded]")!
        const selectionBox = selection.getBoundingClientRect()
        const statusBox = badge.getBoundingClientRect()
        return {
          x: statusBox.x + statusBox.width / 2 - selectionBox.x,
          y: statusBox.y + statusBox.height / 2 - selectionBox.y,
        }
      }),
    })
    await expect(
      workspace.getByTestId("verification-active-test"),
    ).toHaveAttribute("aria-label", "上下文容量测试")
  }
  await showTests()
  await page.getByRole("button", { name: "绘图测试", exact: true }).click()
  await page.setViewportSize({ width: 420, height: 840 })
  const listToggle = workspace.locator(
    ".verification-workspace-list-header button",
  )
  if ((await listToggle.getAttribute("aria-expanded")) === "true")
    await listToggle.click()
  await help.click()
  const helpPanel = page
    .getByRole("tooltip")
    .filter({ hasText: "结果仅适用于本次测试的接口、模型和请求配置。" })
  await expect(helpPanel).toBeVisible()
  const helpBounds = (await helpPanel.boundingBox())!
  expect(helpBounds.x).toBeGreaterThanOrEqual(0)
  expect(helpBounds.x + helpBounds.width).toBeLessThanOrEqual(420)
  await page.screenshot({
    path: test.info().outputPath("test-help-narrow.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    ready: helpPanel,
    id: "account-narrow-help",
    extensionDir,
  })
  await help.press("Escape")
  await expect(helpPanel).toHaveCount(0)
  await showTests()
  const narrowModels = (await modelsProbe.boundingBox())!
  const narrowText = (await page
    .getByTestId("verify-probe-text-generation")
    .boundingBox())!
  expect(narrowText.y).toBeGreaterThanOrEqual(
    narrowModels.y + narrowModels.height,
  )
  await showVerificationSettings(page)
  await expect
    .poll(
      async () =>
        (await mode.boundingBox())!.y - (await profile.boundingBox())!.y,
    )
    .toBeGreaterThan(20)
  expect(await config.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await config.screenshot({
    path: test.info().outputPath("account-config-mobile.png"),
    animations: "disabled",
  })
  const shortcutHint = page.getByText(
    "已选择 Claude Code，你可以直接运行测试，或切换其他客户端。",
    { exact: true },
  )
  await expect(shortcutHint).toHaveCount(0)
  await page.setViewportSize({ width: 1280, height: 850 })
  await page
    .getByRole("button", { name: "关闭", exact: true })
    .filter({ hasText: "关闭" })
    .click()
  await expect(header).toBeHidden()
  await page.setViewportSize({ width: 1280, height: 850 })
  const cliShortcut = page
    .getByTestId(MODEL_LIST_TEST_IDS.verifyCliSupportButton)
    .first()
  await cliShortcut.hover()
  await expect(
    page.getByRole("tooltip", {
      name: "测试此 API 对 CLI 客户端的支持情况",
      exact: true,
    }),
  ).toBeVisible()
  await cliShortcut.click()
  await showVerificationSettings(page)
  await expect(shortcutHint).toBeVisible()
  await captureVisualViews({
    page,
    ready: shortcutHint,
    extensionDir,
    id: "account-cli-shortcut",
    views: [
      { id: "wide", width: 1280, height: 850, theme: "light" },
      { id: "narrow", width: 420, height: 840, theme: "light" },
      { id: "dark", width: 1280, height: 850, theme: "dark" },
    ],
  })
  await page.setViewportSize({ width: 420, height: 840 })
  await showVerificationSettings(page)
  await expect(shortcutHint).toBeVisible()
  const hintBox = (await shortcutHint.boundingBox())!
  expect(hintBox.x).toBeGreaterThanOrEqual(0)
  expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(420)
  await profile.click()
  await page.getByRole("option", { name: "Codex CLI", exact: true }).click()
  await expect(shortcutHint).toHaveCount(0)
  await page.setViewportSize({ width: 1280, height: 850 })
  await page
    .getByRole("button", { name: "关闭", exact: true })
    .filter({ hasText: "关闭" })
    .click()
  await expect(header).toBeHidden()
  await cliShortcut.click()
  await showVerificationSettings(page)
  await expect(shortcutHint).toBeVisible()
})

for (const outcome of ["timeout", "empty"] as const) {
  test(`verification result badges explain ${outcome} without opening details`, async ({
    context,
    extensionId,
    extensionDir,
    page,
  }) => {
    const fixture = createDrawingServer({ contextOutcome: outcome })
    await new Promise<void>((resolve) =>
      fixture.server.listen(0, "127.0.0.1", resolve),
    )
    try {
      const baseUrl = `http://127.0.0.1:${(fixture.server.address() as AddressInfo).port}`
      await stubLlmMetadataIndex(context)
      await forceExtensionLanguage(page, "zh-CN")
      await seedApiCredentialProfiles(await getServiceWorker(context), [
        createStoredApiCredentialProfile({
          id: "result-badges",
          name: "Result badge fixture",
          apiType: "openai-compatible",
          baseUrl,
          apiKey: "synthetic-key",
          telemetryConfig: { mode: "disabled" },
        }),
      ])
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
      )
      await waitForExtensionRoot(page)
      await page.getByTestId(IDS.verifyButton).click()
      await expect(page.getByTestId(IDS.verifyModelId)).toContainText(
        "gpt-quality",
      )
      const textProbe = page.getByTestId(
        getApiCredentialProfileVerifyProbeTestId("text-generation"),
      )
      await textProbe
        .locator("[data-verification-summary]")
        .getByRole("button", { name: "运行", exact: true })
        .click()
      await expect(
        textProbe
          .locator('[data-verification-summary] [data-slot="badge"]')
          .filter({ hasText: "通过" }),
      ).toBeVisible()
      await textProbe.screenshot({
        path: test.info().outputPath("passed-badge.png"),
        animations: "disabled",
      })
      const panel = page.getByRole("region", {
        name: "上下文容量测试",
        exact: true,
      })
      await panel
        .getByRole("button", { name: "探测上下文", exact: true })
        .click()
      await expect(
        panel
          .locator('[data-verification-summary] [data-slot="badge"]')
          .filter({
            hasText: outcome === "timeout" ? "请求超时" : "未返回正文",
          }),
      ).toBeVisible({ timeout: 30_000 })
      await panel
        .getByRole("button", { name: "上下文容量测试", exact: true })
        .click()
      const contextResult = page
        .locator("[data-verification-active-test]")
        .getByRole("status")
      await expect(contextResult).toHaveAttribute(
        "title",
        outcome === "timeout"
          ? /超时不能证明输入超过容量限制/
          : /接口正常结束但未返回正文/,
      )
      await expect(
        panel.getByRole("region", { name: "执行结果" }),
      ).toBeVisible()
      await expect(panel.getByRole("region", { name: "测试详情" })).toHaveCount(
        0,
      )
      await panel.screenshot({
        path: test.info().outputPath(`context-${outcome}.png`),
        animations: "disabled",
      })
      await captureVisualViews({
        page,
        ready: contextResult,
        extensionDir,
        id: `context-result-${outcome}`,
        views: [
          { id: "desktop", theme: "light", width: 1280, height: 1000 },
          { id: "dark", theme: "dark", width: 1280, height: 1000 },
          { id: "narrow", theme: "light", width: 380, height: 800 },
        ],
      })
      await panel.getByRole("button", { name: "测试详情", exact: true }).click()
      await expect(
        panel.getByRole("region", { name: "测试详情" }),
      ).toContainText("已发送 1 次请求")
      expect(fixture.requests).toHaveLength(2)
      await page.setViewportSize({ width: 420, height: 840 })
      await panel.screenshot({
        path: test.info().outputPath(`context-${outcome}-narrow.png`),
        animations: "disabled",
      })
    } finally {
      fixture.server.closeAllConnections()
      await new Promise<void>((resolve) =>
        fixture.server.close(() => resolve()),
      )
    }
  })
}

test("restores masked account context history without another key reveal", async ({
  context,
  page,
  extensionId,
}) => {
  const baseUrl = "https://masked-history.example.test"
  await stubLlmMetadataIndex(context)
  await forceExtensionLanguage(page, "en")
  await stubNewApiSiteRoutes(context, {
    baseUrl,
    models: ["gpt-quality"],
    initialTokens: [buildNewApiToken({ key: "sk-visible****suffix" })],
  })
  let reveals = 0
  let generations = 0
  await context.route(`${baseUrl}/api/token/1/key`, async (route) => {
    reveals++
    await route.fulfill({
      json: { success: true, data: { key: "resolved-context-secret" } },
    })
  })
  await context.route("**/chat/completions", async (route) => {
    generations++
    expect(route.request().headers().authorization).toBe(
      "Bearer sk-resolved-context-secret",
    )
    await route.fulfill({
      json: {
        id: "capacity",
        object: "chat.completion",
        created: 1,
        model: "gpt-quality",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "OK" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 1,
          total_tokens: 1001,
        },
      },
    })
  })
  const worker = await getServiceWorker(context)
  await seedStoredAccounts(worker, [createStoredAccount({ site_url: baseUrl })])
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?accountId=e2e-account-1#${MENU_ITEM_IDS.MODELS}`,
  )
  await waitForExtensionRoot(page)
  const verify = page.getByTestId(MODEL_LIST_TEST_IDS.verifyApiButton).first()
  await verify.click()
  const mode = page.getByRole("combobox", { name: "Test mode", exact: true })
  await mode.click()
  await page.getByRole("option", { name: "Non-streaming", exact: true }).click()
  const panel = page.getByRole("region", {
    name: "Context capacity test",
    exact: true,
  })
  await panel
    .getByRole("button", { name: "Context capacity test", exact: true })
    .click()
  const run = panel.getByRole("button", { name: "Run context probe" })
  await expect(run).toBeEnabled()
  expect(reveals).toBe(0)
  await run.click()
  await expect(page.locator("[data-verification-active-test]")).toContainText(
    "Context capacity:",
    { timeout: 30000 },
  )
  await expect
    .poll(async () => {
      const config = (await getPlasmoStorageJsonValue(
        worker,
        STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
      )) as { contextSummaries?: { inventoryKey?: string }[] }
      return (
        config?.contextSummaries?.some((summary) =>
          Boolean(summary.inventoryKey),
        ) ?? false
      )
    })
    .toBe(true)
  expect(reveals).toBe(1)
  expect(generations).toBe(1)
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .filter({ hasText: "Close" })
    .click()
  await verify.click()
  await mode.click()
  await page.getByRole("option", { name: "Non-streaming", exact: true }).click()
  await panel
    .getByRole("button", { name: "Context capacity test", exact: true })
    .click()
  await expect(panel).toContainText("Accepted ≈1024K tokens")
  await expect(
    panel
      .locator('[data-verification-summary] [data-slot="badge"]')
      .filter({ hasText: "Not tested" }),
  ).toBeVisible()
  await expect(
    panel
      .locator('[data-verification-summary] [data-slot="badge"]')
      .filter({ hasText: /\bPass\b/ }),
  ).toHaveCount(0)
  expect(reveals).toBe(1)
  expect(generations).toBe(1)
  for (const width of [1280, 420]) {
    await page.setViewportSize({ width, height: 850 })
    await panel.scrollIntoViewIfNeeded()
    expect(
      await panel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await panel.screenshot({
      path: test
        .info()
        .outputPath(`masked-account-context-history-${width}.png`),
      animations: "disabled",
    })
  }
})
