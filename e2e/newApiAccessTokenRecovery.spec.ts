import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import type { JSHandle, Page } from "@playwright/test"

import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_ROUTE_PARAMS } from "~/features/AccountManagement/routeParams"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { test as base, expect } from "~~/e2e/fixtures/extensionTest"
import { verifyAccountModelCatalog } from "~~/e2e/scenarios/modelListCatalog"
import {
  E2E_NEW_API_RC22_AUTH,
  forceExtensionLanguage,
  getStoredAccountUsdObservation,
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
import { waitForNewUserFacingCredentialPage } from "~~/e2e/utils/realSite/newApiAccountRecovery"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import { createDeferred } from "~~/tests/test-utils/deferred"

const manualToken = "e2e-manually-copied-management-pat"

function tokenPageHtml(legacy: boolean) {
  return `<!doctype html>
    <meta charset="utf-8">
    <h1>Token page</h1>
    <div style="height: 150vh" aria-hidden="true"></div>
    <template id="credential-content">
      <section ${legacy ? "" : 'aria-labelledby="security-access"'}>
        <h2 ${legacy ? "" : 'id="security-access"'}>${legacy ? "Profile" : "Sessions &amp; Access"}</h2>
        ${legacy ? "" : '<div data-slot="card"><div data-slot="card-title">Login sessions</div></div>'}
        <div ${legacy ? 'class="semi-card"' : 'data-slot="card"'}
          style="max-width: 36rem; margin: auto; padding: 1rem; border-radius: 8px;">
          ${legacy ? "<h6>系统访问令牌</h6>" : '<div data-slot="card-title">Access tokens</div>'}
          <label>Access Token <input readonly value="${manualToken}"></label>
          <button type="button" onclick="this.dataset.activated = 'true'">
            ${legacy ? "创建访问令牌" : "Create access token"}
          </button>
        </div>
      </section>
    </template>
    <div style="height: 100vh" aria-hidden="true"></div>
    <script>
      window.addEventListener("load", () => {
        setTimeout(() => {
          const template = document.querySelector("#credential-content");
          template.replaceWith(template.content);
        }, 750);
      });
    </script>`
}

const test = base.extend<{ profileSite: string }>({
  profileSite: async ({ extensionId }, runFixture) => {
    void extensionId
    // Worker fetches and extension-created tabs can bypass Playwright routes.
    // Serve the profile deployment over loopback so both see the same fixture.
    const server = createServer((request, response) => {
      const path = new URL(request.url ?? "/", "http://localhost").pathname
      response.setHeader(
        "Content-Type",
        path.endsWith(".js") ? "application/javascript" : "text/html",
      )
      if (path === "/") {
        response.end(
          '<title>New API</title><script src="/assets/index.routes.js"></script>',
        )
      } else if (path === "/assets/index.routes.js") {
        response.end('const route = "/_authenticated/profile/";')
      } else if (path === "/profile") {
        response.end(tokenPageHtml(true))
      } else {
        response.writeHead(404)
        response.end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      await runFixture(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      )
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  },
})

// The profile server binds an ephemeral port for each case, alongside its own
// browser context. Keep native multiwindow flows intact while sharing workers.
test.describe.configure({
  mode: process.env.AAH_E2E_USER_DATA_DIR ? "default" : "parallel",
})

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

/** Lets Playwright attach before the opened tab can request the APIyi fixture. */
async function holdCredentialTabNavigation(
  opener: JSHandle<Window & typeof globalThis>,
  destination: string,
) {
  return opener.evaluateHandle((view, url) => {
    let release = () => {}
    const attached = new Promise<void>((resolve) => {
      release = resolve
    })
    const tabs = view.chrome.tabs
    const createTab = tabs.create.bind(tabs)
    tabs.create = async (options) => {
      if (options.url !== url) return createTab(options)
      tabs.create = createTab
      const tab = await createTab({ ...options, url: "about:blank" })
      if (tab.id == null) throw new Error("Credential fixture tab unavailable")
      await attached
      return tabs.update(tab.id, { url })
    }
    return release
  }, destination)
}

test("slow account detection shows inline troubleshooting while pending", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  const baseUrl = "https://slow-detection.example.invalid"
  let detectionRequested = false
  const { promise: responseGate, resolve: releaseResponse } =
    createDeferred<void>()
  await page.emulateMedia({ reducedMotion: "reduce" })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, { baseUrl })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    autoFillCurrentSiteUrlOnAccountAdd: false,
    tempWindowFallback: { enabled: false },
  })
  const sitePage = await context.newPage()
  await sitePage.goto(baseUrl)
  await sitePage.evaluate(() => {
    localStorage.setItem("user", JSON.stringify({ id: 1, username: "owner" }))
  })
  await context.route(`${baseUrl}/api/user/self`, async (route) => {
    detectionRequested = true
    await responseGate
    await route.fulfill({
      status: 401,
      json: { success: false, message: "Sign in again" },
    })
  })

  await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  await sitePage.bringToFront()
  await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
  const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
  await dialog
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
    .fill(baseUrl)
  await dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.authTypeTrigger).click()
  await page.getByRole("option", { name: /Cookie/ }).click()
  const detect = dialog.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton,
  )
  const help = dialog.getByRole("button", { name: "Troubleshooting guide" })
  const status = dialog.getByRole("status").filter({
    hasText: "Auto-detect is taking longer than expected.",
  })
  const cookieNotice = dialog.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.cookiePermissionRecommendation,
  )

  try {
    await page.clock.install()
    await detect.click()
    await expect.poll(() => detectionRequested).toBe(true)
    await expect(help).toBeHidden()
    await page.clock.fastForward(10_000)
    await expect(help).toBeVisible()
    await expect(status).toHaveAttribute("data-tone", "info")
    await expect(
      status.getByRole("button", { name: "Troubleshooting guide" }),
    ).toBeVisible()
    await expect(cookieNotice).toHaveRole("note")
    await expect(cookieNotice).toHaveAttribute("data-tone", "neutral")
    const grantButtonName = "Grant permissions for Cookie multi-account auth"
    const grantButton = cookieNotice.getByRole("button", {
      name: grantButtonName,
    })
    const shortGrantLabel = grantButton.getByText("Grant access", {
      exact: true,
    })
    const fullGrantLabel = grantButton.getByText(grantButtonName, {
      exact: true,
    })

    await page.setViewportSize({ width: 340, height: 680 })
    await expect(shortGrantLabel).toBeVisible()
    await expect(fullGrantLabel).toBeHidden()
    expect(
      await shortGrantLabel.evaluate((label) => {
        const range = document.createRange()
        range.selectNodeContents(label)
        return range.getClientRects().length
      }),
    ).toBe(1)

    await page.setViewportSize({ width: 1249, height: 900 })
    await expect(fullGrantLabel).toBeVisible()
    await expect(shortGrantLabel).toBeHidden()

    await captureVisualViews({
      page,
      ready: help,
      captureTarget: dialog,
      id: "auto-detect-slow-hint",
      extensionDir,
      views: [
        { id: "narrow", width: 340, height: 680, theme: "light" },
        { id: "desktop", width: 1249, height: 900, theme: "light" },
        { id: "dark", width: 1249, height: 900, theme: "dark" },
      ],
    })
  } finally {
    releaseResponse()
  }

  const error = dialog.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage,
  )
  await expect(error).toContainText("rejected")
  await expect(dialog.getByText(/Auto-detect is taking longer/)).toBeHidden()
})

