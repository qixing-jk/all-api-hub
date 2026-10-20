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
  await captureVisualViews({
    page,
    ready: row,
    id: "quota-billing",
    extensionDir,
  })
})
