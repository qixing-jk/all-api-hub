import { QUOTA_PER_USD } from "~/constants/money"
import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { runAccountAutoDetectScenario } from "~~/e2e/scenarios/accountAutoDetect"
import { refreshAccountRowsAndReadStorage } from "~~/e2e/scenarios/accountManualAdd"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getServiceWorker,
  requestAndExpectOptionalPermissions,
} from "~~/e2e/utils/extensionState"
import { waitForSavedAccount } from "~~/e2e/utils/realSite/accountAdd"

test("Cubence defaults to Cookie, saves live identity and refreshes after the console tab closes", async ({
  context,
  page,
  extensionId,
}) => {
  const origin = "https://cubence.com"
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    autoFillCurrentSiteUrlOnAccountAdd: false,
    autoProvisionKeyOnAccountAdd: false,
    tempWindowFallback: { enabled: false },
  })
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await requestAndExpectOptionalPermissions(page, ["cookies"])
  let balance = 12_500_000
  const requests: string[] = []
  await context.addCookies([
    {
      name: "token",
      value: "fixture-only",
      url: origin,
      sameSite: "None",
      secure: true,
      httpOnly: true,
    },
  ])
  await context.route(`${origin}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (!pathname.startsWith("/api/")) {
      await route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Cubence</title><h1>Cubence dashboard</h1>",
      })
      return
    }
    requests.push(pathname)
    expect(route.request().headers().authorization).toBeUndefined()
    if (pathname === "/api/v1/auth/me") {
      await route.fulfill({
        json: {
          user: {
            id: 7,
            username: "cubence-example",
            active: true,
            normal_balance: balance,
            charity_balance: 9000000,
          },
        },
      })
      return
    }
    if (pathname === "/api/v1/analytics/apikeys/hourly-usage") {
      const day = new Date(Date.now() + 8 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      await route.fulfill({
        json: {
          code: 200,
          range: "today",
          window_start: `${day}T00:00:00+08:00`,
          summary: { cost: 1000000, calls: 2, tokens: 100, output_tokens: 30 },
        },
      })
      return
    }
    if (pathname === "/api/v1/share-groups/available") {
      await route.fulfill({ json: { data: [] } })
      return
    }
    if (pathname === "/api/v1/user/apikeys") {
      await route.fulfill({ json: { success: true, data: [] } })
      return
    }
    await route.fulfill({
      status: 404,
      json: { error: "unhandled fixture endpoint" },
    })
  })
  const fixture = await runAccountAutoDetectScenario({
    extensionId,
    extensionPage: page,
    baseUrl: origin,
    siteType: "cubence",
    expectedDetectedSiteType: "cubence",
    getServiceWorker: async () => worker,
    openSitePage: async () => {
      const site = await context.newPage()
      await site.goto(`${origin}/dashboard`)
      return site
    },
    prepareDetectableSite: async () => undefined,
    prepareDetectedDialog: async () => {
      await expect(page.getByTestId(accounts.authTypeTrigger)).toHaveAttribute(
        "data-auth-type",
        "cookie",
      )
      await expect(page.getByTestId(accounts.userIdInput)).toHaveValue("7")
    },
  })
  const saved = await waitForSavedAccount({
    serviceWorker: worker,
    siteType: "cubence",
    baseUrl: origin,
    predicate: (account) => account.account_info.quota > 0,
  })
  expect(saved.authType).toBe("cookie")
  expect(saved.account_info.access_token).toBe("")
  expect(saved.account_info.quota).toBe(12.5 * QUOTA_PER_USD)
  expect(saved.account_info.today_quota_consumption).toBe(QUOTA_PER_USD)
  expect(saved.account_info.today_prompt_tokens).toBe(70)
  expect(context.pages().some((tab) => tab.url().startsWith(origin))).toBe(
    false,
  )
  requests.length = 0
  balance = 15_000_000
  await refreshAccountRowsAndReadStorage({
    page,
    serviceWorker: worker,
    accountIds: [saved.id],
    expectedQuotas: [15 * QUOTA_PER_USD],
  })
  expect(requests).toContain("/api/v1/auth/me")
  await fixture.cleanup()
})
