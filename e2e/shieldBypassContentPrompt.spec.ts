import type { Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SHIELD_SETTINGS_TARGET_IDS } from "~/features/BasicSettings/components/tabs/Refresh/searchTargets"
import { PROTECTION_BYPASS_AUTOMATIC_FEATURES } from "~/services/protectionBypass/contracts"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
  waitForExtensionPage,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const SHIELD_FIXTURE_URL = "https://shield-bypass.example.test/challenge"
const SHIELD_FIXTURE_ORIGIN = "https://shield-bypass.example.test"
const CLOSED_MESSAGE_RESPONSE_ERRORS = [
  "message port closed before a response",
  "message channel closed before a response",
]

type ShieldBypassMessageResult = {
  success: boolean
  error?: string
}

function getShieldBypassMessageStatus(result: ShieldBypassMessageResult) {
  if (result.success) {
    return "success"
  }

  const error = result.error?.toLowerCase() ?? ""
  if (
    CLOSED_MESSAGE_RESPONSE_ERRORS.some((closedMessageResponseError) =>
      error.includes(closedMessageResponseError),
    )
  ) {
    return "message-port-closed"
  }

  return "retry"
}

async function sendShieldBypassUiMessage(
  serviceWorker: Worker,
  pageUrl: string,
): Promise<ShieldBypassMessageResult> {
  let lastResult: ShieldBypassMessageResult | undefined

  try {
    await expect
      .poll(async () => {
        lastResult = await serviceWorker.evaluate(
          async ({ action, origin, pageUrl, requestId }) => {
            const chromeApi = (globalThis as any).chrome
            const tabs = await chromeApi.tabs.query({})
            const targetTab = tabs.find(
              (tab: { id?: number; url?: string }) => tab.url === pageUrl,
            )

            if (targetTab?.id == null) {
              return { success: false, error: "Target tab not found" }
            }

            return await new Promise<ShieldBypassMessageResult>((resolve) => {
              chromeApi.tabs.sendMessage(
                targetTab.id,
                {
                  action,
                  origin,
                  requestId,
                },
                (response?: { success?: boolean; error?: string }) => {
                  const error = chromeApi.runtime?.lastError
                  const errorMessage =
                    typeof error?.message === "string" ? error.message : ""

                  if (errorMessage) {
                    resolve({ success: false, error: errorMessage })
                    return
                  }

                  resolve(
                    response?.success === false
                      ? { success: false, error: response.error }
                      : { success: true },
                  )
                },
              )
            })
          },
          {
            action: RuntimeActionIds.ContentShowShieldBypassUi,
            origin: SHIELD_FIXTURE_ORIGIN,
            pageUrl,
            requestId: "e2e-shield-bypass-prompt",
          },
        )

        return getShieldBypassMessageStatus(lastResult)
      })
      .toMatch(/^(success|message-port-closed)$/)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Timed out waiting for shield bypass content message; last result: ${JSON.stringify(
        lastResult,
      )}\n${message}`,
    )
  }

  if (!lastResult) {
    throw new Error("Shield bypass content message did not produce a result")
  }

  return lastResult
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)

  await context.route(SHIELD_FIXTURE_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html>
        <html lang="en">
          <head>
            <title>Shield Fixture</title>
          </head>
          <body>
            <main>
              <h1>Shield challenge fixture</h1>
            </main>
          </body>
        </html>`,
    })
  })
})

