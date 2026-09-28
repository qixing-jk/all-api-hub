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
    await testAutoDetectFlow({
      page,
      targetUrl,
      expectedType: "Rix",
    })

    // -------------------------------------------------------------
    // UI 测试 2: 装配通用模型目录流 (结合安全沙盒)
    // -------------------------------------------------------------
    const existingAccounts = await getAccounts(serviceWorker)
    const matchedAccount = existingAccounts.find(
      (a) =>
        a.site_type === "Rix-Api" ||
        (a.site_url &&
          (a.site_url.includes("ephone") || a.site_url.includes("88996"))),
    )

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

    const targetAccountName = testFixture.site_name

    // 无论是否注入临时账号，均通过沙盒保证测试后状态完全复原
    await withTemporaryAccount(serviceWorker, testFixture, async () => {
      await testModelCatalogFlow({
        page,
        extensionId,
        accountName: targetAccountName,
      })
    })

    console.log("  ✅ Rix UI 端到端交互实测全部完成，沙盒现场已安全复原。")
  } finally {
    await page.close().catch(() => {})
  }
}
