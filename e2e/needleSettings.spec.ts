import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import en from "~/locales/en/aiApiVerification.json" with { type: "json" }
import zhCN from "~/locales/zh-CN/aiApiVerification.json" with { type: "json" }
import { MODEL_METADATA_URL } from "~/services/models/modelMetadata/constants"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
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
          const description = panel.getByText(labels.description, {
            exact: true,
          })
          await expect(description).toBeVisible()
          const descriptionBox = (await description.boundingBox())!
          expect(descriptionBox.y).toBeGreaterThan(
            previewBox.y + previewBox.height,
          )
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
        for (const [name, id, description] of [
          [
            resource.verifyDialog.tools.context.title,
            "context",
            resource.verifyDialog.tools.context.hint,
          ],
          [
            resource.verifyDialog.tools.pelican.title,
            "drawing",
            resource.verifyDialog.tools.pelican.description,
          ],
          [labels.title, "needle", labels.description],
        ] as const) {
          const sibling = page.getByRole("region", { name, exact: true })
          await sibling.getByRole("button", { name, exact: true }).click()
          await expect(
            sibling.getByText(description, { exact: true }),
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