for (const status of [401, 403]) {
  test(`opens help after Cookie auto-detection HTTP ${status}`, async ({
    context,
    extensionId,
    extensionDir,
    page,
  }) => {
    const baseUrl = "https://cookie-help.example.invalid"
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, { baseUrl })
    await context.route(
      "https://all-api-hub.qixing1217.top/en/auto-detect",
      (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<h1>Troubleshooting</h1>",
        }),
    )
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      autoFillCurrentSiteUrlOnAccountAdd: false,
      tempWindowFallback: { enabled: false },
    })
    const sitePage = await context.newPage()
    await sitePage.goto(baseUrl)
    await sitePage.evaluate(() => {
      localStorage.setItem("user", JSON.stringify({ id: 1, username: "owner" }))
    })
    await context.route(`${baseUrl}/api/user/self`, (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "Sign in again" }),
      }),
    )
    await page.goto(`chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`)
    await waitForExtensionRoot(page)
    await expectPermissionOnboardingHidden(page)
    await sitePage.bringToFront()
    await page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton).click()
    const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
    await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput)
      .fill(baseUrl)
    await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.authTypeTrigger)
      .click()
    await page.getByRole("option", { name: /Cookie/ }).click()
    await dialog
      .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton)
      .click()
    await expect(
      dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage),
    ).toContainText(status === 401 ? "rejected" : "Unable to verify right now")
    const help = dialog.getByRole("button", {
      name: "Troubleshooting guide",
      exact: true,
    })
    await captureVisualViews({
      page,
      ready: dialog,
      id: `cookie-help-${status}`,
      extensionDir,
    })
    await expect(help).toBeVisible()
    const opened = context.waitForEvent("page")
    await help.click()
    const docs = await opened
    // Extension-created tabs can navigate before Playwright attaches routes;
    // the documentation host canonicalizes this page to its .html address.
    await expect(docs).toHaveURL(
      /^https:\/\/all-api-hub\.qixing1217\.top\/en\/auto-detect(?:\.html)?$/,
    )
  })
}

