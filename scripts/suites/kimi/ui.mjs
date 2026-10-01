/* global chrome */
import { withTemporaryAccount } from "../../cdp/sandbox.mjs"
import { dismissModals, openExtensionPage } from "../../cdp/ui-driver.mjs"
import { testAccountCardFlow } from "../../flows/account-card.mjs"
import { testModelCatalogFlow } from "../../flows/model-catalog.mjs"

/**
 * Execute UI end-to-end tests for Kimi Open Platform against the live Options UI.
 */
export async function runKimiUiTest({
  context,
  extensionId,
  serviceWorker,
  token = "",
  refreshToken = "",
  organizationId = "",
  siteUrl = "https://platform.kimi.ai",
  siteType = "kimi-global",
}) {
  console.log("\n🖥️ 开始执行 Kimi 开放平台端到端 UI 自动化全功能验证 (CDP)...")

  // 清理更新日志弹窗状态，避免自动化测试期间遮挡交互
  if (serviceWorker) {
    await serviceWorker
      .evaluate(() => {
        return new Promise((resolve) => {
          chrome.storage.local.set(
            { changelogOnUpdate_pendingVersion: null },
            resolve,
          )
        })
      })
      .catch(() => {})
  }

  // =========================================================================
  // 1. 验证真实自动识别流程 (Auto-Detect Flow)
  // =========================================================================
  console.log(
    "\n  [UI 阶段 1: 自动识别] 校验【添加账号】对 Kimi 开放平台的自动探测与 7.2 汇率回填...",
  )

  // 确保在浏览器中预开一个已登录的 Kimi 页面供 content script 提取 Token
  let kimiTab = null
  try {
    kimiTab = await context.newPage()
    await kimiTab
      .goto(`${siteUrl}/console/account`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      })
      .catch(() => {})
    await kimiTab.waitForTimeout(2000)

    const optPage = await openExtensionPage({
      context,
      extensionId,
      route: "options.html#account",
    })

    try {
      // 触发添加账号弹窗
      const addBtn = optPage.locator(
        '[data-testid="account-management-add-account-button"]',
      )
      await addBtn.waitFor({ state: "visible", timeout: 8000 })
      await addBtn.click()
      await optPage.waitForTimeout(800)

      // 输入网址
      const urlInput = optPage.locator(
        '[data-testid="account-management-site-url-input"]',
      )
      await urlInput.waitFor({ state: "visible", timeout: 5000 })
      await urlInput.fill(siteUrl)
      await optPage.waitForTimeout(500)

      // 点击自动识别
      const autoDetectBtn = optPage.locator(
        '[data-testid="account-management-auto-detect-button"]',
      )
      await autoDetectBtn.click()
      console.log("  - 已点击自动识别，等待会话提取与账号补全...")

      // 等待识别结果填充
      await optPage.waitForTimeout(6000)

      // 校验识别结果
      const siteTypeTrigger = optPage.locator(
        '[data-testid="account-management-site-type-trigger"]',
      )
      const detectedType = (await siteTypeTrigger
        .isVisible()
        .catch(() => false))
        ? await siteTypeTrigger.innerText()
        : ""

      const usernameInput = optPage.locator(
        '[data-testid="account-management-username-input"]',
      )
      const detectedUsername = (await usernameInput
        .isVisible()
        .catch(() => false))
        ? await usernameInput.inputValue()
        : ""

      // 汇率 input (查找 number 类型的 input[value="7.2"])
      const numberInputs = await optPage
        .locator('input[type="number"]')
        .evaluateAll((els) => els.map((e) => e.value))
      const hasDefaultRate = numberInputs.includes("7.2")
      const hasKimiSiteType = /kimi/i.test(detectedType)

      console.log("  - 自动识别断言检查:", {
        站点类型匹配: hasKimiSiteType
          ? `✅ [${detectedType.trim()}]`
          : `❌ [${detectedType}]`,
        用户名获取: detectedUsername
          ? `✅ [${detectedUsername}]`
          : "❌ 未能提取",
        默认汇率7点2: hasDefaultRate ? "✅ 7.2" : "❌ 未找到 7.2",
      })

      if (!hasKimiSiteType || !hasDefaultRate) {
        throw new Error(
          `自动识别未达到预期: 站点类型=[${detectedType}], 汇率包含7.2=[${hasDefaultRate}]`,
        )
      }

      // 关闭弹窗
      const cancelBtn = optPage
        .locator('[role="dialog"] button')
        .filter({ hasText: /取消|Cancel|关闭|Close/i })
        .first()
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click().catch(() => {})
      }
    } finally {
      await optPage.close().catch(() => {})
    }
  } finally {
    if (kimiTab) {
      await kimiTab.close().catch(() => {})
    }
  }

  // =========================================================================
  // 2. 验证沙盒账号生命周期 (卡片展示、原生密钥管理、模型列表)
  // =========================================================================
  console.log(
    "\n  [UI 阶段 2: 沙盒账号] 挂载临时 Kimi 账号，验证卡片、密钥管理与模型目录...",
  )

  const accountFixture = {
    id: "sandbox-temp-kimi-account",
    site_name: siteType === "kimi" ? "Kimi" : "Kimi Global",
    site_url: siteUrl,
    site_type: siteType,
    exchange_rate: 7.2,
    auth_token: token,
    account_info: {
      id: "sandbox-kimi-user-id",
      access_token: token,
      username: "kimi-sandbox-user",
    },
    balance: 88.88,
    active_balance: 88.88,
    kimiOpenPlatformAuth: {
      refreshToken,
      organizationId,
      tokenExpiresAt: Date.now() + 3600 * 1000,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  await withTemporaryAccount(serviceWorker, accountFixture, async () => {
    const page = await openExtensionPage({
      context,
      extensionId,
      route: "options.html#account",
    })

    try {
      // 2.1 账户卡片展示流
      const cardResult = await testAccountCardFlow({
        page,
        extensionId,
        accountName: accountFixture.site_name,
      })
      if (!cardResult?.ok) {
        throw new Error(
          `Kimi 账户卡片流校验失败: [${accountFixture.site_name}] 未能正常展示`,
        )
      }

      // 2.2 原生密钥管理页面渲染 (#keys?accountId=...)
      console.log("  [UI 步骤 2.2] 验证原生密钥管理页面渲染 (#keys)...")
      await page.goto(
        `chrome-extension://${extensionId}/options.html#keys?accountId=${accountFixture.id}`,
      )
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(2000)
      await dismissModals(page)

      const keyPageText = await page.innerText("body")
      const hasKeyLoadError =
        keyPageText.includes("无法加载作用域") ||
        keyPageText.includes("加载密钥列表失败") ||
        keyPageText.includes("missing_kimi_organization")
      if (hasKeyLoadError) {
        throw new Error(
          `密钥管理页面加载失败，检测到错误信息: ${keyPageText.slice(0, 300)}`,
        )
      }

      const addKeyBtn = page
        .locator(
          '[data-testid="key-management-add-token-button"], button:has-text("添加 Key"), button:has-text("创建 Key")',
        )
        .first()
      const isKeyPageReady = await addKeyBtn
        .isVisible({ timeout: 6000 })
        .catch(() => false)

      console.log(
        `  - 密钥管理交互入口渲染: ${isKeyPageReady ? "✅ 正常 (创建按钮可见且无错误)" : "❌ 未找到创建按钮"}`,
      )
      if (!isKeyPageReady) {
        throw new Error("密钥管理入口未能在规定时间内渲染！")
      }

      // 2.3 模型目录 (#models)
      console.log("  [UI 步骤 2.3] 验证 #models 页面数据源切换与模型渲染...")
      const modelResult = await testModelCatalogFlow({
        page,
        extensionId,
        accountName: accountFixture.site_name,
        accountId: accountFixture.id,
      })

      console.log(
        `  - 模型目录检查: ${modelResult.ok ? `✅ 正常展示 (${modelResult.countLine})` : "❌ 模型列表为空或未渲染"}`,
      )
      if (!modelResult.ok) {
        throw new Error(
          `模型目录未能展示有效模型条目！实际渲染统计: "${modelResult.countLine}"`,
        )
      }

      console.log(
        "  ✅ Kimi UI 端到端全套流程校验通过，沙盒临时账号已安全复原！",
      )
    } finally {
      await page.close().catch(() => {})
    }
  })
}
