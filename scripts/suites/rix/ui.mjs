import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "../../../src/features/AccountManagement/testIds.ts"
import { SITE_TYPES } from "../../../src/services/accountSiteDefinitions/identifiers.ts"
import { withTemporaryAccount } from "../../cdp/sandbox.mjs"
import { openExtensionPage } from "../../cdp/ui-driver.mjs"
import {
  assertAccountDetectionOutcome,
  closeAccountDraft,
  detectAccountSiteType,
  openAccountAddDialog,
} from "../../flows/auto-detect.mjs"
import { testModelCatalogFlow } from "../../flows/model-catalog.mjs"

/**
 * Execute UI end-to-end tests for Rix-Api against the live Options UI.
 */
export async function runRixUiTest({
  context,
  extensionId,
  serviceWorker,
  targetUrl,
  timeoutMs = 30_000,
}) {
  console.log("\n🖥️ 开始执行 Rix API 扩展端到端 UI 交互验证 (装配通用流程)...")

  const page = await openExtensionPage({
    context,
    extensionId,
    route: "options.html#account",
  })

  try {
    const site = await context.newPage()
    let native
    try {
      await site.goto(targetUrl, { waitUntil: "domcontentloaded" })
      native = await site.evaluate(async () => {
        let user = {}
        try {
          user = JSON.parse(localStorage.getItem("user") || "{}")
        } catch {
          // Malformed cached user data cannot establish identity; the session request below must do so.
        }
        const headers = {}
        if (user.id != null) headers["New-Api-User"] = String(user.id)
        if (user.access_token)
          headers.Authorization = `Bearer ${user.access_token}`
        const response = await fetch("/api/user/self", {
          credentials: "include",
          headers,
        })
        const body = await response.json()
        if (!response.ok || body?.success !== true)
          throw new Error("rix_native_identity_request_failed")
        return body.data
      })
    } finally {
      await site.close().catch(() => {})
    }
    if (
      native?.id == null ||
      !String(native.id).trim() ||
      !native.username?.trim()
    )
      throw new Error("rix_native_identity_invalid")
    await openAccountAddDialog({ page, targetUrl, timeoutMs })
    const dialog = await detectAccountSiteType({
      page,
      expectedType: SITE_TYPES.RIX_API,
      timeoutMs,
    })
    await assertAccountDetectionOutcome({
      page,
      expectedType: SITE_TYPES.RIX_API,
      timeoutMs,
      fields: {
        siteUrlInput: targetUrl,
        userIdInput: String(native.id),
        usernameInput: native.username,
      },
      saveState: "enabled",
    })
    const detectedToken = (
      await dialog.getByTestId(accounts.accessTokenInput).inputValue()
    ).trim()
    if (!detectedToken) throw new Error("rix_detected_credential_missing")
    const response = await context.request.get(
      new URL("/api/user/self", targetUrl).href,
      {
        maxRedirects: 0,
        headers: {
          Cookie: "",
          Authorization: `Bearer ${detectedToken}`,
          "New-Api-User": String(native.id),
        },
      },
    )
    const body = await response.json()
    if (
      !response.ok() ||
      body?.success !== true ||
      String(body.data?.id) !== String(native.id) ||
      body.data?.username !== native.username
    )
      throw new Error("rix_detected_credential_identity_mismatch")
    const testFixture = {
      site_name: "Rix-Live-Detected",
      site_url: targetUrl,
      site_type: SITE_TYPES.RIX_API,
      account_info: {
        id: String(native.id),
        username: native.username,
        access_token: detectedToken,
      },
    }
    await closeAccountDraft(page, { timeoutMs })

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
