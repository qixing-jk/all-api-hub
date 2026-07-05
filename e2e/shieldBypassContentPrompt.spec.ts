import type { Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
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

  return lastResult ?? { success: false, error: "No message result" }
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

test("shows the shield-bypass content prompt and opens its settings anchor", async ({
  context,
  extensionId,
  page,
}) => {
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
      name: "All API Hub shielded bypass helper (temporary window)",
    }),
    `Expected shield bypass prompt to render after content message; last result: ${JSON.stringify(
      messageResult,
    )}`,
  ).toBeVisible()
  await expect(page).toHaveTitle(/All API Hub · Shield Bypass · Shield Fixture/)

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
      name: "Temp-window protection bypass",
    }),
  ).toBeInViewport()
})
