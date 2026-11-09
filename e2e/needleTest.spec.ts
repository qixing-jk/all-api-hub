import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS as IDS } from "~/features/ApiCredentialProfiles/testIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import en from "~/locales/en/aiApiVerification.json" with { type: "json" }
import zhCN from "~/locales/zh-CN/aiApiVerification.json" with { type: "json" }
import { MODEL_METADATA_URL } from "~/services/models/modelMetadata/constants"
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
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import { buildNewApiToken } from "~~/tests/test-utils/newApiToken"

for (const [language, resource] of [
  ["zh-CN", zhCN],
  ["en", en],
] as const) {
  for (const contextSize of [131072, 1048576, undefined]) {
    const known = contextSize !== undefined
    const large = contextSize === 1048576
    test(`needle settings remain usable across panel widths (${language})${known ? (large ? " 1M" : "") : " unknown"}`, async ({
      context,
      page,
      extensionId,
    }) => {
      const labels = resource.verifyDialog.tools.needle
      const baseUrl = "https://needle-settings.example"
      await stubLlmMetadataIndex(context)
      if (known)
        await context.route(MODEL_METADATA_URL, (route) =>
          route.fulfill({
            json: {
              models: [
                {
                  id: "gpt-quality",
                  name: "Quality fixture",
                  limits: { context: contextSize },
                },
              ],
            },
          }),
        )
      await forceExtensionLanguage(page, language)
      await stubNewApiSiteRoutes(context, {
        baseUrl,
        models: ["gpt-quality"],
        initialTokens: [buildNewApiToken({ key: "sk-fixture" })],
      })
      await seedStoredAccounts(await getServiceWorker(context), [
        createStoredAccount({ site_url: baseUrl }),
      ])
      await page.setViewportSize({ width: 1280, height: 1000 })
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?accountId=e2e-account-1#${MENU_ITEM_IDS.MODELS}`,
      )
      await waitForExtensionRoot(page)
      await page
        .getByTestId(MODEL_LIST_TEST_IDS.verifyApiButton)
        .first()
        .click()
      const panel = page.getByRole("region", {
        name: labels.title,
        exact: true,
      })
      await panel
        .getByRole("button", { name: labels.title, exact: true })
        .click()
      await expect(
        panel.getByRole("button", { name: labels.run }),
      ).toBeEnabled()
      await expect(
        panel.getByRole("switch", { name: labels.quick }),
      ).toBeChecked()
      await panel.getByRole("switch", { name: labels.quick }).click()
      const settings = panel.getByRole("group", {
        name: resource.verifyDialog.tools.settingsTitle,
      })
      const preview = panel.getByRole("region", { name: labels.previewTitle })
      const plannedLengths = preview.getByRole("group", {
        name: labels.plannedLengths,
      })
      await expect(
        preview.getByRole("heading", { name: labels.previewTitle }),
      ).toBeVisible()
      await expect(preview.getByRole("table")).toBeVisible()
      await expect(settings.getByRole("table")).toHaveCount(0)
      if (known) {
        await expect(
          plannedLengths.getByText(large ? "1023K" : "127K", { exact: true }),
        ).toBeVisible()
        await expect(preview).toContainText(large ? "6M" : "741K")
        await expect(panel).toContainText(
          labels.reference.context.replace("{{tokens}}", large ? "1M" : "128K"),
        )
      } else {
        await expect(
          panel.getByText(
            labels.reference.unknown.replace("{{tokens}}", "16K"),
            { exact: true },
          ),
        ).toBeVisible()
        await expect(
          panel.getByRole("button", { name: labels.probeFirst }),
        ).toBeVisible()
      }
      const limit = panel.getByRole("combobox", { name: labels.limit })
      if (!known) {
        const detect = panel.getByRole("button", { name: labels.probeFirst })
        await detect.hover()
        const detectionHint = page.getByRole("tooltip")
        await expect(detectionHint).toContainText(
          labels.reference.unknown.replace("{{tokens}}", "16K"),
        )
        await expect(detectionHint).toHaveCSS("opacity", "0.9")
        await detectionHint.screenshot({
          path: test.info().outputPath("needle-detection-hint.png"),
          animations: "disabled",
        })
        await limit.hover()
        await expect(detectionHint).toBeHidden()
      }
      const selectLimit = async (name: string) => {
        await limit.click()
        await page.getByRole("option", { name, exact: true }).click()
      }
      const automaticLabel = labels.automaticLimit.replace(
        "{{limit}}",
        known ? (large ? "1023K" : "127K") : "16K",
      )
      await expect(limit).toHaveText(automaticLabel)
      await expect(
        panel.getByRole("spinbutton", { name: labels.customLimit }),
      ).toHaveCount(0)
      await limit.click()
      await expect(page.getByRole("option")).toHaveCount(
        known && !large ? 6 : 9,
      )
      await page.keyboard.press("Escape")
      await expect(preview.getByRole("spinbutton")).toHaveCount(0)
      await expect(limit).toBeVisible()
      await expect(limit).toHaveAccessibleDescription(
        known
          ? labels.reference.context.replace(
              "{{tokens}}",
              large ? "1M" : "128K",
            )
          : labels.reference.unknown.replace("{{tokens}}", "16K"),
      )
      await expect(
        panel.getByRole("spinbutton", { name: labels.seedInput }),
      ).toBeVisible()
      await selectLimit(known ? (large ? "1023K" : "127K") : "1M")
      await expect(limit).toHaveText(known ? (large ? "1023K" : "127K") : "1M")
      await selectLimit("64K")
      await expect(limit).toHaveText("64K")
      await expect(
        plannedLengths.getByText("64K", { exact: true }),
      ).toBeVisible()
      if (!known)
        await expect(
          panel.getByText(
            labels.reference.unknown.replace("{{tokens}}", "16K"),
            { exact: true },
          ),
        ).toBeVisible()
      await selectLimit(automaticLabel)
      await expect(limit).toHaveText(automaticLabel)
      for (const [view, width, height, dark] of [
        ["desktop", 1280, 1000, false],
        ["tall", 1280, 2000, false],
        ["compact", 1024, 1000, false],
        ["narrow", 380, 1000, false],
        ["dark", 1280, 1000, true],
      ] as const) {
        await page.setViewportSize({ width, height })
        await page.evaluate((isDark) => {
          document.documentElement.classList.toggle("dark", isDark)
        }, dark)
        await limit.scrollIntoViewIfNeeded()
        await expect(limit).toBeInViewport()
        const settingsBox = (await settings.locator("..").boundingBox())!
        const previewBox = (await preview.boundingBox())!
        // Settings and the complete plan are separate, aligned sections.
        const previewGap = previewBox.y - settingsBox.y - settingsBox.height
        expect(previewGap).toBeGreaterThanOrEqual(8)
        expect(previewGap).toBeLessThanOrEqual(24)
        expect(Math.abs(previewBox.x - settingsBox.x)).toBeLessThanOrEqual(1)
        expect(
          Math.abs(previewBox.width - settingsBox.width),
        ).toBeLessThanOrEqual(1)
        if (view === "tall") {
          const flow = panel.getByRole("list", {
            name: resource.verifyDialog.intro.flow,
          })
          await expect(flow).toBeVisible()
          const flowBox = (await flow.boundingBox())!
          expect(flowBox.y).toBeGreaterThan(previewBox.y + previewBox.height)
        } else if (view === "narrow") {
          const description = panel.getByText(labels.description, {
            exact: true,
          })
          const descriptionBox = (await description.boundingBox())!
          expect(descriptionBox.y + descriptionBox.height).toBeLessThanOrEqual(
            settingsBox.y,
          )
        }
        const labelBox = (await panel
          .getByText(labels.limit, { exact: true })
          .boundingBox())!
        const helpBox = (await settings
          .getByRole("button", { name: labels.planDetails })
          .boundingBox())!
        expect(
          Math.abs(helpBox.x - labelBox.x - labelBox.width),
        ).toBeLessThanOrEqual(8)
        expect(
          Math.abs(
            helpBox.y + helpBox.height / 2 - labelBox.y - labelBox.height / 2,
          ),
        ).toBeLessThanOrEqual(2)
        await expect(
          preview.getByRole("button", { name: labels.planDetails }),
        ).toHaveCount(0)
        if (!known) {
          const probeBox = (await panel
            .getByRole("button", { name: labels.probeFirst })
            .boundingBox())!
          expect(
            Math.abs(probeBox.x - helpBox.x - helpBox.width),
          ).toBeLessThanOrEqual(8)
          expect(
            Math.abs(
              probeBox.y +
                probeBox.height / 2 -
                labelBox.y -
                labelBox.height / 2,
            ),
          ).toBeLessThanOrEqual(2)
          expect(probeBox.width).toBeLessThanOrEqual(36)
        }
        const details = panel.locator("[data-verification-detail]")
        // Both sections share a surface style; the preview owns the whole plan.
        expect(
          await settings.evaluate(
            (element) => getComputedStyle(element).backgroundColor,
          ),
        ).toBe(
          await preview.evaluate(
            (element) => getComputedStyle(element).backgroundColor,
          ),
        )
        expect(
          await settings.evaluate((element) => {
            const card = getComputedStyle(element.parentElement!)
            const background = getComputedStyle(element).backgroundColor
            return (
              parseFloat(card.borderTopWidth) > 0 &&
              card.borderTopColor !== background
            )
          }),
        ).toBe(true)
        expect(
          await details.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true)
        await details.screenshot({
          path: test.info().outputPath(`needle-settings-${view}.png`),
          animations: "disabled",
        })
      }
      await selectLimit(labels.custom)
      const custom = panel.getByRole("spinbutton", { name: labels.customLimit })
      await expect(custom).toHaveValue(
        known ? (large ? "1047552" : "130048") : "16384",
      )
      await custom.fill("4096")
      await expect(
        plannedLengths.getByText("4K", { exact: true }),
      ).toBeVisible()
      await expect(
        panel.getByRole("button", { name: labels.run }),
      ).toBeEnabled()
      await custom.fill("0")
      await expect(panel.getByRole("alert")).toBeVisible()
      await expect(
        panel.getByRole("button", { name: labels.run }),
      ).toBeDisabled()
      await custom.clear()
      await expect(panel.getByRole("alert")).toHaveCount(0)
      await expect(
        panel.getByRole("button", { name: labels.run }),
      ).toBeEnabled()
      await custom.fill("16384")
      await expect(custom).toBeVisible()
      await expect(limit).toHaveText(labels.custom)
      await panel.locator("[data-verification-detail]").screenshot({
        path: test.info().outputPath("needle-settings-custom.png"),
        animations: "disabled",
      })
      await selectLimit(automaticLabel)
      await expect(custom).toHaveCount(0)
      await panel.getByRole("switch", { name: labels.quick }).click()
      await expect(
        panel.getByRole("switch", { name: labels.quick }),
      ).toBeChecked()
      const seed = panel.getByRole("spinbutton", { name: labels.seedInput })
      await seed.fill("42")
      await expect(seed).toHaveValue("42")
      await panel.locator("[data-verification-detail]").screenshot({
        path: test.info().outputPath("needle-settings-sample.png"),
        animations: "disabled",
      })
      const explanation = settings.getByRole("button", {
        name: labels.planDetails,
      })
      const help = page.getByRole("dialog", {
        name: labels.planDetails,
        exact: true,
      })
      for (const [view, width, dark] of [
        ["desktop", 1280, false],
        ["narrow", 380, false],
        ["dark", 1280, true],
      ] as const) {
        await page.setViewportSize({ width, height: 1000 })
        await page.evaluate(
          (isDark) => document.documentElement.classList.toggle("dark", isDark),
          dark,
        )
        await explanation.scrollIntoViewIfNeeded()
        const previewBeforeHelp = (await preview.boundingBox())!
        if (view === "narrow") {
          await explanation.click()
        } else if (view === "desktop") {
          await explanation.hover()
          await expect(help).toBeVisible()
          await help.hover()
          await expect(help).toBeVisible()
          await explanation.click()
          await page.mouse.move(0, 0)
        } else {
          await limit.focus()
          await explanation.focus()
          await expect(help).toBeVisible()
          await page.keyboard.press("Enter")
        }
        await expect(help).toBeVisible()
        await expect(help).toContainText(
          known ? (large ? "1,047,552" : "130,048") : "16,384",
        )
        await expect(async () => {
          const bounds = (await help.boundingBox())!
          expect(bounds.x).toBeGreaterThanOrEqual(0)
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
          expect(bounds.y).toBeGreaterThanOrEqual(0)
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(1000)
        }).toPass()
        const previewWithHelp = (await preview.boundingBox())!
        expect(previewWithHelp.height).toBe(previewBeforeHelp.height)
        expect(
          Math.abs(previewWithHelp.y - previewBeforeHelp.y),
        ).toBeLessThanOrEqual(1)
        const detailsBounds = (await panel
          .locator("[data-verification-detail]")
          .boundingBox())!
        const helpBounds = (await help.boundingBox())!
        const x = Math.min(detailsBounds.x, helpBounds.x)
        const y = Math.min(detailsBounds.y, helpBounds.y)
        await page.screenshot({
          path: test.info().outputPath(`needle-plan-details-${view}.png`),
          clip: {
            x,
            y,
            width:
              Math.max(
                detailsBounds.x + detailsBounds.width,
                helpBounds.x + helpBounds.width,
              ) - x,
            height:
              Math.max(
                detailsBounds.y + detailsBounds.height,
                helpBounds.y + helpBounds.height,
              ) - y,
          },
          animations: "disabled",
        })
        await help.screenshot({
          path: test.info().outputPath(`needle-length-help-${view}.png`),
          animations: "disabled",
        })
        await page.keyboard.press("Escape")
        await expect(help).toBeHidden()
        await expect(explanation).toBeFocused()
      }
      if (language === "zh-CN" && !known) {
        await page.setViewportSize({ width: 1280, height: 1320 })
        await page.evaluate(() =>
          document.documentElement.classList.remove("dark"),
        )
        for (const [name, id] of [
          [resource.verifyDialog.tools.context.title, "context"],
          [resource.verifyDialog.tools.pelican.title, "drawing"],
          [labels.title, "needle"],
        ] as const) {
          const sibling = page.getByRole("region", { name, exact: true })
          await sibling.getByRole("button", { name, exact: true }).click()
          await expect(
            sibling.getByRole("list", {
              name: resource.verifyDialog.intro.flow,
            }),
          ).toBeVisible()
          if (id === "drawing") {
            const settings = sibling.getByRole("group", {
              name: resource.verifyDialog.tools.settingsTitle,
            })
            await expect(
              settings.getByRole("heading", {
                name: resource.verifyDialog.tools.settingsTitle,
              }),
            ).toBeVisible()
            await expect(settings.getByRole("switch")).toBeVisible()
            await expect(
              settings.getByRole("button", {
                name: resource.verifyDialog.tools.prompts.editorLabel.replace(
                  "{{probe}}",
                  name,
                ),
              }),
            ).toBeVisible()
            const settingsBox = (await settings.boundingBox())!
            const titleBox = (await sibling
              .locator("[data-verification-detail]")
              .getByRole("heading", { name, exact: true })
              .boundingBox())!
            expect(settingsBox.y + settingsBox.height).toBeLessThan(titleBox.y)
          }
          await sibling.locator("[data-verification-detail]").screenshot({
            path: test.info().outputPath(`${id}-idle-tall.png`),
            animations: "disabled",
          })
        }
      }
    })
  }
}

