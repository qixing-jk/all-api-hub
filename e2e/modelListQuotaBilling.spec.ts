import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { AuthTypeEnum } from "~/types"
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
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

test("shows native quota rates with token-based billing", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      id: "quota-account",
      site_name: "EMRank",
      site_url: "https://emrank.tech",
      site_type: SITE_TYPES.EMRANK,
      authType: AuthTypeEnum.Cookie,
      cookieAuth: { sessionCookie: "__Host-gateway_session=e2e-fixture" },
    }),
  ])
  await context.route("https://emrank.tech/**", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "example/embedding",
            kind: "embedding",
            owned_by: "example",
            modelratio: 3,
            available: true,
            context_tokens: 8192,
            supported_dimensions: [1024],
          },
        ],
      },
    }),
  )
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?accountId=quota-account#models`,
  )
  await waitForExtensionRoot(page)
  const row = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { name: "example/embedding", exact: true }),
  })
  await expect(row.getByText("按量计费", { exact: true })).toBeVisible()
  await expect(row.getByText("3 M Token/M", { exact: true })).toBeVisible()
  await expect(row.getByText("0 M Token/M", { exact: true })).toBeVisible()
  if (process.env.AAH_VISUAL_CAPTURE_DIR) {
    await expect(
      page.getByText("模型数据加载成功", { exact: true }),
    ).toBeHidden({ timeout: 10_000 })
  }
  await captureVisualViews({
    page,
    ready: row,
    captureTarget: row,
    id: "quota-billing",
    extensionDir,
  })
})

test("shows Dahl request Token rates independently of package purchase prices", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      id: "dahl-pricing",
      site_name: "Dahl",
      site_url: "https://inference.dahl.global",
      site_type: SITE_TYPES.DAHL,
      authType: AuthTypeEnum.Cookie,
    }),
  ])
  await context.route("https://inference.dahl.global/**", (route) =>
    route.fulfill({ json: { data: [{ id: "dahl-model" }] } }),
  )
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?accountId=dahl-pricing#models`,
  )
  await waitForExtensionRoot(page)
  const row = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { name: "dahl-model", exact: true }),
  })
  await expect(row.getByText("1 M Token/M", { exact: true })).toHaveCount(2)
  await expect(row).not.toContainText("$0.03")
  if (process.env.AAH_VISUAL_CAPTURE_DIR) {
    await expect(
      page.getByText("Model data loaded successfully", { exact: true }),
    ).toBeHidden({ timeout: 10_000 })
  }
  await captureVisualViews({
    page,
    ready: row,
    captureTarget: row,
    id: "dahl-token-pricing",
    extensionDir,
  })
})