test("shows the shield-bypass content prompt and opens settings without redundant history or dismiss actions", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, { language: "en" })

  await page.goto(SHIELD_FIXTURE_URL)
  const messageResult = await sendShieldBypassUiMessage(
    serviceWorker,
    SHIELD_FIXTURE_URL,
  )

  const contentHost = page.locator("all-api-hub-redemption-toast")
  await expect(
    contentHost.getByRole("heading", {
      name: "Shield bypass helper",
      exact: true,
    }),
    `Expected shield bypass prompt to render after content message; last result: ${JSON.stringify(
      messageResult,
    )}`,
  ).toBeVisible()
  await expect(page).toHaveTitle(/All API Hub · Shield Bypass · Shield Fixture/)
  const notice = contentHost.getByRole("region")
  const header = notice.locator("header")
  await expect(header.locator("svg").first()).toBeVisible()
  await expect(header).toHaveCSS("border-bottom-width", "1px")
  const body = notice.locator('[data-slot="notice-body"] > p')
  await expect(body).toBeVisible()
  expect(await body.textContent()).not.toMatch(/\n\s*\n/)
  const bodyBox = await body.boundingBox()
  const titleBox = await header.getByRole("heading").boundingBox()
  expect(bodyBox!.x).toBeLessThan(titleBox!.x)
  await expect(
    notice
      .locator('[data-slot="notice-body"]')
      .getByRole("button", { name: "Open shield bypass settings" }),
  ).toBeVisible()
  await expect(notice.locator("footer")).toHaveCount(0)
  await expect(
    notice.getByRole("button", { name: "Dismiss", exact: true }),
  ).toHaveCount(0)
  await expect(
    notice.getByRole("button", { name: "View shield bypass history" }),
  ).toHaveCount(0)
  await expect(header).toHaveCSS("padding-left", "16px")
  await page.screenshot({
    path: testInfo.outputPath("shield-content-desktop.png"),
    animations: "disabled",
  })

  const settingsPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.BASIC}`,
    searchParams: {
      tab: "refresh",
      anchor: "shield-settings",
    },
  })

  await contentHost
    .getByRole("button", { name: "Open shield bypass settings" })
    .click()

  const settingsPage = await settingsPagePromise
  installExtensionPageGuards(settingsPage)
  await waitForExtensionRoot(settingsPage)

  const targetUrl = new URL(settingsPage.url())
  expect(targetUrl.hash).toBe(`#${MENU_ITEM_IDS.BASIC}`)
  expect(targetUrl.searchParams.get("tab")).toBe("refresh")
  expect(targetUrl.searchParams.get("anchor")).toBe("shield-settings")

  await expect(
    settingsPage.getByRole("heading", {
      name: "Website verification assistance",
    }),
  ).toBeInViewport()
  await expect(
    settingsPage.locator(`#${SHIELD_SETTINGS_TARGET_IDS.automaticFeatures}`),
  ).toBeVisible()
  await expect(
    settingsPage
      .locator(
        `#${
          SHIELD_SETTINGS_TARGET_IDS.feature[
            PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin
          ]
        }`,
      )
      .getByRole("checkbox"),
  ).toBeVisible()
  await expect(
    settingsPage
      .locator(
        `#${
          SHIELD_SETTINGS_TARGET_IDS.feature[
            PROTECTION_BYPASS_AUTOMATIC_FEATURES.BalanceHistory
          ]
        }`,
      )
      .getByRole("checkbox"),
  ).toBeVisible()

  await page.bringToFront()
  await page.setViewportSize({ width: 390, height: 844 })
  const settingsLink = contentHost.getByRole("button", {
    name: "Open shield bypass settings",
  })
  await expect(settingsLink).toBeInViewport({ ratio: 1 })
  await page.screenshot({
    path: testInfo.outputPath("shield-history-content-entry-mobile.png"),
    animations: "disabled",
  })
  await seedUserPreferences(serviceWorker, {
    language: "en",
    themeMode: "dark",
  })
  await expect(contentHost.locator(".dark").getByRole("region")).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("shield-content-mobile-dark.png"),
    animations: "disabled",
  })
  await seedUserPreferences(serviceWorker, {
    language: "en",
    themeMode: "light",
  })
  await expect(contentHost.locator(".dark")).toHaveCount(0)

  await contentHost.getByRole("button", { name: "Close", exact: true }).click()
  await expect(notice).toHaveCount(0)
  expect(page.isClosed()).toBe(false)
})
