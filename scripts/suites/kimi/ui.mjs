import { expect } from "@playwright/test"

import {
  getAccounts,
  withStoredValue,
  withTemporaryAccount,
  withUiCreatedAccount,
} from "../../cdp/sandbox.mjs"
import { dismissModals, openExtensionPage } from "../../cdp/ui-driver.mjs"
import { testAccountCardFlow } from "../../flows/account-card.mjs"
import {
  assertAccountDetectionOutcome,
  detectAccountSiteType,
  openAccountAddDialog,
} from "../../flows/auto-detect.mjs"
import { testModelCatalogFlow } from "../../flows/model-catalog.mjs"

/**
 * Execute UI end-to-end tests for Kimi Open Platform against the live Options UI.
 */
export async function runKimiUiTest(options) {
  return withStoredValue(
    options.serviceWorker,
    "user_preferences",
    { autoProvisionKeyOnAccountAdd: false },
    () => runKimiUiTestInner(options),
    { restorePatchedKeysOnly: true },
  )
}

async function runKimiUiTestInner({
  context,
  extensionId,
  serviceWorker,
  token = "",
  organizationId = "",
  siteUrl = "https://platform.kimi.ai",
  siteType = "kimi-global",
  timeoutMs = 30_000,
}) {
  console.log("\n🖥️ 开始执行 Kimi 开放平台端到端 UI 自动化全功能验证 (CDP)...")

  if (!token.trim()) throw new Error("kimi_live_ui_requires_access_token")
  const identityResponse = await context.request.get(
    `${siteUrl}/api?endpoint=userInfo`,
    {
      maxRedirects: 0,
      headers: { Authorization: `Bearer ${token}`, Cookie: "" },
    },
  )
  if (!identityResponse.ok())
    throw new Error("kimi_native_identity_request_failed")
  const identityBody = await identityResponse.json()
  const native = identityBody?.data
  if (
    identityBody?.code !== 0 ||
    typeof native?.uid !== "string" ||
    !native.uid.trim()
  )
    throw new Error("kimi_native_identity_invalid")
  const nativeUsername =
    typeof native.name === "string" && native.name.trim()
      ? native.name.trim()
      : native.uid.trim()
  const nativeOrganizations = (native.organizations ?? [])
    .map((entry) => entry?.organization?.id)
    .filter(Boolean)
  const verifiedOrganizationId = organizationId || nativeOrganizations[0]
  if (
    !verifiedOrganizationId ||
    !nativeOrganizations.includes(verifiedOrganizationId)
  )
    throw new Error("kimi_native_organization_mismatch")

  // =========================================================================
  // 1. 验证真实自动识别流程 (Auto-Detect Flow)
  // =========================================================================
  console.log(
    "\n  [UI 阶段 1: 自动识别] 校验【添加账号】对 Kimi 开放平台的自动探测与 7.2 汇率回填...",
  )

  // 确保在浏览器中预开一个已登录的 Kimi 页面供 content script 提取 Token
  let detectedAccount
  let detectedAccessToken
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
      language: "en",
      dismissUpdateLog: true,
    })

    try {
      await openAccountAddDialog({ page: optPage, targetUrl: siteUrl })
      await detectAccountSiteType({ page: optPage, expectedType: siteType })
      await assertAccountDetectionOutcome({
        page: optPage,
        expectedType: siteType,
        timeoutMs,
        fields: {
          siteUrlInput: siteUrl,
          userIdInput: native.uid.trim(),
          usernameInput: nativeUsername,
        },
        saveState: "enabled",
      })
      detectedAccessToken = (
        await optPage
          .getByTestId("account-management-access-token-input")
          .inputValue()
      ).trim()
      if (!detectedAccessToken)
        throw new Error("kimi_detected_credential_missing")
      const detectedResponse = await context.request.get(
        `${siteUrl}/api?endpoint=userInfo`,
        {
          maxRedirects: 0,
          headers: {
            Authorization: `Bearer ${detectedAccessToken}`,
            Cookie: "",
          },
        },
      )
      const detectedBody = await detectedResponse.json()
      if (
        !detectedResponse.ok() ||
        detectedBody?.code !== 0 ||
        detectedBody.data?.uid !== native.uid ||
        !(detectedBody.data?.organizations ?? []).some(
          (entry) => entry?.organization?.id === verifiedOrganizationId,
        )
      )
        throw new Error("kimi_detected_credential_identity_mismatch")
      await expect(
        optPage.getByLabel(/Recharge Amount Ratio|充值金额比例/),
      ).toHaveValue("7.2", { timeout: timeoutMs })

      if (
        (await getAccounts(serviceWorker)).some(
          (account) =>
            account.site_type === siteType &&
            new URL(account.site_url).origin === new URL(siteUrl).origin &&
            String(account.account_info?.id) === native.uid.trim(),
        )
      )
        throw new Error(
          "kimi_detection_save_requires_profile_without_existing_target_account",
        )
      detectedAccount = await withUiCreatedAccount(
        serviceWorker,
        async (name) => {
          await optPage
            .getByTestId("account-management-site-name-input")
            .fill(name)
          await optPage
            .getByTestId("account-management-confirm-add-button")
            .click()
        },
        async (saved) => {
          if (
            String(saved.account_info?.id) !== native.uid.trim() ||
            saved.account_info?.username !== nativeUsername ||
            saved.account_info?.access_token !== detectedAccessToken ||
            saved.site_type !== siteType ||
            saved.site_url !== siteUrl ||
            saved.kimiOpenPlatformAuth?.organizationId !==
              verifiedOrganizationId
          )
            throw new Error(
              "kimi_saved_detection_identity_or_organization_mismatch",
            )
          return saved
        },
        { timeoutMs },
      )
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

  const accountFixture = detectedAccount

  await withTemporaryAccount(
    serviceWorker,
    accountFixture,
    async (accountFixture) => {
      const page = await openExtensionPage({
        context,
        extensionId,
        route: "options.html#account",
        language: "en",
        dismissUpdateLog: true,
      })

      try {
        // 2.1 账户卡片展示流
        const cardResult = await testAccountCardFlow({
          page,
          extensionId,
          accountName: accountFixture.site_name,
          accountId: accountFixture.id,
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
    },
  )
}
