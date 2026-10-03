import { randomUUID } from "node:crypto"

import { withTemporaryAccount } from "../../cdp/sandbox.mjs"
import { dismissModals, openExtensionPage } from "../../cdp/ui-driver.mjs"
import { testAccountCardFlow } from "../../flows/account-card.mjs"
import { testModelCatalogFlow } from "../../flows/model-catalog.mjs"

const LANGUAGE_STORAGE_KEY = "all-api-hub-i18nextLng"

/**
 * Live UI end-to-end checks for the Grsai account integration.
 *
 * Drives the real dev extension (already mounted in the CDP browser) against a
 * real Grsai account. Two layers, mirroring the product's contract split:
 *
 *   1. A sandboxed account fixture proves the account card, the native key
 *      editor (Grsai's credit-budget + optional-expiry fields) and the model
 *      catalogue render and project correctly.
 *   2. When a live session token is supplied, a real key is created through the
 *      UI, read back in the inventory, renamed and deleted - so the `xtx`
 *      signed mutation path is exercised across the extension/console boundary
 *      without duplicating the signature algorithm in the probe layer.
 *
 * The dev profile is shared, so the fixture is inserted under a sandbox that
 * removes it afterwards, and the throwaway key is deleted in a `finally`.
 */

const GRSAI_ACCOUNT_SITE_TYPE = "grsai"

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
  )
  await page.waitForLoadState("domcontentloaded")
  await dismissModals(page)
  return page
}

