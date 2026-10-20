import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { KEY_MANAGEMENT_TEST_IDS as ids } from "~/features/KeyManagement/testIds"
import { TOKEN_PROVISIONING_TEST_IDS as secretIds } from "~/features/TokenProvisioning/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test("RelayFor key lifecycle follows native operations and preserves editor settings", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  const token = {
    id: 1,
    name: "RelayFor 测试密钥",
    key: "sk-masked...****",
    status: 1,
    remain_quota: -1,
    used_quota: 0,
    unlimited_quota: false,
    ip_limits: "10.0.0.0/8",
    model_limits: ["gpt-4o"],
    expired_at: "2027-01-01T00:00:00Z",
    budget_usage: [
      {
        window: "day",
        limit: 500000,
        used: 100000,
        remaining: 350000,
        reserved: 50000,
        next_reset_at: "2026-10-21T00:00:00+08:00",
      },
    ],
    limits: {
      budget_day: 500000,
      requests_per_minute: 20,
      concurrent_requests: 2,
      future_setting: 7,
    },
  }
  const writes: Record<string, unknown>[] = []
  let rotations = 0
  let releaseStatusWrite: (() => void) | undefined
  let delayNextStatusWrite = true
  let holdNextInventoryRead = false
  let releaseInventoryRead: (() => void) | undefined
  await context.route("https://relayfor.xyz/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    let json: unknown = {}
    if (url.pathname === "/api/user/tokens") {
      if (holdNextInventoryRead) {
        holdNextInventoryRead = false
        await new Promise<void>((resolve) => {
          releaseInventoryRead = resolve
        })
      }
      json = [token]
    }
    if (url.pathname === "/api/user/tokens/1" && request.method() === "PUT") {
      const body = request.postDataJSON()
      writes.push(body)
      if (delayNextStatusWrite) {
        delayNextStatusWrite = false
        await new Promise<void>((resolve) => {
          releaseStatusWrite = resolve
        })
      }
      Object.assign(
        token,
        body,
        body.expires_at !== undefined ? { expired_at: body.expires_at } : {},
      )
    }
    if (url.pathname.endsWith("/rotate")) {
      rotations++
      token.key = "sk-rotated...****"
      json = { key: "sk-rotated-e2e-response-secret" }
    }
    await route.fulfill({ json })
  })
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      id: "relayfor-e2e",
      site_type: SITE_TYPES.RELAYFOR,
      site_name: "RelayFor",
      site_url: "https://relayfor.xyz",
      account_info: {
        id: "1",
        username: "fixture",
        access_token: "fixture-token",
      },
    }),
  ])
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.KEYS}?accountId=relayfor-e2e`,
  )
  await waitForExtensionRoot(page)
  const row = page.getByTestId(ids.nativeKeyRow)
  await expect(row).toContainText(token.name)
  await expect(row).toContainText("跟随账户")
  await expect(row).toContainText("已用额度")
  await row
    .getByRole("button", { name: `查看 ${token.name} 的详情`, exact: true })
    .click()
  await expect(row).toContainText("剩余 $0.7")
  await expect(row).toContainText("预留 $0.1")
  await expect(row).toContainText("北京时间")
  await row.screenshot({ path: testInfo.outputPath("key-budget-details.png") })
  const editor = page.getByTestId(ids.nativeEditor)
  const disableButton = row.getByRole("button", {
    name: "禁用 API Key",
    exact: true,
  })
  await disableButton.click()
  await expect(disableButton).toBeDisabled()
  await expect(disableButton).toHaveAttribute("aria-busy", "true")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await row.screenshot({ path: testInfo.outputPath("disable-pending.png") })
  await expect.poll(() => releaseStatusWrite !== undefined).toBe(true)
  releaseStatusWrite?.()
  await expect(
    row.getByRole("button", { name: "启用 API Key", exact: true }),
  ).toBeVisible()
  expect(writes).toEqual([{ status: 2 }])
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await row.getByRole("button", { name: "启用 API Key", exact: true }).click()
  await expect(
    row.getByRole("button", { name: "禁用 API Key", exact: true }),
  ).toBeVisible()
  expect(writes).toEqual([{ status: 2 }, { status: 1 }])
  await expect(page.getByRole("dialog")).toHaveCount(0)
  holdNextInventoryRead = true
  await row.getByRole("button", { name: "轮换 API Key", exact: true }).click()
  await expect(editor).toContainText("旧 Key 将立即失效")
  await expect(
    editor.getByRole("heading", { name: "轮换 API Key", exact: true }),
  ).toBeVisible()
  await expect(
    editor.getByRole("button", { name: "轮换 API Key", exact: true }),
  ).toBeDisabled()
  await expect(page.getByTestId(ids.nativeEditorLoading)).toHaveCount(0)
  await editor.screenshot({
    path: testInfo.outputPath("rotation-preparing.png"),
  })
  await expect.poll(() => releaseInventoryRead !== undefined).toBe(true)
  releaseInventoryRead?.()
  await expect(
    editor.getByRole("button", { name: "轮换 API Key", exact: true }),
  ).toBeEnabled()
  await expect(
    editor.getByRole("button", { name: "轮换 API Key", exact: true }),
  ).toHaveAttribute("data-variant", "destructive")
  await editor.getByRole("button", { name: "取消", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(rotations).toBe(0)
  await row.getByRole("button", { name: "轮换 API Key", exact: true }).click()
  await editor.screenshot({
    path: testInfo.outputPath("rotation-confirmation.png"),
  })
  await editor
    .getByRole("button", { name: "轮换 API Key", exact: true })
    .click()
  await expect(page.getByTestId(secretIds.oneTimeKeyInput)).toHaveValue(
    "sk-rotated-e2e-response-secret",
  )
  expect(rotations).toBe(1)
  expect(writes).toHaveLength(2)
  await page.getByTestId(secretIds.oneTimeKeyCopyButton).click()
  await page.getByTestId(secretIds.oneTimeKeyCloseButton).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  // Toasts animate and disappear independently; ordinal close-button locators can
  // change while a click is waiting. Move away so hover cannot pause their expiry.
  await page.mouse.move(0, 0)
  await expect(
    page.getByRole("button", { name: "关闭", exact: true }),
  ).toHaveCount(0)
  await expect(row).toContainText("sk-r")
  const actionLabels = await row
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    )
  expect(actionLabels.indexOf("轮换 API Key")).toBe(
    actionLabels.indexOf("删除密钥") - 1,
  )
  await page.mouse.move(0, 0)
  const management = row.getByRole("group", { name: "管理", exact: true })
  const divider = management.locator(
    "xpath=preceding-sibling::span[@aria-hidden='true']",
  )
  await expect(divider).toBeVisible()
  const dividerBounds = await divider.boundingBox()
  const editBounds = await row
    .getByRole("button", { name: "编辑密钥", exact: true })
    .boundingBox()
  expect(dividerBounds!.width).toBe(1)
  expect(dividerBounds!.x + dividerBounds!.width).toBeLessThan(editBounds!.x)
  await row.screenshot({ path: testInfo.outputPath("rotation-actions.png") })
  await page.setViewportSize({ width: 380, height: 800 })
  await expect(divider).not.toBeVisible()
  await row.screenshot({ path: testInfo.outputPath("key-actions-narrow.png") })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.setViewportSize({ width: 1280, height: 800 })
  await row.getByRole("button", { name: "编辑密钥", exact: true }).click()
  await expect(editor.locator("#resource-editor-quota")).toHaveValue("-1")
  await expect(editor.locator("#resource-editor-ip_limits")).toHaveValue(
    "10.0.0.0/8",
  )
  await expect(editor.getByText("重置", { exact: true })).toHaveCount(0)
  await editor.screenshot({ path: testInfo.outputPath("key-editor.png") })
  await editor
    .getByRole("button", { name: "预算与访问限制", exact: true })
    .click()
  await expect(editor.locator("#resource-editor-budget_day")).toHaveValue("1")
  await editor.locator("#resource-editor-budget_day").fill("3")
  await editor.getByTestId(ids.nativeEditorSubmitButton).click()
  await expect(editor).toBeHidden()
  expect(writes.at(-1)).toMatchObject({
    remain_quota: -1,
    ip_limits: "10.0.0.0/8",
    expires_at: "2027-01-01T00:00:00.000Z",
    limits: {
      budget_day: 1500000,
      requests_per_minute: 20,
      concurrent_requests: 2,
      future_setting: 7,
    },
  })
})
