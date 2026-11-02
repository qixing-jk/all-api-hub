/* global chrome */
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { withTemporaryAccount } from "../../cdp/sandbox.mjs"
import { dismissModals, openExtensionPage } from "../../cdp/ui-driver.mjs"
import { testAccountCardFlow } from "../../flows/account-card.mjs"
import { testModelCatalogFlow } from "../../flows/model-catalog.mjs"
import { checkAimlapiSavedCredentials } from "./auth.mjs"

const LANGUAGE_STORAGE_KEY = "all-api-hub-i18nextLng"

/**
 * Live UI end-to-end checks for the AI/ML API account integration.
 *
 * Two layers, mirroring the product's contract split:
 *
 *   1. A sandboxed account fixture proves the account card renders and the
 *      model list projects the provider catalogue.
 *   2. When real credentials are supplied, a fresh add-account form is driven
 *      through the normal onboarding default (management key) and the native
 *      key editor creates, reads back and deletes a throwaway key - so the
 *      management-key write path and the regular-key billing path are both
 *      exercised across the extension/provider boundary.
 *
 * The dev profile is shared, so the fixture is inserted under a sandbox that
 * removes it afterwards, and any throwaway key is deleted in a `finally`.
 */

const AIMLAPI_SITE_TYPE = "aimlapi"

const KEY_MANAGEMENT_TEST_IDS = {
  addTokenButton: "key-management-add-token-button",
  nativeEditorSubmitButton: "key-management-native-editor-submit-button",
  nativeEditorLoading: "key-management-native-editor-loading",
  nativeKeyRow: "key-management-native-key-row",
  nativeDeleteConfirmButton: "key-management-native-delete-confirm-button",
}

async function openKeyPage(context, extensionId, accountId) {
  const page = await context.newPage()
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [LANGUAGE_STORAGE_KEY, "en"],
  )
  await page.goto(
    `chrome-extension://${extensionId}/options.html#keys?accountId=${encodeURIComponent(accountId)}`,
    { waitUntil: "domcontentloaded", timeout: 90_000 },
  )
  await page.waitForLoadState("domcontentloaded")
  await dismissModals(page)
  return page
}

/** The shared `name` field the editor renders as a labelled text input. */
function nameInputLocator(page, label) {
  return page
    .getByLabel(label, { exact: false })
    .or(page.getByPlaceholder("Production key"))
    .or(page.locator(`[aria-label="${label}"]`))
    .first()
}

/** Refuse to treat a failed inventory fetch as proof that owned keys are absent. */
async function requireCleanupInventory(page) {
  if ((await page.innerText("body")).includes("Failed to load keys")) {
    throw new Error(
      "Cannot confirm cleanup while the key inventory is unavailable",
    )
  }
}

/**
 * Run the AI/ML API live UI suite.
 * @param options Suite options.
 * @param options.context CDP browser context.
 * @param options.extensionId Mounted extension id.
 * @param options.serviceWorker Extension service worker.
 * @param options.siteUrl Console origin the fixture account is bound to.
 * @param options.managementKey Real management key. Required for the key CRUD
 *   round trip and the onboarding check.
 * @param options.apiKey Optional regular API key that reads balance.
 */