for (const scenario of [
  {
    siteType: SITE_TYPES.NEW_API,
    name: "New API",
    baseUrl: "https://new-api-verification.example.invalid",
    tokenPagePath: "/security#security-access",
    openTokenSettingsLabel: "Get from site",
    tokenRequests: 1,
    tokenFailureCode: "SECURITY_PROOF_REQUIRED",
  },
  {
    siteType: SITE_TYPES.NEW_API,
    name: "New API manual completion",
    baseUrl: "https://new-api-manual.example.invalid",
    tokenPagePath: "/security#security-access",
    openTokenSettingsLabel: "Get from site",
    tokenRequests: 1,
    tokenFailureCode: null,
  },
  {
    siteType: SITE_TYPES.NEW_API,
    name: "New API server failure",
    baseUrl: "https://new-api-server.example.invalid",
    tokenPagePath: "/security#security-access",
    openTokenSettingsLabel: "Get from site",
    tokenRequests: 1,
    tokenFailureCode: null,
    tokenFailureStatus: 503,
    expectedFailureMessage: "Server error. Please try again later",
  },
  ...[
    {
      status: 408,
      message: "Auto-detection timeout, please try adding manually",
    },
    { status: 429, message: "Too many requests. Please try again later." },
    { status: 503, message: "Server error. Please try again later" },
    {
      status: 504,
      message: "Auto-detection timeout, please try adding manually",
    },
  ].map(({ status, message }) => ({
    siteType: SITE_TYPES.NEW_API,
    name: `New API empty HTTP ${status}`,
    baseUrl: `https://new-api-empty-${status}.example.invalid`,
    tokenPagePath: "/security#security-access",
    openTokenSettingsLabel: "Get from site",
    tokenRequests: 1,
    tokenFailureCode: null,
    tokenFailureStatus: status,
    tokenFailureEmpty: true,
    expectedFailureMessage: message,
  })),
  {
    siteType: SITE_TYPES.NEW_API,
    name: "Gemai profile",
    baseUrl: null,
    tokenPagePath: "/profile",
    openTokenSettingsLabel: "Get from site",
    tokenRequests: 1,
    tokenFailureCode: "SECURITY_PROOF_REQUIRED",
  },
  {
    siteType: SITE_TYPES.APIYI,
    name: "APIyi",
    baseUrl: "https://api.apiyi.com",
    tokenPagePath: "/account/profile",
    openTokenSettingsLabel: "Open APIyi profile",
    tokenRequests: 0,
    tokenFailureCode: "SECURITY_PROOF_REQUIRED",
  },
] as const) {
  test(`continues ${scenario.name} token recovery after closing the popup`, async ({
    context,
    extensionId,
    extensionDir,
    page,
    profileSite,
  }) => {
    // CI completes this multiwindow flow plus authenticated model validation in
    // about 64s. Add 30s to its body budget while keeping the fixture's startup
    // allowance and every action/assertion timeout unchanged. Preserve unlimited
    // runs when the caller selects --timeout=0.
    const currentTimeout = test.info().timeout
    if (currentTimeout > 0) test.setTimeout(currentTimeout + 30_000)
    const { tokenPagePath, openTokenSettingsLabel, siteType } = scenario
    const baseUrl = scenario.baseUrl ?? profileSite
    const tokenFailureStatus =
      "tokenFailureStatus" in scenario ? scenario.tokenFailureStatus : 403
    const initialQuota = 1000
    const refreshedQuota = 2500
    let tokenRequests = 0

    installExtensionPageGuards(page, {
      ignoreConsoleErrorPatterns: [
        new RegExp(
          `Failed to load resource: the server responded with a status of ${tokenFailureStatus}\\b`,
        ),
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
    if (siteType === SITE_TYPES.NEW_API) {
      // Both deployments use the same theme; probe their actual frontend routes.
      await context.route(`${baseUrl}/`, (route) =>
        route.fulfill({
          contentType: "text/html",
          headers: {
            "set-cookie": `${E2E_NEW_API_RC22_AUTH.refreshCookie}; HttpOnly; Secure; SameSite=Lax; Path=/`,
          },
          body: '<title>New API</title><script src="/assets/index.routes.js"></script>',
        }),
      )
      await context.route(`${baseUrl}/assets/index.routes.js`, (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body:
            tokenPagePath === "/profile"
              ? 'const route = "/_authenticated/profile/";'
              : 'const route = "/_authenticated/security/";',
        }),
      )
    }
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
        status: tokenFailureStatus,
        contentType: "application/json",
        headers: tokenFailureStatus === 429 ? { "retry-after": "60" } : {},
        body:
          "tokenFailureEmpty" in scenario && scenario.tokenFailureEmpty
            ? ""
            : JSON.stringify({
                success: false,
                ...(scenario.tokenFailureCode
                  ? { code: scenario.tokenFailureCode }
                  : {}),
                message: scenario.tokenFailureCode
                  ? "Security verification required"
                  : "Token creation unavailable",
              }),
      })
    })
    await context.route(
      `${baseUrl}${tokenPagePath.split("#")[0]}`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: tokenPageHtml(tokenPagePath !== "/security#security-access"),
        })
      },
    )
    const serviceWorker = await getServiceWorker(context)
    await seedUserPreferences(serviceWorker, {
      autoProvisionKeyOnAccountAdd: false,
      // This flow enters its URL manually; an asynchronous active-tab prefill
      // must not race Playwright's fill operation.
      autoFillCurrentSiteUrlOnAccountAdd: false,
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

    const supportsNativeSidePanel = await page.evaluate(
      () =>
        typeof chrome.sidePanel?.open === "function" &&
        typeof navigator.locks?.request === "function",
    )
    // Opening a Playwright page activates its tab. Prepare the message bridge
    // before recovery opens the user's credential tab so it cannot steal focus
    // from the page that waitForNewUserFacingCredentialPage must identify.
    const bridge = await context.newPage()
    await bridge.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#about`,
    )
    await page.bringToFront()
    let recoveryView: JSHandle<Window & typeof globalThis>
    let securityPagePromise: ReturnType<
      typeof waitForNewUserFacingCredentialPage
    >

    if (siteType === SITE_TYPES.NEW_API) {
      await expect(
        popupDialog.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage,
        ),
      ).toHaveText(`Account detected (e2e-user · ${new URL(baseUrl).host})`)
      await expect(
        popupDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
      ).toBeFocused()
      await expect(
        popupDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
      ).toHaveCount(0)
      await expect(
        popupDialog.getByText(
          supportsNativeSidePanel
            ? "Creating a token or getting one from the site continues in the side panel with this form kept, or in a full page if the side panel cannot open."
            : "Creating a token or getting one from the site continues in a full page so this form stays open.",
        ),
      ).toBeVisible()
      await captureVisualViews({
        page,
        ready: popupDialog,
        id: `token-recovery-popup-${scenario.name.toLowerCase().replaceAll(" ", "-")}`,
        extensionDir,
      })

      await popupDialog.getByRole("button", { name: "Open full form" }).click()
      await expect(
        popupDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput),
      ).toHaveValue("1")
      await popupDialog
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput)
        .fill("Keep this site name")
      await popupDialog
        .getByPlaceholder("Optional, enter notes")
        .fill("Keep my popup notes")

      const sourceWindowId = await page.evaluate(
        async () => (await chrome.windows.getCurrent()).id,
      )
      if (sourceWindowId == null) {
        throw new Error("Credential recovery requires the source window")
      }
      securityPagePromise = waitForNewUserFacingCredentialPage(
        context,
        serviceWorker,
        sourceWindowId,
      )
      const openSiteButton = popupDialog.getByRole("button", {
        name: openTokenSettingsLabel,
        exact: true,
      })
      if (supportsNativeSidePanel) {
        await openSiteButton.click()
        recoveryView = await getNativeSidePanel(bridge)
      } else {
        const [fullPage] = await Promise.all([
          context.waitForEvent("page", {
            predicate: (candidate) =>
              candidate.url().includes(`/${OPTIONS_PAGE_PATH}`) ||
              candidate.url() === "about:blank",
          }),
          openSiteButton.click(),
        ])
        await expect(fullPage).toHaveURL(
          (url) =>
            url.protocol === "chrome-extension:" &&
            url.hostname === extensionId &&
            url.pathname === `/${OPTIONS_PAGE_PATH}` &&
            url.searchParams.has(
              ACCOUNT_MANAGEMENT_ROUTE_PARAMS.AccountDialogRecovery,
            ) &&
            url.hash === `#${MENU_ITEM_IDS.ACCOUNT}`,
        )
        await waitForExtensionRoot(fullPage)
        recoveryView = await fullPage.evaluateHandle(() => window)
      }
      await expect.poll(() => page.isClosed()).toBe(true)
    } else {
      await expect(
        popupDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput),
      ).toHaveValue("1")
      await expect(
        popupDialog.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage,
        ),
      ).toBeVisible()
      await captureVisualViews({
        page,
        ready: popupDialog,
        id: `token-recovery-popup-${scenario.name.toLowerCase().replaceAll(" ", "-")}`,
        extensionDir,
      })
      await expect(
        popupDialog.getByRole("heading", {
          name: "Enter an Access Token manually",
        }),
      ).toBeVisible()
      await expect(
        popupDialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
      ).not.toBeFocused()
      const originalFailureMessage = await popupDialog
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage)
        .innerText()
      await popupDialog
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput)
        .fill("Keep this site name")
      await popupDialog
        .getByPlaceholder("Optional, enter notes")
        .fill("Keep my popup notes")
      await expect(
        popupDialog.getByRole("button", { name: openTokenSettingsLabel }),
      ).toHaveCount(0)

      if (supportsNativeSidePanel) {
        await popupDialog
          .getByRole("button", { name: "Continue in side panel", exact: true })
          .click()
        recoveryView = await getNativeSidePanel(bridge)
      } else {
        const [fullPage] = await Promise.all([
          context.waitForEvent("page"),
          popupDialog
            .getByRole("button", { name: "Continue in full page", exact: true })
            .click(),
        ])
        await expect(fullPage).toHaveURL(
          (url) =>
            url.protocol === "chrome-extension:" &&
            url.hostname === extensionId &&
            url.pathname === `/${OPTIONS_PAGE_PATH}` &&
            url.searchParams.has(
              ACCOUNT_MANAGEMENT_ROUTE_PARAMS.AccountDialogRecovery,
            ) &&
            url.hash === `#${MENU_ITEM_IDS.ACCOUNT}`,
        )
        await waitForExtensionRoot(fullPage)
        recoveryView = await fullPage.evaluateHandle(() => window)
      }
      await expect.poll(() => page.isClosed()).toBe(true)

      await expect
        .poll(() =>
          recoveryView.evaluate((view, ids) => {
            const dialog = view.document.querySelector(
              `[data-testid="${ids.accountDialog}"]`,
            )
            return dialog?.querySelector(
              `[data-testid="${ids.autoDetectErrorMessage}"]`,
            )?.textContent
          }, ACCOUNT_MANAGEMENT_TEST_IDS),
        )
        .toBe(originalFailureMessage)

      await recoveryView.evaluate((view, id) => {
        const save = view.document.querySelector<HTMLButtonElement>(
          `[data-testid="${id}"]`,
        )
        if (!save || save.disabled || save.type !== "submit")
          throw new Error("Save cannot review the incomplete recovered draft")
        save.click()
      }, ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton)
      await expect
        .poll(() =>
          recoveryView.evaluate((view, id) => {
            const token = view.document.querySelector(`[data-testid="${id}"]`)
            return (
              token?.getAttribute("aria-invalid") === "true" &&
              view.document.activeElement === token
            )
          }, ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
        )
        .toBe(true)

      await recoveryView.evaluate((view, ids) => {
        const section = view.document.querySelector(
          `[data-testid="${ids.accountFormSectionAuth}"]`,
        )
        const toggle = section?.querySelector<HTMLButtonElement>(
          '[data-slot="collapsible-trigger"]',
        )
        if (toggle?.getAttribute("aria-expanded") === "true") toggle.click()
      }, ACCOUNT_MANAGEMENT_TEST_IDS)

      // Route discovery may open a temporary window at the exact same URL.
      // Match the document in the user's window, not the first matching URL.
      const sourceTab = await bridge.evaluate(() => chrome.tabs.getCurrent())
      if (sourceTab?.windowId == null) {
        throw new Error("Credential recovery requires the source window")
      }
      securityPagePromise = waitForNewUserFacingCredentialPage(
        context,
        serviceWorker,
        sourceTab.windowId,
      )
      const releaseNavigation = await holdCredentialTabNavigation(
        recoveryView,
        `${baseUrl}${tokenPagePath}`,
      )
      await Promise.all([
        context.waitForEvent("page"),
        recoveryView.evaluate((view, label) => {
          const button = Array.from(
            view.document.querySelectorAll("button"),
          ).find((candidate) => candidate.textContent?.trim() === label)
          if (!button || button.disabled)
            throw new Error("Security settings action unavailable")
          button.click()
        }, openTokenSettingsLabel),
      ])
      await releaseNavigation.evaluate((release) => release())
      await releaseNavigation.dispose()
    }
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
    await expect(securityPage).toHaveURL(securityUrl)
    await expect(
      securityPage.getByRole("heading", { name: "Token page" }),
    ).toBeVisible()
    const tokenControl = securityPage.getByRole("button", {
      name:
        tokenPagePath === "/security#security-access"
          ? "Create access token"
          : "创建访问令牌",
    })
    const credentialCard = securityPage
      .locator('[data-slot="card"], .semi-card')
      .filter({ has: tokenControl })
    const cueMarker = "data-all-api-hub-highlight"
    if (siteType === SITE_TYPES.NEW_API) {
      await expect(credentialCard).toHaveAttribute(cueMarker, "access-token")
      await expect(tokenControl).toHaveAttribute(cueMarker, "access-token")
      await expect(securityPage.locator("section")).not.toHaveAttribute(
        cueMarker,
      )
      await expect
        .poll(() =>
          credentialCard.evaluate((card) => {
            const { top, height } = card.getBoundingClientRect()
            return Math.abs(top + height / 2 - window.innerHeight / 2)
          }),
        )
        .toBeLessThan(8)
      const cueScreenshot = test.info().outputPath("access-token-highlight.png")
      await securityPage.screenshot({ path: cueScreenshot })
      await test
        .info()
        .attach("Access Token highlight", { path: cueScreenshot })
      await expect(credentialCard).not.toHaveAttribute(cueMarker)
    }
    await expect(tokenControl).not.toHaveAttribute(cueMarker)
    await expect(tokenControl).not.toHaveAttribute("data-activated")
    await securityPage.bringToFront()
    await expect
      .poll(() =>
        recoveryView.evaluate((view, ids) => {
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
    await recoveryView.evaluate(
      (view, { id, token }) => {
        const input = view.document.querySelector<HTMLInputElement>(
          `[data-testid="${id}"]`,
        )
        if (!input) throw new Error("Manual Access Token field unavailable")
        const clipboardData = new view.DataTransfer()
        clipboardData.setData("text/plain", token)
        const useDefault = input.dispatchEvent(
          new view.ClipboardEvent("paste", {
            clipboardData,
            bubbles: true,
            cancelable: true,
          }),
        )
        if (!useDefault) return
        // Synthetic clipboard events cannot apply the browser's default paste.
        const valueSetter = Object.getOwnPropertyDescriptor(
          view.HTMLInputElement.prototype,
          "value",
        )?.set
        if (!valueSetter)
          throw new Error("Native input value setter unavailable")
        valueSetter.call(input, token)
        input.dispatchEvent(new view.Event("input", { bubbles: true }))
      },
      {
        id: ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput,
        token: copiedToken,
      },
    )
    await expect
      .poll(() =>
        recoveryView.evaluate((view, id) => {
          const button = view.document.querySelector<HTMLButtonElement>(
            `[data-testid="${id}"]`,
          )
          return button?.disabled
        }, ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton),
      )
      .toBe(false)
    await expect
      .poll(() =>
        recoveryView.evaluate((view, ids) => {
          const dialog = view.document.querySelector(
            `[data-testid="${ids.accountDialog}"]`,
          )
          const value = (id: string) =>
            dialog?.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)
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
    const postSaveRefresh = await bridge.evaluateHandle((action) => {
      const observed = { accountIds: [] as string[] }
      const listener = (message: {
        action?: string
        updatedAccountIds?: string[]
      }) => {
        if (message.action !== action) return
        observed.accountIds = message.updatedAccountIds ?? []
        chrome.runtime.onMessage.removeListener(listener)
      }
      chrome.runtime.onMessage.addListener(listener)
      return observed
    }, RuntimeActionIds.AccountRefreshCompleted)
    await recoveryView.evaluate((view, id) => {
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

    // Saving starts an independent refresh. Await its completion before any
    // request can receive the quota reserved for the explicit row refresh.
    await expect
      .poll(() => postSaveRefresh.evaluate((observed) => observed.accountIds))
      .toEqual([saved.id])
    await postSaveRefresh.dispose()

    await openAccountManagementPage({ page: bridge, extensionId })
    await bridge.bringToFront()
    const row = await expectAccountListItemVisible(bridge, saved.id)
    expect(
      getStoredAccountUsdObservation(
        await waitForSavedAccount({ serviceWorker, siteType, baseUrl }),
      ),
    ).not.toEqual(expect.objectContaining({ status: "known", value: "0.005" }))
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
      .poll(async () =>
        getStoredAccountUsdObservation(
          await waitForSavedAccount({ serviceWorker, siteType, baseUrl }),
        ),
      )
      .toMatchObject({ status: "known", value: "0.005" })

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

test("inspects rendered credential pages without generating tokens", async ({
  context,
  extensionId,
  page,
}) => {
  const origin = "https://credential-render.example.invalid"
  let writes = 0
  await context.route(`${origin}/**`, async (route) => {
    const request = route.request()
    if (request.method() !== "GET") writes += 1
    const path = new URL(request.url()).pathname
    const htmlByPath: Record<string, string> = {
      "/profile": "<h1>Profile</h1><button>Access Token</button>",
      "/console/personal":
        '<div class="semi-card"><div role="tab" data-tabkey="semiTabsecurity">Security Settings</div></div>',
    }
    await route.fulfill({
      contentType: "text/html",
      body:
        htmlByPath[path] ??
        '<div class="semi-empty-description">Page not found, please check if your browser address is correct</div>',
    })
  })
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    tempWindowFallback: { enabled: true },
  })
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  for (const [path, state] of [
    ["/security", "not_found"],
    ["/profile", "credential"],
    ["/console/personal", "credential"],
  ]) {
    const result = await page.evaluate(
      async ({ originUrl, action }) =>
        chrome.runtime.sendMessage({
          action,
          execution: {
            version: 2,
            kind: "user_command",
            command: "detect_account",
            surface: "options",
          },
          task: { kind: "credential_page_inspect", params: { originUrl } },
        }),
      {
        originUrl: origin + path,
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
      },
    )
    expect(result).toMatchObject({ success: true, state })
  }
  expect(writes).toBe(0)
})
