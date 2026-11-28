import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { runScenarioWithCleanup } from "../../../e2e/utils/scenarioErrors.ts"
import { MODEL_LIST_TEST_IDS } from "../../../src/features/ModelList/testIds.ts"
import { PMPLAN_WEB_ORIGIN } from "../../../src/services/accountSiteDefinitions/identifiers.ts"
import { getAccounts } from "../../cdp/sandbox.mjs"
import {
  configureExtensionPage,
  createUiCapture,
} from "../../cdp/ui-driver.mjs"
import { readModelCatalog } from "../../flows/model-catalog.mjs"
import { requirePmplanAccount } from "./accountScope.mjs"

/** Compare each rate in its own field so equal rates cannot conceal a wrong output. */
export async function assertPmplanModelPrices(
  modelDisplay,
  model,
  timeout = 30000,
) {
  const expected = (value) => {
    if (value === 0) return "$0/M"
    const price = value / 1000000
    return `$${price.toFixed(price < 0.01 ? 6 : price < 1 ? 4 : 2)}/M`
  }
  const card = modelDisplay.locator('[data-slot="card"]').filter({
    has: modelDisplay
      .page()
      .getByRole("heading", { name: model.name, exact: true }),
  })
  await expect(card).toHaveCount(1, { timeout })
  await expect(card.getByText(/^(Input|输入)$/).locator("..")).toContainText(
    expected(model.input_micro),
    { timeout },
  )
  await expect(card.getByText(/^(Output|输出)$/).locator("..")).toContainText(
    expected(model.output_micro),
    { timeout },
  )
}