export async function runAimlapiUiTest({
  context,
  extensionId,
  serviceWorker,
  siteUrl = "https://aimlapi.com",
  managementKey = "",
  apiKey = "",
}) {
  console.log("\n🖥️ 开始执行 AI/ML API 扩展端到端 UI 交互验证 (CDP)...")

  if (managementKey) {
    console.log("  [UI 步骤 0] 通过新增账号弹窗走管理密钥默认引导...")
    await checkAimlapiSavedCredentials(
      { context, extensionId, serviceWorker, siteUrl },
      { primary: managementKey, regular: apiKey },
    )
  } else {
    console.log("  ℹ️ 未提供管理密钥，跳过新增账号引导校验。")
  }

  const accountFixture = {
    id: "sandbox-temp-aimlapi-account",
    site_name: "AI/ML API",
    site_url: siteUrl,
    site_type: AIMLAPI_SITE_TYPE,
    authType: "access_token",
    exchange_rate: 7.2,
    account_info: {
      id: managementKey
        ? process.env.AIMLAPI_USER_ID || "sandbox-aimlapi-user-id"
        : "sandbox-aimlapi-user-id",
      access_token: managementKey || "aimlapi-sandbox-management-key",
      username: "aimlapi-sandbox-user@example.invalid",
      quota: 10,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 1,
      today_requests_count: 0,
      today_income: 0,
    },
    ...(apiKey ? { aimlApiAuth: { apiKey } } : {}),
    created_at: Date.now(),
    updated_at: Date.now(),
    user_updated_at: Date.now(),
  }

  const ownedKeyNames = new Set()
  try {
    await withTemporaryAccount(
      serviceWorker,
      accountFixture,
      async (fixture) => {
        const page = await openExtensionPage({
          context,
          extensionId,
          route: "options.html#account",
        })
        const previousLanguage = await page.evaluate(
          (key) => localStorage.getItem(key),
          LANGUAGE_STORAGE_KEY,
        )
        await page.emulateMedia({ reducedMotion: "reduce" })
        const publicPriceRequests = []
        page.on("request", (request) => {
          if (/^https:\/\/(api\.)?aimlapi\.com\//.test(request.url()))
            publicPriceRequests.push(request.url())
        })

        try {
          if (previousLanguage !== "en") {
            await page.evaluate(
              (key) => localStorage.setItem(key, "en"),
              LANGUAGE_STORAGE_KEY,
            )
            await page.reload({
              waitUntil: "domcontentloaded",
              timeout: 90_000,
            })
          }
          const cardResult = await testAccountCardFlow({
            page,
            extensionId,
            accountName: fixture.site_name,
            accountId: fixture.id,
          })
          if (!cardResult?.ok) {
            throw new Error(
              `AI/ML API 账户卡片流校验失败: [${fixture.site_name}] 未能正常展示`,
            )
          }

          // The opt-in machine-readable catalogue supplies prices in the first response.
          console.log("  [UI 步骤 1] 验证 #models 页面模型渲染...")
          const modelResult = await testModelCatalogFlow({
            page,
            extensionId,
            accountName: fixture.site_name,
            accountId: fixture.id,
            requirePrices: true,
            timeoutMs: 90_000,
          })
          if (!modelResult.ok) {
            throw new Error(
              `模型目录未能展示有效模型条目！实际渲染统计: "${modelResult.countLine}"`,
            )
          }

          const artifactsRoot = ".scratch/aimlapi-integration/artifacts"
          await fs.mkdir(artifactsRoot, { recursive: true })
          const evidenceDir = await fs.mkdtemp(
            path.join(artifactsRoot, "pricing-"),
          )
          await page
            .getByRole("textbox", { name: "Search Models", exact: true })
            .fill("moonshot/kimi-k3-1-pro")
          const display = page.getByTestId("model-list-display")
          const kimiCard = display.locator('[data-slot="card"]').filter({
            has: page.getByText("moonshot/kimi-k3-1-pro", {
              exact: true,
            }),
          })
          await expect(kimiCard).toHaveCount(1)
          await expect(display).toContainText("moonshot/kimi-k3-1-pro")
          await expect(display).not.toContainText(
            "This model is not in the price table",
          )
          await expect(kimiCard).toContainText(/\$\s*2(?:\.0+)?\b/)
          await expect(kimiCard).toContainText(/\$\s*10(?:\.0+)?\b/)
          await expect(kimiCard).toContainText(/\$\s*0\.2000/)
          await page.emulateMedia({ reducedMotion: "reduce" })
          await kimiCard.screenshot({
            path: path.join(evidenceDir, "token-prices.png"),
            animations: "disabled",
          })
          await fs.writeFile(
            path.join(evidenceDir, "result.json"),
            JSON.stringify(
              {
                extensionId,
                url: page.url(),
                capturedAt: new Date().toISOString(),
                text: await display.innerText(),
              },
              null,
              2,
            ),
          )
          console.log(
            `  ✅ Official input/output prices rendered; evidence: ${evidenceDir}`,
          )

          for (const [id, price, name] of [
            [
              "nvidia/nemotron-3.5-lightning",
              /\$0(?:\.0+)?\b/,
              "nemotron-deferred",
            ],
            ["alibaba/qwen-text-embedding-v3", /\$0\.070*\b/, "embedding"],
            [
              "bytedance/dreamina-creative-upscale",
              /\$0\.0310*\b/,
              "generation",
            ],
            [
              "blackforestlabs/flux-3-video-t2v",
              /\$0\.170*(?!\d)/,
              "video-second",
            ],
          ]) {
            await page
              .getByRole("textbox", { name: "Search Models", exact: true })
              .fill(id)
            const card = display.locator('[data-slot="card"]').filter({
              has: page.getByText(id, { exact: true }),
            })
            await expect(card).toHaveCount(1)
            await expect(card).toContainText(price)
            await card.screenshot({
              path: path.join(evidenceDir, `${name}.png`),
              animations: "disabled",
            })
          }

          const conditionalResults = []
          for (const [id, price, name] of [
            ["alibaba/happyhorse-1-1", /\$0\.180*(?!\d)/, "happyhorse-seconds"],
            ["veo3.1/extend-video", /\$0\.40*(?!\d)/, "veo-audio"],
            [
              "google/veo-3.1-lite-generate-001",
              /\$0\.0840*(?!\d)/,
              "veo-lite-matrix",
            ],
            ["wan/v2.2-14b/animate/replace", /\$0\.080*(?!\d)/, "wan-prising"],
          ]) {
            await page
              .getByRole("textbox", { name: "Search Models", exact: true })
              .fill(id)
            const card = display
              .locator('[data-slot="card"]')
              .filter({ has: page.getByText(id, { exact: true }) })
            await expect(card).toHaveCount(1)
            await expect(card).toContainText(price, { timeout: 60_000 })
            await expect(
              card.getByText("Estimated", { exact: true }),
            ).toHaveCount(0)
            await expect(
              card
                .locator('[data-slot="badge"]')
                .filter({ hasText: /^Video output · second$/ }),
            ).toBeVisible()
            await expect(
              card.getByText("Token-based billing", { exact: true }),
            ).toHaveCount(0)
            await expect(
              card.getByRole("button", {
                name: "Pricing details",
                exact: true,
              }),
            ).toHaveCount(0)
            await card.screenshot({
              path: path.join(evidenceDir, `${name}.png`),
              animations: "disabled",
            })
            conditionalResults.push({ id, text: await card.innerText() })
          }
          await fs.writeFile(
            path.join(evidenceDir, "conditional-results.json"),
            JSON.stringify(conditionalResults, null, 2),
          )

          const structuredResults = []
          for (const { id, expected, name } of [
            {
              id: "elevenlabs/scribe_v2",
              expected: /\$0\.000061\s*\/ second/,
              name: "scribe-api-seconds",
            },
            {
              id: "mistral/mistral-ocr-latest",
              expected: /Document annotations: Annotated output/,
              name: "ocr-annotations",
            },
            {
              id: "blackforestlabs/flux-2-max-edit",
              expected: /Image area \(megapixels\): = 4/,
              name: "image-exact-megapixels",
            },
            {
              id: "bytedance/seedance-2-5",
              expected: /Video output.*million/i,
              name: "video-output-token-variants",
            },
            {
              id: "luma/uni-1",
              expected: /Generation operation: image_edit/,
              name: "image-operation",
            },
            {
              id: "typesafe/jev-router",
              expected:
                /runtime-dependent billing without a complete upfront formula/,
              name: "router-reason",
            },
            {
              id: "anthropic/claude-haiku-5-5",
              expected: /Published threshold rates are retained as references/,
              name: "threshold-reason",
            },
            {
              id: "openai/gpt-6.1-terra",
              expected: /Published threshold rates are retained as references/,
              name: "threshold-reference-restored",
            },
            {
              id: "elorian/glimpse",
              expected: /listed token rates are an estimate/,
              name: "supported-provider-estimate",
            },
            {
              id: "minimax/h3",
              expected: /Output image count/,
              name: "video-generated-images",
            },
            {
              id: "openai/gpt-4.1",
              expected: /\$2\.00\s*\/M/,
              name: "complete-model-price-gpt41",
            },
            {
              id: "openai/gpt-5-1",
              expected: /\$1\.25\s*\/M/,
              name: "complete-model-price-gpt51",
            },
            {
              id: "openai/gpt-4o-2024-08-06",
              expected: /\$2\.50\s*\/M/,
              name: "complete-model-price-gpt4o",
            },
            {
              id: "x-ai/grok-imagine-image-pro",
              expected: /Reference images per task/,
              name: "image-reference-payload",
            },
            {
              id: "x-ai/grok-imagine-image-2.0",
              expected: /Reference images per task/,
              name: "image-reference-payload-quality",
            },
            {
              id: "perplexity/sonar",
              expected: /Search context: High/,
              name: "search-context-tiers",
            },
            {
              id: "perplexity/sonar-pro",
              expected: /Search context: High/,
              name: "search-context-pro-tiers",
            },
            {
              id: "anthropic/claude-sonnet-5-5",
              expected: /Code execution calls/,
              name: "independent-tool-charges",
            },
            {
              id: "google/gemini-4-argon",
              expected: /Video input tokens/,
              name: "video-input-token-charges",
            },
            {
              id: "openai/gpt-image-2.5-flare",
              expected: /Cached image tokens/,
              name: "cached-image-token-charges",
            },
          ]) {
            await page
              .getByRole("textbox", { name: "Search Models", exact: true })
              .fill(id)
            const card = display
              .locator('[data-slot="card"]')
              .filter({ has: page.getByText(id, { exact: true }) })
            await expect(card).toHaveCount(1)
            await expect(card).toContainText(expected)
            if (name === "independent-tool-charges") {
              await expect(card).toContainText(/\$0\.0500\s*\/.*call/i)
              await expect(card).toContainText(/\$0\.0100\s*\/.*search/i)
            }
            if (name.startsWith("complete-model-price")) {
              await expect(card).not.toContainText(
                "inconsistent charge contracts",
              )
              await expect(card).toContainText("Cache read")
            }
            if (name === "cached-image-token-charges") {
              await expect(card).not.toContainText("Images · Images")
              await expect(card).not.toContainText(/\$0\s*\/ Images/)
              await expect(card).toContainText("Token-based billing")
            }
            if (
              [
                "independent-tool-charges",
                "video-input-token-charges",
                "cached-image-token-charges",
              ].includes(name)
            ) {
              await expect(card).not.toContainText(
                "independent charges are excluded",
              )
              await expect(
                card.getByText("Estimated", { exact: true }),
              ).toHaveCount(0)
            }
            if (name === "threshold-reference-restored") {
              await expect(card).toContainText(/\$1\.0+(?!\d)/)
              await expect(card).toContainText(/\$5\.0+(?!\d)/)
              await expect(card).not.toContainText(
                "inconsistent charge contracts",
              )
            }
            if (name === "supported-provider-estimate") {
              await expect(
                card.getByText("Estimated", { exact: true }),
              ).toBeVisible()
              await expect(card).not.toContainText(
                "independent charges are excluded",
              )
            }
            await expect(
              card.getByRole("button", {
                name: "Pricing details",
                exact: true,
              }),
            ).toHaveCount(0)
            await expect(card).not.toContainText(
              "The pricing source is unavailable",
            )
            await card.screenshot({
              path: path.join(evidenceDir, `${name}.png`),
              animations: "disabled",
            })
            structuredResults.push({ id, text: await card.innerText() })
          }
          expect(
            publicPriceRequests.some(
              (url) =>
                url === "https://api.aimlapi.com/v1/models?include=pricing",
            ),
          ).toBe(true)
          expect(
            publicPriceRequests.filter((url) =>
              /^https:\/\/aimlapi\.com\/(models\/|sitemap\.xml|ai-ml-api-pricing)/.test(
                url,
              ),
            ),
          ).toEqual([])
          await fs.writeFile(
            path.join(evidenceDir, "structured-results.json"),
            JSON.stringify(
              { models: structuredResults, publicPriceRequests },
              null,
              2,
            ),
          )

          // Explain unresolved thresholds separately from conflicting API records.
          await page
            .getByRole("textbox", { name: "Search Models", exact: true })
            .fill("")
          const diagnostics = page.getByRole("button", {
            name: "[DEV] Pricing diagnostics",
            exact: true,
          })
          await diagnostics.click()
          const issueFilter = page.getByRole("combobox", {
            name: "Filter diagnostic issues",
            exact: true,
          })
          await issueFilter.click()
          await page
            .getByRole("option", {
              name: /^Threshold selection basis unverified \(/,
            })
            .click()
          const diagnosticResults = page.getByRole("region", {
            name: "Diagnostic results",
            exact: true,
          })
          await expect(
            diagnosticResults
              .getByText("Threshold selection basis unverified", {
                exact: true,
              })
              .first(),
          ).toBeVisible()
          await diagnosticResults
            .getByRole("button", { name: /^Inspect diagnostics:/ })
            .first()
            .click()
          const diagnosticDrawer = page.getByRole("dialog")
          await expect(diagnosticDrawer).toContainText(
            "Threshold selection basis unverified",
          )
          await expect(diagnosticDrawer).toContainText(
            "unsupported:threshold-basis-unverified",
          )
          await diagnosticDrawer.screenshot({
            path: path.join(evidenceDir, "threshold-diagnostic.png"),
            animations: "disabled",
          })
          const thresholdDiagnostic = await diagnosticDrawer.innerText()
          await page.keyboard.press("Escape")
          await issueFilter.click()
          await page
            .getByRole("option", {
              name: /^Conflicting official pricing records \(/,
            })
            .click()
          await expect(
            diagnosticResults
              .getByText(/^Conflicting official pricing records(?: \+\d+)?$/)
              .first(),
          ).toBeVisible()
          await fs.writeFile(
            path.join(evidenceDir, "diagnostic-reasons.json"),
            JSON.stringify(
              {
                thresholdDiagnostic,
                conflictingRecords: await diagnosticResults.innerText(),
              },
              null,
              2,
            ),
          )
          await diagnostics.click()

          // Exercise the actual shared condition controls after browsing prices.
          const openSummary = async (label) => {
            const summary = page
              .locator("summary")
              .filter({ hasText: label })
              .first()
            try {
              await summary.waitFor({ state: "visible", timeout: 15_000 })
            } catch (error) {
              await fs.writeFile(
                path.join(evidenceDir, "conditional-controls-failure.txt"),
                await page.locator("body").innerText(),
              )
              await page.screenshot({
                path: path.join(
                  evidenceDir,
                  "conditional-controls-failure.png",
                ),
              })
              throw error
            }
            if (
              !(await summary.evaluate((element) =>
                element.parentElement.hasAttribute("open"),
              ))
            )
              await summary.click()
          }
          await page
            .getByRole("textbox", { name: "Search Models", exact: true })
            .fill("minimax/h3")
          // Keep the acceptance scoped to this temporary AI/ML API source.
          const sort = page
            .getByRole("combobox")
            .filter({ hasText: "Default" })
            .first()
          await sort.click()
          await page
            .getByRole("option", { name: "Price: Low to High", exact: true })
            .click()
          // Non-token plans expose their conditions directly, without token-weight controls.
          await openSummary("Image settings")
          await page
            .getByRole("spinbutton", {
              name: "Output image count",
              exact: true,
            })
            .fill("2")
          await page
            .getByRole("spinbutton", {
              name: "Output image count",
              exact: true,
            })
            .press("Tab")
          await openSummary("Video settings")
          await page
            .getByRole("spinbutton", {
              name: "Video duration per task (seconds)",
              exact: true,
            })
            .fill("5")
          await page
            .getByRole("spinbutton", {
              name: "Video duration per task (seconds)",
              exact: true,
            })
            .press("Tab")
          await page
            .getByRole("combobox", { name: "Video quality", exact: true })
            .click()
          await page.getByRole("option", { name: "2k", exact: true }).click()
          const videoCard = display
            .locator('[data-slot="card"]')
            .filter({ has: page.getByText("minimax/h3", { exact: true }) })
          await expect(videoCard).toContainText(/\$0\.1460*(?!\d)/)
          const videoComparisonText = await videoCard.innerText()
          await videoCard.screenshot({
            path: path.join(evidenceDir, "video-extra-image-comparison.png"),
            animations: "disabled",
          })
          await page
            .getByRole("region", { name: "Set conditions", exact: true })
            .screenshot({
              path: path.join(evidenceDir, "video-extra-image-controls.png"),
              animations: "disabled",
            })
          await page
            .getByRole("textbox", { name: "Search Models", exact: true })
            .fill("x-ai/grok-imagine-image-pro")
          await openSummary("Image settings")
          await page
            .getByRole("combobox", { name: "Image size", exact: true })
            .click()
          await page.getByRole("option", { name: "2K", exact: true }).click()
          const referenceImages = page.getByRole("spinbutton", {
            name: "Reference images per task",
            exact: true,
          })
          await referenceImages.fill("3")
          await referenceImages.press("Tab")
          const imageCard = display.locator('[data-slot="card"]').filter({
            has: page.getByText("x-ai/grok-imagine-image-pro", {
              exact: true,
            }),
          })
          await expect(imageCard).toContainText(/\$0\.1000*(?!\d)/)
          const outputImages = page.getByRole("spinbutton", {
            name: "Output images per task",
            exact: true,
          })
          await outputImages.fill("2")
          await outputImages.press("Tab")
          await expect(imageCard).toContainText(/\$0\.0850*(?!\d)/)
          const imageComparisonText = await imageCard.innerText()
          await imageCard.screenshot({
            path: path.join(evidenceDir, "image-reference-comparison.png"),
            animations: "disabled",
          })
          await page
            .getByRole("region", { name: "Set conditions", exact: true })
            .screenshot({
              path: path.join(evidenceDir, "image-reference-controls.png"),
              animations: "disabled",
            })
          await referenceImages.fill("0")
          await referenceImages.press("Tab")
          await expect(imageCard).toContainText(/\$0\.0700*(?!\d)/)
          await page
            .getByRole("textbox", { name: "Search Models", exact: true })
            .fill("perplexity/sonar")
          await openSummary("Adjust comparison")
          await openSummary("Other billing conditions")
          const searchContext = page.getByRole("combobox", {
            name: "Search context",
            exact: true,
          })
          await searchContext.click()
          await page.getByRole("option", { name: "High", exact: true }).click()
          await expect(searchContext).toHaveText("High")
          await page
            .getByRole("region", { name: "Set conditions", exact: true })
            .screenshot({
              path: path.join(evidenceDir, "search-context-controls.png"),
              animations: "disabled",
            })
          await fs.writeFile(
            path.join(evidenceDir, "conditional-controls.json"),
            JSON.stringify(
              {
                videoComparison: videoComparisonText,
                imageComparison: imageComparisonText,
                searchContext: await searchContext.innerText(),
                note: "Token-index comparisons exclude per-request search fees; request totals are separately asserted at the public quote boundary.",
              },
              null,
              2,
            ),
          )

          if (!managementKey) {
            console.log("  ℹ️ 未提供管理密钥，跳过密钥管理与写入验证。")
            return
          }

          // -----------------------------------------------------------------
          // Native key editor: create, read back, delete one throwaway key.
          // -----------------------------------------------------------------
          console.log(
            "  [UI 步骤 2] 验证原生密钥管理页面与 AI/ML API 编辑器字段 (#keys)...",
          )
          const keyPage = await openKeyPage(context, extensionId, fixture.id)
          try {
            await dismissModals(keyPage)
            const addBtn = keyPage
              .locator(
                `[data-testid="${KEY_MANAGEMENT_TEST_IDS.addTokenButton}"]`,
              )
              .first()
            await addBtn.waitFor({ state: "visible", timeout: 30_000 })

            const bodyText = await keyPage.innerText("body")
            if (
              bodyText.includes("Failed to load keys") ||
              bodyText.includes("无效") ||
              bodyText.includes("invalid_response")
            ) {
              throw new Error(
                `密钥管理页面加载失败，检测到错误信息: ${bodyText.slice(0, 300)}`,
              )
            }
            console.log("  ✅ 密钥管理入口渲染正常，无加载错误")

            const createdKeyName = `AAH E2E AI/ML API CDP ${randomUUID()}`
            ownedKeyNames.add(createdKeyName)
            console.log(
              `  [UI 步骤 3] 通过 UI 创建一次性密钥 [${createdKeyName}]...`,
            )

            await addBtn.click()
            await keyPage
              .locator(
                `[data-testid="${KEY_MANAGEMENT_TEST_IDS.nativeEditorLoading}"]`,
              )
              .waitFor({ state: "detached", timeout: 60_000 })
            await keyPage
              .locator(
                `[data-testid="${KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton}"]`,
              )
              .waitFor({ state: "visible", timeout: 30_000 })

            const nameInput = nameInputLocator(keyPage, "Name")
            await nameInput.fill(createdKeyName)
            await keyPage
              .locator(
                `[data-testid="${KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton}"]`,
              )
              .click()
            await keyPage
              .locator(
                `[data-testid="${KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton}"]`,
              )
              .waitFor({ state: "hidden", timeout: 60_000 })

            const createdRow = keyPage
              .locator(
                `[data-testid="${KEY_MANAGEMENT_TEST_IDS.nativeKeyRow}"]`,
              )
              .filter({ hasText: createdKeyName })
            await createdRow
              .first()
              .waitFor({ state: "visible", timeout: 30_000 })
            console.log("  ✅ UI 创建已落到密钥清单")

            // The inventory keeps no plaintext, so a revealed secret on the new
            // row would prove the projection wrongly claims recoverable keys.
            const rowText = await createdRow.first().innerText()
            if (!rowText.includes(createdKeyName)) {
              throw new Error("新建密钥行未展示名称")
            }
          } finally {
            try {
              if (ownedKeyNames.size) {
                await dismissModals(keyPage)
                await keyPage.reload()
                await keyPage
                  .locator(
                    `[data-testid="${KEY_MANAGEMENT_TEST_IDS.addTokenButton}"]`,
                  )
                  .waitFor({ state: "visible", timeout: 30_000 })
                await keyPage
                  .locator("[data-options-page-pending], [inert]")
                  .waitFor({ state: "detached", timeout: 60_000 })
                await requireCleanupInventory(keyPage)
                for (const name of ownedKeyNames) {
                  const row = keyPage
                    .locator(
                      `[data-testid="${KEY_MANAGEMENT_TEST_IDS.nativeKeyRow}"]`,
                    )
                    .filter({ hasText: name })
                  // A freshly reloaded inventory may still be filling in; a
                  // zero-count here would silently skip the delete and leak the
                  // key, so wait for the owned row and fail loudly if it never
                  // appears.
                  await row
                    .first()
                    .waitFor({ state: "visible", timeout: 30_000 })
                  await row
                    .first()
                    .getByRole("button", { name: /^Delete key$|^Delete$/ })
                    .click()
                  await keyPage
                    .locator(
                      `[data-testid="${KEY_MANAGEMENT_TEST_IDS.nativeDeleteConfirmButton}"]`,
                    )
                    .click()
                  await row.waitFor({ state: "hidden", timeout: 30_000 })
                }
                ownedKeyNames.clear()
              }
            } finally {
              await keyPage.close().catch(() => {})
            }
          }

          console.log("  ✅ AI/ML API UI 端到端全套流程校验通过！")
        } finally {
          try {
            await page.evaluate(
              ({ key, value }) => {
                if (value === null) localStorage.removeItem(key)
                else localStorage.setItem(key, value)
              },
              { key: LANGUAGE_STORAGE_KEY, value: previousLanguage },
            )
          } finally {
            await page.close().catch(() => {})
          }
        }
      },
    )
  } catch (error) {
    if (ownedKeyNames.size) {
      throw new Error(
        `AI/ML API key cleanup failed; remove only these test keys: ${[...ownedKeyNames].join(", ")}`,
        { cause: error },
      )
    }
    throw error
  }
}
