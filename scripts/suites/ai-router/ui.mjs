import { expect } from "@playwright/test"

import { MODEL_LIST_TEST_IDS } from "../../../src/features/ModelList/testIds.ts"
import { withTemporaryAccount } from "../../cdp/sandbox.mjs"
import { dismissModals, openExtensionPage } from "../../cdp/ui-driver.mjs"
import { testAccountCardFlow } from "../../flows/account-card.mjs"

/**
 * Execute UI end-to-end tests for AI-Router against the live Options UI.
 */
export async function runAiRouterUiTest({
  context,
  extensionId,
  serviceWorker,
  token = "mock-ai-router-token",
}) {
  console.log(
    "\n🖥️ 开始执行 AI-Router 扩展端到端 UI 渲染验证 (装配通用流程)...",
  )

  const accountFixture = {
    id: "sandbox-temp-ai-router",
    site_name: "AI-ROUTER",
    site_url: "https://ai-router.dev",
    site_type: "sub2api",
    exchange_rate: 7.2,
    auth_token: token,
    account_info: {
      id: "live-test-user",
      access_token: token,
      email: "user@example.com",
      username: "ai-router-user",
    },
    balance: 5.0,
    active_balance: 5.0,
    checkInMethod: "automatic",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // 必须通过沙盒高阶函数保证测完绝对清理，不污染本地 profile
  await withTemporaryAccount(
    serviceWorker,
    accountFixture,
    async (accountFixture) => {
      const page = await openExtensionPage({
        context,
        extensionId,
        route: "options.html#account",
      })

      try {
        // 1. 装配通用账户卡片展示流
        const cardResult = await testAccountCardFlow({
          page,
          extensionId,
          accountName: accountFixture.site_name,
          accountId: accountFixture.id,
        })
        if (!cardResult?.ok) {
          throw new Error(
            `AI-Router 账户卡片流校验失败: [${accountFixture.site_name}] 未能正常渲染`,
          )
        }

        // 2. 验证 #models 页面渲染
        console.log("  [UI 步骤 2] 验证 #models 页面渲染...")
        await page.goto(
          `chrome-extension://${extensionId}/options.html#models?accountId=${encodeURIComponent(accountFixture.id)}`,
        )
        await page.waitForLoadState("domcontentloaded")
        await dismissModals(page)

        const modelsRoot = page.getByTestId(MODEL_LIST_TEST_IDS.page)
        await expect(modelsRoot).toBeVisible({ timeout: 5000 })
        await expect(modelsRoot).toHaveAttribute(
          "data-model-source",
          `account:${accountFixture.id}`,
          { timeout: 5000 },
        )
        console.log(
          "  ✅ AI-Router 账号卡片与指定来源页面 smoke 通过；未验证自动接入、模型数据或价格。",
        )
      } finally {
        await page.close().catch(() => {})
      }
    },
  )
}