/** Read-only price acceptance against an existing saved account; no inference or key writes. */
export async function runPmplanPricing({
  context,
  serviceWorker,
  extensionId,
  evidenceDir,
}) {
  await fs.mkdir(evidenceDir, { recursive: true })
  let site, ui, capture
  const report = {
    ok: false,
    screenshots: [],
    capturedAt: new Date().toISOString(),
    extensionId,
  }

  return runScenarioWithCleanup({
    run: async () => {
      ui = await context.newPage()
      site = await context.newPage()
      capture = createUiCapture({
        page: ui,
        directory: evidenceDir,
        screenshots: report.screenshots,
        bringToFront: true,
        timeoutMs: 30000,
      })
      await site.goto(`${PMPLAN_WEB_ORIGIN}/`, {
        waitUntil: "domcontentloaded",
      })
      const native = await site.evaluate(async () => {
        const read = async (endpoint) => {
          const r = await fetch(endpoint, {
            cache: "no-store",
            signal: AbortSignal.timeout(30000),
          })
          if (!r.ok) throw Error(`${endpoint}: ${r.status}`)
          return r.json()
        }
        const me = await read("/api/me")
        return {
          userId: String(me.user.id),
          square: await read("/api/model-square"),
          eligible: await read("/api/models"),
        }
      })
      const account = requirePmplanAccount(
        await getAccounts(serviceWorker),
        native.userId,
      )
      const free = native.eligible.models.find(
        (m) => m.input_micro === 0 && m.output_micro === 0,
      )
      const paid = native.eligible.models.find(
        (m) => m.input_micro > 0 && m.output_micro > 0,
      )
      const restricted = native.square.models.find(
        (m) => !native.eligible.models.some((e) => e.name === m.name),
      )
      if (!free || !paid || !restricted) {
        const reason =
          "Live fixture requires zero, nonzero and restricted models"
        Object.assign(report, { skipped: true, reason })
        return { skipped: true, reason }
      }
      report.native = {
        plan: native.eligible.plan,
        total: native.square.total,
        eligible: native.eligible.models.length,
        free,
        paid,
        restricted,
      }
      await configureExtensionPage(ui, {
        language: "zh-CN",
        viewport: { width: 1440, height: 1000 },
        dismissUpdateLog: true,
      })
      await ui.emulateMedia({ reducedMotion: "reduce" })
      await ui.bringToFront()
      await ui.goto(
        `chrome-extension://${extensionId}/options.html#models?accountId=${encodeURIComponent(account.id)}`,
        { waitUntil: "domcontentloaded", timeout: 120000 },
      )
      await ui
        .getByRole("button", { name: /^(Refresh Data|刷新数据)$/ })
        .click({ timeout: 120000 })
      await expect(
        ui.getByRole("button", { name: /^(Refresh Data|刷新数据)$/ }),
      ).toBeEnabled({ timeout: 120000 })
      const { modelDisplay } = await readModelCatalog({
        page: ui,
        accountId: account.id,
        timeoutMs: 120000,
      })
      const search = ui.getByRole("textbox", {
        name: /^(搜索模型|Search Models)$/i,
      })
      const minimum = /^(Lowest channel price|渠道最低价)$/
      const verifyPriceEvidence = async (model) => {
        if (model.channel_count === 1) {
          await expect(modelDisplay.getByText(minimum)).toHaveCount(0)
          await expect(
            modelDisplay.getByText(/^(Estimated price|估算价格)$/),
          ).toHaveCount(0)
        } else {
          await expect(modelDisplay.getByText(minimum).first()).toBeVisible()
        }
      }
      const verify = async (model, available) => {
        await search.fill(model.name)
        await expect(
          modelDisplay.getByRole("heading", { name: model.name, exact: true }),
        ).toBeVisible()
        await verifyPriceEvidence(model)
        await expect(modelDisplay).toContainText(/Available plans|开放档位/)
        const tiers = native.square.models.find(
          (m) => m.name === model.name,
        ).tiers
        if (tiers.includes(native.square.plan)) {
          const label =
            native.square.plan[0].toUpperCase() + native.square.plan.slice(1)
          await expect(
            modelDisplay.getByText(`${label} · 当前`, { exact: true }),
          ).toBeVisible()
        } else {
          await expect(
            modelDisplay.getByText(/ · (当前|Current)$/),
          ).toHaveCount(0)
        }
        await expect(modelDisplay).not.toContainText(
          /Site description:|站点说明：/,
        )
        await assertPmplanModelPrices(modelDisplay, model)
        if (!available)
          await expect(modelDisplay).toContainText(/不可用|Unavailable/)
      }
      await verify(free, true)
      await ui.mouse.move(0, 0)
      await capture("pricing-zero.png", modelDisplay)
      await verify(paid, true)
      await capture("pricing-nonzero.png", modelDisplay)
      await modelDisplay
        .getByTestId(MODEL_LIST_TEST_IDS.modelExpandButton)
        .first()
        .click()
      if (paid.channel_count !== 1) {
        await expect(modelDisplay).toContainText(
          /当前套餐可用渠道|channels available to your plan/,
        )
      } else {
        await expect(modelDisplay).not.toContainText(
          /最低价分别计算|Input and output minima/,
        )
      }
      await capture("pricing-details.png", modelDisplay)
      await verify(restricted, false)
      await ui.mouse.move(0, 0)
      await capture("pricing-restricted.png", modelDisplay)
      await verify(paid, true)
      await ui
        .getByRole("combobox")
        .filter({ hasText: /^(Default Order|默认顺序)$/ })
        .click()
      await ui
        .getByRole("option", { name: /^(价格从低到高|Price: Low to High)$/ })
        .click()
      await verifyPriceEvidence(paid)
      await expect(modelDisplay).not.toContainText(
        /没有有效价格|No valid price|无法报价/,
      )
      await expect(modelDisplay).toContainText(/\$\d/)
      await expect(modelDisplay).toContainText(/预估综合单价|Estimated.*price/i)
      report.sortedQuote = await modelDisplay.innerText()
      await ui.mouse.move(0, 0)
      await capture("pricing-sorted.png", modelDisplay)
      await ui
        .getByRole("combobox")
        .filter({ hasText: /^(价格从低到高|Price: Low to High)$/ })
        .click()
      await ui
        .getByRole("option", { name: /^(Default Order|默认顺序)$/ })
        .click()
      await ui.setViewportSize({ width: 640, height: 900 })
      await capture("pricing-narrow.png", modelDisplay)
      await ui.setViewportSize({ width: 1440, height: 1000 })
      await search.fill("")
      await ui.mouse.move(0, 0)
      await capture("pricing-overview.png", ui)
      report.ok = true
      return report
    },
    finalizers: [
      () =>
        fs.writeFile(
          path.join(evidenceDir, "pricing-report.json"),
          JSON.stringify(report, null, 2),
        ),
      () => ui?.close(),
      () => site?.close(),
    ],
    cleanupMessage: "PM-Plan pricing tab cleanup failed",
    failureMessage: "PM-Plan pricing acceptance failed",
  })
}