for (const [stopScope, mode] of [
  ["all", "Non-streaming"],
  ["row", "Non-streaming"],
  ["cell", "Non-streaming"],
  ["column", "Non-streaming"],
  ["row", "Streaming"],
  ["cell", "Streaming"],
] as const) {
  test(`native needle pages share ownership and retain a stopped first request (${stopScope}, ${mode})`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }) => {
    let requests = 0
    let firstResponseClosed = false
    const server = createServer(async (request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*")
      response.setHeader("Access-Control-Allow-Headers", "*")
      if (request.method === "OPTIONS") {
        response.end()
        return
      }
      if (request.method === "GET") {
        response.setHeader("Content-Type", "application/json")
        response.end(JSON.stringify({ data: [{ id: "gpt-quality" }] }))
        return
      }
      for await (const _chunk of request) {
        /* consume body, keep response pending */
      }
      expect(request.headers.authorization).toBe("Bearer synthetic-key")
      requests++
      if (requests === 1)
        response.once("close", () => {
          firstResponseClosed = true
        })
      const completion = {
        id: "needle-stop",
        object: "chat.completion",
        created: 1,
        model: "gpt-quality",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "wrong" },
            finish_reason: "stop",
          },
        ],
      }
      if (mode === "Streaming") {
        response.setHeader("Content-Type", "text/event-stream")
        response.write(
          `data: ${JSON.stringify({ ...completion, choices: [{ index: 0, delta: { content: "wrong" }, finish_reason: null }] })}\n\n`,
        )
        if (requests > 1)
          response.end(
            `data: ${JSON.stringify({ ...completion, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
          )
      } else if (requests > 1) {
        response.setHeader("Content-Type", "application/json")
        response.end(JSON.stringify(completion))
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      await stubLlmMetadataIndex(context)
      await forceExtensionLanguage(page, "en")
      await seedApiCredentialProfiles(await getServiceWorker(context), [
        createStoredApiCredentialProfile({
          id: "needle",
          name: "Needle target",
          apiType: "openai-compatible",
          baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
          apiKey: "synthetic-key",
          telemetryConfig: { mode: "disabled" },
        }),
      ])
      const open = async (targetPage: Page) => {
        await targetPage.emulateMedia({ reducedMotion: "reduce" })
        await targetPage.goto(
          `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
        )
        await waitForExtensionRoot(targetPage)
        await targetPage.getByTestId(IDS.verifyButton).click()
        await targetPage.getByRole("combobox", { name: "Test mode" }).click()
        await targetPage
          .getByRole("option", { name: mode, exact: true })
          .click()
        const panel = targetPage.getByRole("region", {
          name: "Needle in a haystack",
          exact: true,
        })
        await panel
          .getByRole("button", { name: "Needle in a haystack", exact: true })
          .click()
        await expect(
          panel.getByRole("button", { name: "Run needle test" }),
        ).toBeEnabled()
        return panel
      }
      const first = await open(page)
      await first
        .getByRole("button", { name: /^Run .* row \(3 requests\)$/ })
        .last()
        .click()
      await expect.poll(() => requests).toBe(1)
      const otherPage = await context.newPage()
      const second = await open(otherPage)
      await second.getByRole("button", { name: "Run needle test" }).click()
      await expect(second).toContainText("already running in another page")
      expect(requests).toBe(1)
      const resultPanel = first.getByRole("region", {
        name: "Execution result",
      })
      const stop =
        stopScope === "all"
          ? resultPanel.getByRole("button", { name: "Stop", exact: true })
          : stopScope === "row"
            ? first.getByRole("button", { name: /^Stop .* row$/ })
            : stopScope === "column"
              ? first.getByRole("button", {
                  name: "Stop 10% column",
                  exact: true,
                })
              : first.getByRole("button", { name: /^Stop .* · 10%$/ })
      await expect(stop).toBeEnabled()
      if (stopScope !== "cell")
        await expect(stop).toHaveAttribute("aria-busy", "true")
      await captureVisualViews({
        page,
        ready: resultPanel,
        extensionDir,
        id: `native-needle-preview-stop-${stopScope}-${mode.toLowerCase()}`,
        views: [
          { id: "desktop", theme: "light", width: 1280, height: 1000 },
          { id: "narrow", theme: "light", width: 380, height: 800 },
        ],
      })
      const resultToggle = first.getByRole("button", {
        name: "Execution result",
      })
      if (stopScope === "all") {
        await resultToggle.click()
        await expect(first.getByRole("table")).toBeHidden()
        await expect(stop).toBeVisible()
      }
      await stop.focus()
      await page.keyboard.press("Enter")
      await expect.poll(() => firstResponseClosed).toBe(true)
      await expect(first).toContainText("Stopped")
      const expectedRequests =
        stopScope === "cell" || stopScope === "column" ? 3 : 1
      await expect(first).toContainText(
        `Processed ${expectedRequests}/3 requests`,
      )
      await expect(
        resultPanel.getByRole("button", { name: "Run", exact: true }),
      ).toBeEnabled()
      if (stopScope === "all") {
        await expect(resultToggle).toHaveAttribute("aria-expanded", "false")
        await expect(
          first.getByText("Latest run: Processed 1/3 requests"),
        ).toBeVisible()
        await resultToggle.click()
      }
      await expect(
        first.getByRole("button", {
          name: stopScope === "all" ? /10%: Unknown/ : /10%: Cancelled/,
        }),
      ).toBeVisible()
      expect(requests).toBe(expectedRequests)
      await expect(first.getByText("Could not stop. Try again.")).toBeHidden()
      if (expectedRequests === 3)
        await expect(
          first.getByRole("table").getByText("Miss", { exact: true }),
        ).toHaveCount(2)
      if (stopScope === "row")
        await expect(
          first.getByRole("table").getByText("Cancelled", { exact: true }),
        ).toHaveCount(3)
      await page
        .getByRole("button", { name: "Close", exact: true })
        .last()
        .click()
      const restored = await open(page)
      await expect(restored).toContainText("Saved result")
      await restored
        .getByRole("button", {
          name: "Test parameters and reproduction",
          exact: true,
        })
        .click()
      await expect(restored).not.toContainText("Only measurements are saved")
      const historyBadge = restored.getByRole("button", {
        name: /^Previously:/,
      })
      await historyBadge.hover()
      await expect(
        page
          .getByRole("tooltip")
          .filter({ hasText: "History keeps measurements" }),
      ).toBeVisible()
      await page
        .getByRole("dialog")
        .screenshot({
          path: test.info().outputPath("needle-history-tooltip.png"),
          animations: "disabled",
        })
      await page.keyboard.press("Escape")
      await page.getByRole("dialog").screenshot({
        path: test.info().outputPath("native-needle-history-restored.png"),
        animations: "disabled",
      })
      await expect(restored).toContainText(
        `Processed ${expectedRequests}/3 requests`,
      )
      if (stopScope === "row")
        await expect(
          restored.getByRole("table").getByText("Cancelled", { exact: true }),
        ).toHaveCount(3)
      expect(requests).toBe(expectedRequests)
      await restored.getByRole("table").screenshot({
        path: test.info().outputPath("native-needle-stopped.png"),
        animations: "disabled",
      })
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
}

