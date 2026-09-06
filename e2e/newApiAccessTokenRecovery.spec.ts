import type { Page } from "@playwright/test"

import {
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  E2E_NEW_API_RC22_AUTH,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { waitForSavedAccount } from "~~/e2e/utils/realSite/accountAdd"

/** Native side panels are extension views, not Playwright Page targets. */
async function getNativeSidePanel(bridge: Page) {
  await expect
    .poll(() =>
      bridge.evaluate(
        (path) =>
          chrome.extension
            .getViews()
            .some((view) => view.location.pathname === `/${path}`),
        SIDEPANEL_PAGE_PATH,
      ),
    )
    .toBe(true)

  return bridge.evaluateHandle((path) => {
    const view = chrome.extension
      .getViews()
      .find((candidate) => candidate.location.pathname === `/${path}`)
    if (!view) throw new Error("Native side panel unavailable")
    return view as Window & typeof globalThis
  }, SIDEPANEL_PAGE_PATH)
}

test("continues New API security verification in the native side panel after closing the popup", async ({
  context,
  extensionId,
  page,
}) => {
  const baseUrl = "https://new-api-verification.example.invalid"
  const manualToken = "e2e-manually-copied-management-pat"
  let tokenRequests = 0

  installExtensionPageGuards(page, {
    ignoreConsoleErrorPatterns: [
      /403/,
      /New API dashboard authentication could not be exchanged/,
    ],
  })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl,
    dashboardAuthMode: "auth-bundle",
    accessToken: manualToken,
  })
  await context.route(`${baseUrl}/api/user/token`, async (route) => {
    tokenRequests += 1
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        code: "SECURITY_PROOF_REQUIRED",
        message: "Security verification required",
      }),
    })
  })
  await context.route(`${baseUrl}/security`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<h1>Security settings</h1><label>Access Token<input readonly value="${manualToken}"></label>`,
    })
  })
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    autoProvisionKeyOnAccountAdd: false,
    tempWindowFallback: { enabled: false },
  })

  const sitePage = await context.newPage()
  await sitePage.goto(baseUrl)
  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  await sitePage.bringToFront()
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  const popupDialog = page.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog,
  )
  await popupDialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
    .fill(baseUrl)
  await popupDialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton)
    .click()

  await expect(
    popupDialog.getByText("Enter an Access Token manually"),
  ).toBeVisible()
  await expect(
    popupDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput),
  ).toHaveValue("1")
  await popupDialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput)
    .fill("Keep this site name")
  await popupDialog
    .getByPlaceholder("Optional, enter notes")
    .fill("Keep my popup notes")
  await expect(
    popupDialog.getByRole("button", { name: "Open site security settings" }),
  ).toHaveCount(0)

  await popupDialog
    .getByRole("button", { name: "Continue in side panel", exact: true })
    .click()
  const bridge = await context.newPage()
  await bridge.goto(`chrome-extension://${extensionId}/options.html#about`)
  const sidePanel = await getNativeSidePanel(bridge)
  await expect.poll(() => page.isClosed()).toBe(true)

  await expect
    .poll(() =>
      sidePanel.evaluate((view, ids) => {
        const dialog = view.document.querySelector(
          `[data-testid="${ids.accountDialog}"]`,
        )
        if (!dialog) return null
        const value = (id: string) =>
          dialog.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)?.value
        return {
          url: value(ids.siteUrlInput),
          siteName: value(ids.siteNameInput),
          username: value(ids.usernameInput),
          userId: value(ids.userIdInput),
        }
      }, ACCOUNT_MANAGEMENT_TEST_IDS),
    )
    .toEqual({
      url: baseUrl,
      siteName: "Keep this site name",
      username: "e2e-user",
      userId: "1",
    })

  const securityPagePromise = context.waitForEvent("page")
  await sidePanel.evaluate((view) => {
    const button = Array.from(view.document.querySelectorAll("button")).find(
      (candidate) =>
        candidate.textContent?.trim() === "Open site security settings",
    )
    if (!button || button.disabled)
      throw new Error("Security settings action unavailable")
    button.click()
  })
  const securityPage = await securityPagePromise
  await expect
    .poll(() =>
      serviceWorker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        })
        return tab?.url
      }),
    )
    .toBe(`${baseUrl}/security`)
  // tabs.create can navigate before Playwright attaches route interception.
  // Load the mock screen after verifying the URL of the actual browser tab.
  await securityPage.goto(`${baseUrl}/security`)
  await expect(
    securityPage.getByRole("heading", { name: "Security settings" }),
  ).toBeVisible()
  await securityPage.bringToFront()
  const copiedToken = await securityPage.getByLabel("Access Token").inputValue()
  await sidePanel.evaluate(
    (view, { id, token }) => {
      const input = view.document.querySelector<HTMLInputElement>(
        `[data-testid="${id}"]`,
      )
      if (!input) throw new Error("Manual Access Token field unavailable")
      const valueSetter = Object.getOwnPropertyDescriptor(
        view.HTMLInputElement.prototype,
        "value",
      )?.set
      if (!valueSetter) throw new Error("Native input value setter unavailable")
      valueSetter.call(input, token)
      input.dispatchEvent(new view.Event("input", { bubbles: true }))
    },
    { id: ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput, token: copiedToken },
  )
  await expect
    .poll(() =>
      sidePanel.evaluate((view, id) => {
        const button = view.document.querySelector<HTMLButtonElement>(
          `[data-testid="${id}"]`,
        )
        return button?.disabled
      }, ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton),
    )
    .toBe(false)
  await sidePanel.evaluate((view, id) => {
    view.document
      .querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)
      ?.click()
  }, ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton)

  const saved = await waitForSavedAccount({
    serviceWorker,
    siteType: SITE_TYPES.NEW_API,
    baseUrl,
  })
  expect(saved.site_name).toBe("Keep this site name")
  expect(saved.notes).toBe("Keep my popup notes")
  expect(saved.account_info.access_token).toBe(manualToken)
  expect(JSON.stringify(saved)).not.toContain(
    E2E_NEW_API_RC22_AUTH.dashboardToken,
  )
  expect(tokenRequests).toBe(1)
})