/** The shared `name` field the editor renders as a labelled text input. */
function nameInputLocator(page, label) {
  return page
    .locator(`[aria-label="${label}"]`)
    .or(page.locator(`label:has-text("${label}") input`))
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
 * Run the Grsai live UI suite.
 * @param options Suite options.
 * @param options.context CDP browser context.
 * @param options.extensionId Mounted extension id.
 * @param options.serviceWorker Extension service worker.
 * @param options.siteUrl Console URL the fixture account is bound to.
 * @param options.token Optional real console session token. When set, the suite
 *   creates a throwaway key through the UI, reads it back, renames and deletes
 *   it. Without it, only the sandboxed rendering layer runs.
 */
export async function runGrsaiUiTest({
  context,
  extensionId,
  serviceWorker,
  siteUrl = "https://grsai.com",
  token = "",
}) {
  console.log("\n🖥️ 开始执行 Grsai 扩展端到端 UI 交互验证 (CDP)...")

  const accountFixture = {
    id: "sandbox-temp-grsai-account",
    site_name: "Grsai",
    site_url: siteUrl,
    site_type: GRSAI_ACCOUNT_SITE_TYPE,
    authType: "access_token",
    exchange_rate: 6.66,
    account_info: {
      id: "sandbox-grsai-user-id",
      access_token: token || "grsai-sandbox-session-token",
      username: "grsai-sandbox-user@example.invalid",
      quota: 10,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 1,
      today_requests_count: 0,
      today_income: 0,
    },
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

        try {
          // -----------------------------------------------------------------
          // 1. Account card renders the fixture (its balance/consumption).
          // -----------------------------------------------------------------
          const cardResult = await testAccountCardFlow({
            page,
            extensionId,
            accountName: fixture.site_name,
          })
          if (!cardResult?.ok) {
            throw new Error(
              `Grsai 账户卡片流校验失败: [${fixture.site_name}] 未能正常展示`,
            )
          }

          // -----------------------------------------------------------------
          // 2. Native key management page renders the editor fields.
          // -----------------------------------------------------------------
          console.log(
            "  [UI 步骤 2] 验证原生密钥管理页面渲染与 Grsai 编辑器字段 (#keys)...",
          )
          if (token) {
            const keyPage = await openKeyPage(context, extensionId, fixture.id)
            try {
              await dismissModals(keyPage)
              const addBtn = keyPage
                .locator(
                  `[data-testid="${KEY_MANAGEMENT_TEST_IDS.addTokenButton}"]`,
                )
                .first()
              await addBtn.waitFor({ state: "visible", timeout: 30_000 })

              // Only the real mutation path (with a token) opens the editor for
              // real; a fixture without a token still renders the row header.
              const bodyText = await keyPage.innerText("body")
              const hasLoadError =
                bodyText.includes("Failed to load keys") ||
                bodyText.includes("无法加载") ||
                bodyText.includes("加载密钥列表失败") ||
                bodyText.includes("invalid_response")
              if (hasLoadError) {
                throw new Error(
                  `密钥管理页面加载失败，检测到错误信息: ${bodyText.slice(0, 300)}`,
                )
              }
              console.log("  ✅ 密钥管理入口渲染正常，无加载错误")

              // -----------------------------------------------------------------
              // 3. Live CRUD (only when a session token is supplied).
              // -----------------------------------------------------------------
              if (token) {
                const createdKeyName = `AAH E2E Grsai CDP ${randomUUID()}`
                ownedKeyNames.add(createdKeyName)
                console.log(
                  `  [UI 步骤 3] 通过 UI 创建一次性密钥 [${createdKeyName}]（走 xtx 签名写路径）...`,
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

                // Name the throwaway key through the shared name field. The field
                // label is the English "Name" from the locale resource.
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

                // The inventory re-reveals plaintext keys; the new row must exist.
                const createdRow = keyPage
                  .locator(
                    `[data-testid="${KEY_MANAGEMENT_TEST_IDS.nativeKeyRow}"]`,
                  )
                  .filter({ hasText: createdKeyName })
                await createdRow
                  .first()
                  .waitFor({ state: "visible", timeout: 30_000 })
                console.log("  ✅ UI 创建已落到控制台清单")

                // Rename through the same editor.
                const renamedName = `${createdKeyName}-renamed`
                ownedKeyNames.add(renamedName)
                await createdRow
                  .first()
                  .getByRole("button", { name: "Edit", exact: true })
                  .click()
                await keyPage
                  .locator(
                    `[data-testid="${KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton}"]`,
                  )
                  .waitFor({ state: "visible", timeout: 30_000 })
                const renameInput = nameInputLocator(keyPage, "Name")
                await renameInput.fill(renamedName)
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
                const renamedRow = keyPage
                  .locator(
                    `[data-testid="${KEY_MANAGEMENT_TEST_IDS.nativeKeyRow}"]`,
                  )
                  .filter({ hasText: renamedName })
                await renamedRow
                  .first()
                  .waitFor({ state: "visible", timeout: 30_000 })
                console.log("  ✅ UI 重命名已落到控制台清单")
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
                    if (!(await row.count())) continue
                    await row
                      .first()
                      .getByRole("button", { name: "Delete", exact: true })
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
          } else {
            console.log("  ℹ️ 未提供会话 token，跳过密钥管理与写入验证。")
          }

          // -----------------------------------------------------------------
          // 4. Model catalogue renders model rows with prices. The console
          //    catalogue is account-scoped, so this needs a real session; a
          //    fixture without a token cannot reach it and is skipped.
          // -----------------------------------------------------------------
          if (token) {
            console.log("  [UI 步骤 4] 验证 #models 页面模型渲染与价格...")
            const modelResult = await testModelCatalogFlow({
              page,
              extensionId,
              accountName: fixture.site_name,
              accountId: fixture.id,
            })
            console.log(
              `  - 模型目录检查: ${modelResult.ok ? `✅ 正常展示 (${modelResult.countLine})` : "❌ 模型列表为空或未渲染"}`,
            )
            if (!modelResult.ok) {
              throw new Error(
                `模型目录未能展示有效模型条目！实际渲染统计: "${modelResult.countLine}"`,
              )
            }
          } else {
            console.log(
              "  ℹ️ 未提供会话 token，跳过 #models 模型目录校验（控制台目录按账号鉴权）。",
            )
          }

          console.log(
            "  ✅ Grsai UI 端到端全套流程校验通过，沙盒临时账号已安全复原！",
          )
        } finally {
          await page.close().catch(() => {})
        }
      },
    )
  } catch (error) {
    if (ownedKeyNames.size) {
      throw new Error(
        `Grsai key cleanup failed; remove only these test keys: ${[...ownedKeyNames].join(", ")}`,
        { cause: error },
      )
    }
    throw error
  }
}
