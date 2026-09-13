import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const action of ["check", "single import", "batch import"] as const) {
  test(`${action} reads an unavailable candidate key only once per operation`, async ({
    context,
    page,
    extensionId,
  }) => {
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    await seedStoredAccounts(worker, [createStoredAccount()])
    await stubNewApiSiteRoutes(context, {
      models: ["model-a"],
      initialTokens: [
        {
          id: 1,
          user_id: 1,
          key: "sk-existing-token",
          name: "Audited key",
          status: 1,
          created_time: 0,
          accessed_time: 0,
          expired_time: -1,
          remain_quota: -1,
          unlimited_quota: true,
          used_quota: 0,
          model_limits_enabled: false,
          model_limits: "",
          allow_ips: "",
          group: "default",
        },
      ],
    })
    const origin = "https://key-request-audit.example.invalid"
    await seedUserPreferences(worker, {
      managedSiteType: SITE_TYPES.DONE_HUB,
      doneHub: { baseUrl: origin, adminToken: "fixture-admin", userId: "1" },
    })
    let detailReads = 0
    let groupReads = 0
    let searches = 0
    const candidate = {
      id: 17,
      name: "Candidate",
      type: 1,
      status: 1,
      key: "",
      base_url: "https://example.com",
      models: "model-a",
      group: "default",
      priority: 0,
      weight: 1,
    }
    await context.route(`${origin}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname
      let data: unknown
      if (path === "/api/channel/17") {
        detailReads++
        data = candidate
      } else if (path === "/api/channel/") {
        searches++
        data = { data: [candidate], total_count: 1, page: 1, size: 100 }
      } else if (path.includes("group")) {
        groupReads++
        data = ["default"]
      } else
        throw new Error(
          `Unexpected managed request: ${route.request().method()} ${path}`,
        )
      await route.fulfill({ json: { success: true, data } })
    })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=e2e-account-1`,
    )
    await waitForExtensionRoot(page)
    const badge = page.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.managedSiteStatusBadge,
    )
    await expect(badge).toBeVisible()
    await expect(badge).not.toContainText("Checking")
    expect(detailReads).toBe(1)
    expect(searches).toBe(1)
    expect(groupReads).toBe(0)
    if (action === "check") {
      await page
        .getByRole("button", {
          name: "Refresh Managed-Site Channel Status",
          exact: true,
        })
        .click()
      await expect.poll(() => detailReads).toBe(2)
      await expect(badge).not.toContainText("Checking")
    } else if (action === "single import") {
      await page
        .getByTestId(KEY_MANAGEMENT_TEST_IDS.importToManagedSiteButton)
        .click()
      await expect(
        page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
      ).toBeVisible()
    } else {
      await page.getByRole("checkbox", { name: /Audited key/ }).check()
      await page
        .getByRole("button", { name: /Batch import to Done Hub/i })
        .click()
      await expect(
        page.getByRole("button", { name: "Refresh preview", exact: true }),
      ).toBeEnabled()
      await expect(
        page.getByText("Key unavailable", { exact: true }),
      ).toBeVisible()
    }
    await expect.poll(() => detailReads).toBe(2)
    expect(searches).toBe(2)
    expect(groupReads).toBe(action === "check" ? 0 : 1)
  })
}
