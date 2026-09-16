import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
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

test("identifies full-site catalog accounts and rows at desktop and narrow widths", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      id: "fallback-account",
      site_name: "范围未确认账号",
      site_url: "https://aihubmix.com",
      site_type: SITE_TYPES.AIHUBMIX,
      account_info: { access_token: "fallback-token" },
    }),
    createStoredAccount({
      id: "scoped-account",
      site_name: "已确认账号",
      site_url: "https://aihubmix.com",
      site_type: SITE_TYPES.AIHUBMIX,
      account_info: { access_token: "scoped-token" },
    }),
  ])
  await context.route("https://aihubmix.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = { success: true, data: [] }
    if (path === "/api/v1/models") {
      body = {
        success: true,
        data: [
          { model_id: "fallback-model", pricing: { input: 1, output: 2 } },
        ],
      }
    } else if (
      path === "/api/user/available_models" ||
      path === "/call/usr/avail_mdls"
    ) {
      body =
        route.request().headers().authorization === "scoped-token"
          ? { success: true, data: [{ model: "scoped-model" }] }
          : { success: false, message: "Model scope unavailable" }
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    })
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?accountId=all#models`,
  )
  await waitForExtensionRoot(page)
  const notice = page
    .getByRole("alert")
    .filter({ hasText: "已回退到站点完整模型目录" })
  await expect(notice).toContainText("范围未确认账号")
  await expect(notice).not.toContainText("已确认账号")
  const fallbackRow = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { name: "fallback-model", exact: true }),
  })
  const scopedRow = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { name: "scoped-model", exact: true }),
  })
  await expect(
    fallbackRow.getByText("站点完整目录", { exact: true }),
  ).toBeVisible()
  await expect(
    scopedRow.getByText("站点完整目录", { exact: true }),
  ).toHaveCount(0)
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await notice.scrollIntoViewIfNeeded()
    await expect(notice).toBeVisible()
    expect(
      await notice.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`catalog-fallback-${width}.png`),
    })
    await fallbackRow.scrollIntoViewIfNeeded()
    await expect(
      fallbackRow.getByText("站点完整目录", { exact: true }),
    ).toBeVisible()
    expect(
      await fallbackRow.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true)
  }
})
