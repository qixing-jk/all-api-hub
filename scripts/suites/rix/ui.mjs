import { getAccounts, withTemporaryAccount } from "../../cdp/sandbox.mjs"
import { openExtensionPage } from "../../cdp/ui-driver.mjs"
import { testAutoDetectFlow } from "../../flows/auto-detect.mjs"
import { testModelCatalogFlow } from "../../flows/model-catalog.mjs"

/**
 * Execute UI end-to-end tests for Rix-Api against the live Options UI.
 */
export async function runRixUiTest({
  context,
  extensionId,
  serviceWorker,
  targetUrl,
}) {
  console.log("\n🖥️ 开始执行 Rix API 扩展端到端 UI 交互验证 (装配通用流程)...")

  const page = await openExtensionPage({
    context,
    extensionId,
    route: "options.html#account",
  })

  try {
    // -------------------------------------------------------------
    // UI 测试 1: 装配通用自动识别流
    // -------------------------------------------------------------
    const autoDetectResult = await testAutoDetectFlow({
      page,
      targetUrl,
      expectedType: "Rix",
    })
    if (!autoDetectResult?.ok) {
      throw new Error(`Rix 自动识别流失败: 站点 [${targetUrl}] 未能识别为 Rix`)
    }

    // -------------------------------------------------------------
    // UI 测试 2: 装配通用模型目录流 (结合安全沙盒)
    // -------------------------------------------------------------
    const targetOrigin = new URL(targetUrl).origin
    const existingAccounts = await getAccounts(serviceWorker)
    const matchedAccount = existingAccounts.find((a) => {
      if (a.site_type !== "Rix-Api" || !a.site_url) return false
      try {
        return new URL(a.site_url).origin === targetOrigin
      } catch {
        return false
      }
    })

    const testFixture = matchedAccount || {
      id: "sandbox-temp-rix-account",
      site_name: "Rix-Live-Sandbox",
      site_url: targetUrl,
      site_type: "Rix-Api",
      balance: 10.0,
      active_balance: 10.0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // 无论是否注入临时账号，均通过沙盒保证测试后状态完全复原
    let modelCatalogResult
    await withTemporaryAccount(serviceWorker, testFixture, async (fixture) => {
      modelCatalogResult = await testModelCatalogFlow({
        page,
        extensionId,
        accountName: fixture.site_name,
        accountId: fixture.id,
      })
    })
    if (!modelCatalogResult?.ok) {
      throw new Error(
        `Rix 模型目录流校验失败: [${testFixture.site_name}] 未能渲染模型或模型数为 0`,
      )
    }

    console.log("  ✅ Rix UI 端到端交互实测全部完成，沙盒现场已安全复原。")
  } finally {
    await page.close().catch(() => {})
  }
}
