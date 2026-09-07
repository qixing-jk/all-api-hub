import type { Page } from "@playwright/test"

import {
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { verifyAccountModelCatalog } from "~~/e2e/scenarios/modelListCatalog"
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
import {
  expectAccountListItemVisible,
  openAccountManagementPage,
  waitForSavedAccount,
} from "~~/e2e/utils/realSite/accountAdd"

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

for (const scenario of [
  {
    siteType: SITE_TYPES.NEW_API,
    name: "New API",
    baseUrl: "https://new-api-verification.example.invalid",
    tokenPagePath: "/security#security-access",
    openTokenSettingsLabel: "Open site security settings",
    tokenRequests: 1,
  },
  {
    siteType: SITE_TYPES.APIYI,
    name: "APIyi",
    baseUrl: "https://api.apiyi.com",
    tokenPagePath: "/account/profile",
    openTokenSettingsLabel: "Open APIyi profile",
    tokenRequests: 0,
  },
] as const) {
  test(`continues ${scenario.name} security verification in the native side panel after closing the popup`, async ({
    context,
    extensionId,
    page,
  }) => {
    const { baseUrl, tokenPagePath, openTokenSettingsLabel, siteType } =
      scenario
    const manualToken = "e2e-manually-copied-management-pat"
    const initialQuota = 1000
    const refreshedQuota = 2500
    let tokenRequests = 0

    installExtensionPageGuards(page, {
      ignoreConsoleErrorPatterns: [
        /403/,
        /New API dashboard authentication could not be exchanged/,
        /Access token is missing/,
      ],
    })
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, {
      baseUrl,
      dashboardAuthMode:
        siteType === SITE_TYPES.NEW_API ? "auth-bundle" : "legacy",
      accessToken: manualToken,
      initialQuota,
    })
    if (siteType === SITE_TYPES.APIYI) {
      await context.addInitScript((origin) => {
        if (location.origin !== origin) return
        localStorage.setItem(
          "USER_STATE",
          JSON.stringify({
            user: { id: 1, username: "e2e-user" },
          }),
        )
        localStorage.setItem("X-S-Token", "e2e-private-session-token")
      }, baseUrl)
      await context.route(`${baseUrl}/api/user/self`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "",
            data: {
              id: 1,
              username: "e2e-user",
              access_token: "",
              quota: initialQuota,
            },
          }),
        })
      })
      await context.route(
        `${baseUrl}/api/user/access_token/`,
        async (route) => {
          tokenRequests += 1
          await route.fulfill({ status: 400, body: "Password required" })
        },
      )
    }
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
    await context.route(
      `${baseUrl}${tokenPagePath.split("#")[0]}`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: `<h1>Security settings</h1><h2 id="security-access">Sessions &amp; Access</h2><label>Access Token<input readonly value="${manualToken}"></label>`,
        })
      },
    )
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
      popupDialog.getByRole("button", { name: openTokenSettingsLabel }),
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
            dialog.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)
              ?.value
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

    await sidePanel.evaluate((view, ids) => {
      const section = view.document.querySelector(
        `[data-testid="${ids.accountFormSectionAuth}"]`,
      )
      const toggle = section?.querySelector<HTMLButtonElement>(
        '[data-slot="collapsible-trigger"]',
      )
      if (toggle?.getAttribute("aria-expanded") === "true") toggle.click()
    }, ACCOUNT_MANAGEMENT_TEST_IDS)

    const securityPagePromise = context.waitForEvent("page")
    await sidePanel.evaluate((view, label) => {
      const button = Array.from(view.document.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === label,
      )
      if (!button || button.disabled)
        throw new Error("Security settings action unavailable")
      button.click()
    }, openTokenSettingsLabel)
    const securityPage = await securityPagePromise
    let securityUrl = ""
    await expect
      .poll(async () => {
        securityUrl = await serviceWorker.evaluate(async () => {
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          })
          return tab?.url ?? ""
        })
        return securityUrl
      })
      .toBe(`${baseUrl}${tokenPagePath}`)
    // tabs.create can navigate before Playwright attaches route interception.
    // Preserve the actual destination, including its section anchor.
    await securityPage.goto(securityUrl)
    await expect(
      securityPage.getByRole("heading", { name: "Security settings" }),
    ).toBeVisible()
    await securityPage.bringToFront()
    await expect
      .poll(() =>
        sidePanel.evaluate((view, ids) => {
          const input = view.document.querySelector<HTMLInputElement>(
            `[data-testid="${ids.accessTokenInput}"]`,
          )
          const body = input?.closest('[data-slot="modal-body"]')
          if (!input || !body) return null

          const inputBounds = input.getBoundingClientRect()
          const bodyBounds = body.getBoundingClientRect()
          return {
            focused: view.document.activeElement === input,
            visible:
              inputBounds.height > 0 &&
              inputBounds.top >= Math.max(0, bodyBounds.top) &&
              inputBounds.bottom <=
                Math.min(view.innerHeight, bodyBounds.bottom),
            protected: input.type === "password",
          }
        }, ACCOUNT_MANAGEMENT_TEST_IDS),
      )
      .toEqual({ focused: true, visible: true, protected: true })
    const copiedToken = await securityPage
      .getByLabel("Access Token")
      .inputValue()
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
        if (!valueSetter)
          throw new Error("Native input value setter unavailable")
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
      siteType,
      baseUrl,
    })
    expect(saved.site_name).toBe("Keep this site name")
    expect(saved.notes).toBe("Keep my popup notes")
    expect(saved.account_info.access_token).toBe(manualToken)
    expect(JSON.stringify(saved)).not.toContain(
      E2E_NEW_API_RC22_AUTH.dashboardToken,
    )
    expect(JSON.stringify(saved)).not.toContain("e2e-private-session-token")
    expect(tokenRequests).toBe(scenario.tokenRequests)

    await openAccountManagementPage({ page: bridge, extensionId })
    await bridge.bringToFront()
    const row = await expectAccountListItemVisible(bridge, saved.id)
    // The deferred save refresh may still be pending; neither its initial quota
    // nor the stored placeholder can satisfy the manual refresh assertion.
    expect(
      (await waitForSavedAccount({ serviceWorker, siteType, baseUrl }))
        .account_info.quota,
    ).not.toBe(refreshedQuota)
    await context.route(`${baseUrl}/api/user/self`, async (route) => {
      if (
        route.request().headers()["authorization"] !== `Bearer ${manualToken}`
      ) {
        await route.fallback()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { id: 1, username: "e2e-user", quota: refreshedQuota },
        }),
      })
    })
    // Desktop row actions only accept pointer events after hover or focus.
    await row.hover()
    await row
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
      .click()
    await bridge
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowRefreshMenuItem)
      .click()
    await expect
      .poll(
        async () =>
          (await waitForSavedAccount({ serviceWorker, siteType, baseUrl }))
            .account_info.quota,
      )
      .toBe(refreshedQuota)

    await verifyAccountModelCatalog({
      page: bridge,
      extensionId,
      accountId: saved.id,
      expectations: { totalModels: 2 },
    })
    for (const model of ["gpt-4o-mini", "gpt-4.1-mini"]) {
      await expect(
        bridge.getByRole("heading", { name: model, exact: true }),
      ).toBeVisible()
    }
    expect(tokenRequests).toBe(scenario.tokenRequests)
  })
}
