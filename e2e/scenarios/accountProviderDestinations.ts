import type { Page } from "@playwright/test"

import {
  getAccountSiteApiRouter,
  type AccountSiteType,
} from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { joinUrl } from "~/utils/core/url"
import { expect } from "~~/e2e/fixtures/extensionTest"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

const DESTINATION_PAGE_TIMEOUT_MS = 30_000
const NOT_FOUND_PATTERN =
  /(404|not\s+found|page\s+not\s+found|页面不存在|找不到页面)/i

type AccountProviderDestinationFixture = {
  accountId: string
  siteType: AccountSiteType
  baseUrl: string
}

export type ProviderDestinationValidationOptions =
  | boolean
  | {
      usage?: boolean
      redeem?: boolean
    }

function shouldValidateDestination(
  options: ProviderDestinationValidationOptions | undefined,
  destination: "usage" | "redeem",
) {
  if (typeof options === "boolean") {
    return options
  }

  return options?.[destination] === true
}

async function expectBrowserTabOpened(params: {
  serviceWorker: ServiceWorker
  url: string
}) {
  await expect
    .poll(async () => {
      return await params.serviceWorker.evaluate(async (targetUrl) => {
        const chromeApi = (globalThis as any).chrome
        const tabs = await chromeApi.tabs.query({})
        return tabs.some((tab: { url?: string }) => tab.url === targetUrl)
      }, params.url)
    })
    .toBe(true)
}

async function openAccountActionsMenu(params: {
  page: Page
  accountId: string
}) {
  await params.page.bringToFront()

  const row = params.page.getByTestId(
    getAccountManagementListItemTestId(params.accountId),
  )
  await row.hover()
  await row
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
    .click()
}

async function expectDestinationPageExists(params: {
  sourcePage: Page
  url: string
}) {
  const destinationPage = await params.sourcePage.context().newPage()

  try {
    const response = await destinationPage.goto(params.url, {
      waitUntil: "domcontentloaded",
      timeout: DESTINATION_PAGE_TIMEOUT_MS,
    })
    const status = response?.status()

    if (typeof status === "number" && status >= 400) {
      throw new Error(
        `Provider destination returned HTTP ${status}: ${params.url}`,
      )
    }

    const title = await destinationPage.title().catch(() => "")
    const bodyText = await destinationPage
      .locator("body")
      .innerText({ timeout: 5_000 })
      .catch(() => "")
    const normalizedPageText = `${title}\n${bodyText}`.trim()

    if (NOT_FOUND_PATTERN.test(normalizedPageText)) {
      throw new Error(`Provider destination looks missing: ${params.url}`)
    }
  } finally {
    await destinationPage.close()
  }
}

export async function runAccountProviderDestinationsScenario(params: {
  page: Page
  serviceWorker: ServiceWorker
  account: AccountProviderDestinationFixture
  validateDestinationPages?: ProviderDestinationValidationOptions
}) {
  const routes = getAccountSiteApiRouter(params.account.siteType)
  const usageUrl = joinUrl(params.account.baseUrl, routes.usagePath)
  const redeemUrl = joinUrl(params.account.baseUrl, routes.redeemPath)

  await openAccountActionsMenu({
    page: params.page,
    accountId: params.account.accountId,
  })
  await params.page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowUsageLogMenuItem)
    .click()
  await expectBrowserTabOpened({
    serviceWorker: params.serviceWorker,
    url: usageUrl,
  })
  if (shouldValidateDestination(params.validateDestinationPages, "usage")) {
    await expectDestinationPageExists({
      sourcePage: params.page,
      url: usageUrl,
    })
  }

  await openAccountActionsMenu({
    page: params.page,
    accountId: params.account.accountId,
  })
  await params.page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowRedeemMenuItem)
    .click()
  await expectBrowserTabOpened({
    serviceWorker: params.serviceWorker,
    url: redeemUrl,
  })
  if (shouldValidateDestination(params.validateDestinationPages, "redeem")) {
    await expectDestinationPageExists({
      sourcePage: params.page,
      url: redeemUrl,
    })
  }

  await params.page.bringToFront()
}