test("native needle rows send only the selected length, including retests with other saved rows", async ({
  context,
  page,
  extensionId,
}) => {
  const promptLengths: number[] = []
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Headers", "*")
    if (request.method === "OPTIONS") {
      response.end()
      return
    }
    response.setHeader("Content-Type", "application/json")
    if (request.method === "GET") {
      response.end(JSON.stringify({ data: [{ id: "gpt-quality" }] }))
      return
    }
    let body = ""
    for await (const chunk of request) body += chunk
    const payload = JSON.parse(body)
    promptLengths.push(JSON.stringify(payload.messages).length)
    response.end(
      JSON.stringify({
        id: "row-scope",
        object: "chat.completion",
        created: 1,
        model: "gpt-quality",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "wrong" },
            finish_reason: "stop",
          },
        ],
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await seedApiCredentialProfiles(await getServiceWorker(context), [
      createStoredApiCredentialProfile({
        id: "row-scope",
        name: "Row scope",
        apiType: "openai-compatible",
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
        apiKey: "synthetic-key",
        telemetryConfig: { mode: "disabled" },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(IDS.verifyButton).click()
    await page.getByRole("combobox", { name: "Test mode" }).click()
    await page
      .getByRole("option", { name: "Non-streaming", exact: true })
      .click()
    const panel = page.getByRole("region", {
      name: "Needle in a haystack",
      exact: true,
    })
    await panel
      .getByRole("button", { name: "Needle in a haystack", exact: true })
      .click()
    await panel
      .getByRole("button", { name: "Run 8K row (3 requests)", exact: true })
      .click()
    await expect.poll(() => promptLengths.length).toBe(3)
    await expect(
      panel.getByRole("button", { name: "Run needle test", exact: true }),
    ).toBeEnabled()
    await expect(
      panel.getByRole("button", { name: /^8192 tokens.*Miss$/ }),
    ).toHaveCount(3)
    await expect(
      panel.getByRole("button", { name: /^16384 tokens.*Not in this run$/ }),
    ).toHaveCount(3)

    await panel
      .getByRole("button", { name: "Run 16K row (3 requests)", exact: true })
      .click()
    await expect.poll(() => promptLengths.length).toBe(6)
    await expect(
      panel.getByRole("button", { name: "Run needle test", exact: true }),
    ).toBeEnabled()
    await expect(
      panel.getByRole("table").getByText("Miss", { exact: true }),
    ).toHaveCount(6)
    await panel
      .getByRole("button", { name: "Retest 8K row (3 requests)", exact: true })
      .click()
    await expect.poll(() => promptLengths.length).toBe(9)
    await expect(
      panel.getByRole("button", { name: "Run needle test", exact: true }),
    ).toBeEnabled()
    expect(promptLengths.slice(6)).toEqual(promptLengths.slice(0, 3))
    expect(Math.min(...promptLengths.slice(3, 6))).toBeGreaterThan(
      Math.max(...promptLengths.slice(0, 3)) * 1.5,
    )
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test("account needle testing reveals a masked key only on run and uses the selected credential", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  let requests = 0
  let releaseColumn!: () => void
  const columnResponse = new Promise<void>((resolve) => {
    releaseColumn = resolve
  })
  let releaseScoped!: () => void
  const scopedResponse = new Promise<void>((resolve) => {
    releaseScoped = resolve
  })
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Headers", "*")
    if (request.method === "OPTIONS") {
      response.end()
      return
    }
    if (request.method === "GET") {
      response.end(JSON.stringify({ data: [{ id: "gpt-quality" }] }))
      return
    }
    let raw = ""
    for await (const chunk of request) raw += chunk.toString()
    const prompt = JSON.parse(raw).messages.at(-1).content as string
    const key =
      /Question: Return only the archive code for record "([^"]+)"/.exec(
        prompt,
      )![1]
    const value = new RegExp(`Record "${key}" has archive code "([^"]+)"`).exec(
      prompt,
    )![1]
    expect(request.headers.authorization).toBe(
      "Bearer sk-resolved-needle-secret",
    )
    requests++
    if (requests === 4) await columnResponse
    if (requests === 12) await scopedResponse
    response.setHeader("Content-Type", "application/json")
    response.end(
      JSON.stringify({
        id: "needle",
        object: "chat.completion",
        created: 1,
        model: "gpt-quality",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: value },
            finish_reason: "stop",
          },
        ],
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "en")
    await stubNewApiSiteRoutes(context, {
      baseUrl,
      models: ["gpt-quality"],
      initialTokens: [buildNewApiToken({ key: "sk-visible****suffix" })],
    })
    // The site fixture owns management routes; generation must reach the local provider.
    await context.route(`${baseUrl}/v1/chat/completions`, (route) =>
      route.continue(),
    )
    let reveals = 0
    await context.route(`${baseUrl}/api/token/1/key`, async (route) => {
      reveals++
      await route.fulfill({
        json: { success: true, data: { key: "resolved-needle-secret" } },
      })
    })
    await seedStoredAccounts(await getServiceWorker(context), [
      createStoredAccount({ site_url: baseUrl }),
    ])
    await page.setViewportSize({ width: 1280, height: 1000 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?accountId=e2e-account-1#${MENU_ITEM_IDS.MODELS}`,
    )
    await waitForExtensionRoot(page)
    await page.getByTestId(MODEL_LIST_TEST_IDS.verifyApiButton).first().click()
    await page.getByRole("combobox", { name: "Test mode", exact: true }).click()
    await page
      .getByRole("option", { name: "Non-streaming", exact: true })
      .click()
    const panel = page.getByRole("region", {
      name: "Needle in a haystack",
      exact: true,
    })
    await panel
      .getByRole("button", { name: "Needle in a haystack", exact: true })
      .click()
    await expect(
      panel.getByRole("button", { name: "Run needle test" }),
    ).toBeEnabled()
    expect(reveals).toBe(0)
    expect(requests).toBe(0)
    await expect(
      panel.getByRole("table").getByText("Planned", { exact: true }),
    ).toHaveCount(3)
    await expect(
      panel.getByRole("table").getByText("Not in this run", { exact: true }),
    ).toHaveCount(3)
    await captureVisualViews({
      page,
      ready: panel,
      extensionDir,
      id: "account-needle-idle",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    await expect(
      panel.getByRole("switch", { name: "Test only the longest text" }),
    ).toBeChecked()
    await panel
      .getByRole("region", { name: "Test preview" })
      .getByRole("button", { name: "Run", exact: true })
      .click()
    await expect(panel).toContainText("3/3 graded answers matched", {
      timeout: 30000,
    })
    expect(reveals).toBe(1)
    expect(requests).toBe(3)
    await panel
      .getByRole("button", {
        name: "Retest 50% column (2 requests)",
        exact: true,
      })
      .click()
    await expect.poll(() => requests).toBe(4)
    await expect(
      panel.getByRole("button", { name: "8192 tokens · 50%: Running..." }),
    ).toBeVisible()
    const execution = panel.getByRole("region", { name: "Execution result" })
    await expect(
      panel.getByRole("region", { name: "Test preview" }),
    ).toHaveCount(0)
    await expect(execution).toContainText("2 requests")
    await expect(execution).toContainText("Each length is tested at 50%.")
    await expect(
      panel.getByRole("button", {
        name: "Stop 50% column",
        exact: true,
      }),
    ).toHaveAttribute("aria-busy", "true")
    await expect(
      panel.getByRole("table").getByText("Not in this run", { exact: true }),
    ).toHaveCount(2)
    await page.setViewportSize({ width: 380, height: 800 })
    const runningCell = panel
      .getByRole("table")
      .getByText("Running...", { exact: true })
    await expect(runningCell).toBeVisible()
    expect(
      await panel
        .getByRole("table")
        .evaluate(
          (element) =>
            element.scrollWidth <= element.parentElement!.clientWidth,
        ),
    ).toBe(true)
    expect(
      await runningCell.evaluate((element) => {
        const range = document.createRange()
        const text = [...element.childNodes].find(
          (node) => node.nodeType === Node.TEXT_NODE,
        )!
        range.selectNodeContents(text)
        return (
          range.getBoundingClientRect().height <=
          parseFloat(getComputedStyle(element).lineHeight)
        )
      }),
    ).toBe(true)
    await captureVisualViews({
      page,
      ready: panel.getByRole("table"),
      extensionDir,
      id: "account-needle-column-running",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    await captureVisualViews({
      page,
      ready: execution,
      extensionDir,
      id: "account-needle-column-preview",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    await page.setViewportSize({ width: 1280, height: 1000 })
    releaseColumn()
    await expect(panel).toContainText("4/4 graded answers matched")
    await expect(
      panel.getByRole("button", { name: "Run needle test" }),
    ).toBeEnabled()
    expect(requests).toBe(5)
    await panel
      .getByRole("button", { name: "Retest 8K row (3 requests)", exact: true })
      .click()
    await expect(panel).toContainText("6/6 graded answers matched")
    expect(requests).toBe(8)
    await panel
      .getByRole("button", { name: "Retest 8K row (3 requests)", exact: true })
      .click()
    await expect(
      panel.getByRole("button", { name: "Run needle test" }),
    ).toBeEnabled()
    expect(requests).toBe(11)
    await expect(panel.getByRole("table").getByRole("cell")).toHaveCount(6)
    const resultCard = panel.getByRole("region", {
      name: "Execution result",
      exact: true,
    })
    await expect(resultCard).toContainText(
      "Cumulative results: 6/6 graded answers matched",
    )
    await expect(resultCard).toContainText("Latest run: Processed 3/3 requests")
    await expect(
      resultCard.getByRole("group", {
        name: en.verifyDialog.tools.needle.plannedLengths,
      }),
    ).toHaveText("8Ktokens")
    await expect(
      resultCard.getByRole("button", { name: "Run", exact: true }),
    ).toHaveAccessibleDescription("3 requests")
    const resultBounds = (await resultCard.boundingBox())!
    const settingsBounds = (await panel
      .getByRole("group", { name: "Test settings" })
      .boundingBox())!
    expect(resultBounds.y + resultBounds.height).toBeLessThanOrEqual(
      settingsBounds.y,
    )
    await captureVisualViews({
      page,
      ready: panel.getByRole("table"),
      extensionDir,
      id: "account-needle-results",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    await panel.getByRole("table").scrollIntoViewIfNeeded()
    await page.screenshot({
      path: test.info().outputPath("account-needle-results.png"),
      animations: "disabled",
    })
    await panel
      .getByRole("button", { name: "Retest 8K row (3 requests)", exact: true })
      .click()
    await expect.poll(() => requests).toBe(12)
    await panel
      .getByRole("button", { name: "8192 tokens · 10%: Running..." })
      .hover()
    const details = panel.getByRole("region", {
      name: "Cell details",
      exact: true,
    })
    await expect(details).toBeHidden()
    await panel
      .getByRole("button", { name: "8192 tokens · 10%: Running..." })
      .click()
    await expect(details).toContainText("Running...")
    const activeMatrix = panel.getByRole("table")
    const statusBounds = await activeMatrix
      .getByRole("button", { name: "8192 tokens · 10%: Running..." })
      .boundingBox()
    const stopBounds = await activeMatrix
      .getByRole("button", { name: "Stop 8K · 10%" })
      .boundingBox()
    expect(statusBounds).not.toBeNull()
    expect(stopBounds).not.toBeNull()
    expect(Math.abs(statusBounds!.height - stopBounds!.height)).toBeLessThan(1)
    expect(
      Math.abs(statusBounds!.x + statusBounds!.width - stopBounds!.x),
    ).toBeLessThan(1)
    expect(requests).toBe(12)
    await panel
      .getByRole("button", { name: "8192 tokens · 90%: Pending", exact: true })
      .click()
    await details
      .getByRole("button", { name: "Stop 8K · 90%", exact: true })
      .click()
    await expect(
      panel.getByRole("button", { name: "8192 tokens · 90%: Cancelled" }),
    ).toBeVisible()
    expect(requests).toBe(12)
    await panel
      .getByRole("button", { name: "8192 tokens · 10%: Running..." })
      .click()
    await captureVisualViews({
      page,
      ready: panel.getByRole("table"),
      extensionDir,
      id: "account-needle-scoped-controls",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
        { id: "dark", theme: "dark", width: 1280, height: 1000 },
      ],
    })
    await details
      .getByRole("button", { name: "Stop 8K · 10%", exact: true })
      .click()
    await expect(
      panel.getByRole("button", { name: "Run needle test", exact: true }),
    ).toBeEnabled()
    expect(requests).toBe(13)
    await expect(details).toContainText("Cancelled")
    await expect(details).not.toContainText("Previous result (before this run)")
    await expect(details).toContainText("No gradable result was obtained.")
    await panel.locator("[data-verification-detail]").evaluate((element) => {
      element.scrollTop = 0
    })
    await captureVisualViews({
      page,
      ready: resultCard,
      extensionDir,
      id: "account-needle-cancelled-result",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "dark", theme: "dark", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    const resultToggle = resultCard.getByRole("button", {
      name: "Execution result",
    })
    await resultToggle.focus()
    await page.keyboard.press("Enter")
    await expect(resultToggle).toHaveAttribute("aria-expanded", "false")
    await expect(resultCard.getByRole("table")).toBeHidden()
    await expect(resultCard.getByText(/Cumulative results:/)).toBeVisible()
    await expect(resultCard.getByText(/Latest run:/)).toBeVisible()
    await captureVisualViews({
      page,
      ready: resultCard,
      extensionDir,
      id: "account-needle-collapsed-result",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    await resultToggle.click()
    await expect(details).toContainText("No gradable result was obtained.")
    await expect(
      panel.getByRole("button", { name: "8192 tokens · 10%: Cancelled" }),
    ).toHaveAttribute("aria-pressed", "true")
    await expect(
      panel.getByRole("button", { name: "8192 tokens · 50%: Match" }),
    ).toBeVisible()
    await panel
      .getByRole("button", { name: "8192 tokens · 90%: Cancelled" })
      .focus()
    await page.keyboard.press("Enter")
    await expect(details).toContainText("Previous result (before this run)")
    await panel
      .getByRole("button", { name: "8192 tokens · 50%: Match" })
      .click()
    await details
      .getByRole("button", { name: "Request and answer details" })
      .click()
    await expect(details.locator("pre")).toBeVisible()
    await expect(
      details.getByRole("button", { name: "Retest this cell", exact: true }),
    ).toHaveCSS("font-size", "12px")
    await captureVisualViews({
      page,
      ready: resultCard,
      extensionDir,
      id: "account-needle-response-details",
      views: [
        { id: "desktop", theme: "light", width: 1280, height: 1000 },
        { id: "dark", theme: "dark", width: 1280, height: 1000 },
        { id: "narrow", theme: "light", width: 380, height: 800 },
      ],
    })
    for (const depth of [50, 10, 90]) {
      await panel
        .getByRole("button", { name: new RegExp(`^8192 tokens · ${depth}%:`) })
        .click()
      const before = requests
      await details
        .getByRole("button", { name: "Retest this cell", exact: true })
        .click()
      await expect(
        panel.getByRole("button", { name: "Run needle test" }),
      ).toBeEnabled()
      expect(requests).toBe(before + 1)
      await expect(
        panel.getByRole("button", { name: `8192 tokens · ${depth}%: Match` }),
      ).toBeVisible()
      await expect(resultCard).toContainText(
        "Latest run: Processed 1/1 requests",
      )
      await expect(
        panel.getByRole("button", { name: "16384 tokens · 90%: Match" }),
      ).toBeVisible()
    }
  } finally {
    releaseColumn()
    releaseScoped()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
