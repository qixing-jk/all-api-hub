import { generateKeyPairSync, randomBytes } from "node:crypto"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  E2E_NEW_API_RC22_AUTH,
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  autoDetectAccountFromAddDialog,
  openAccountManagementPage,
  waitForSavedAccount,
} from "~~/e2e/utils/realSite/accountAdd"
import { waitForNewUserFacingCredentialPage } from "~~/e2e/utils/realSite/newApiAccountRecovery"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"
import { createDeferred } from "~~/tests/test-utils/deferred"

const tokenSetupViews = [
  { id: "desktop", width: 1249, height: 900, theme: "light" as const },
  { id: "narrow", width: 340, height: 680, theme: "light" as const },
  { id: "dark", width: 1249, height: 900, theme: "dark" as const },
]
const verifiedTokenMessage =
  "Access token verified. Review your account details, then save."

/** Dispatch the same paste event the account field handles for a copied token. */
async function pasteAccessToken(
  input: import("@playwright/test").Locator,
  token: string,
) {
  await input.evaluate((element, value) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/plain", value)
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    )
  }, token)
}

test("an unlisted New API site offers its website when extension setup stalls or fails", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  if (process.env.AAH_VISUAL_CAPTURE_DIR) test.setTimeout(120_000)
  const origin = "https://self-hosted-new-api.example.invalid"
  const { promise: catalogGate, resolve: releaseCatalog } =
    createDeferred<void>()
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl: origin,
    dashboardAuthMode: "auth-bundle",
  })
  await context.route(`${origin}/`, (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: {
        "set-cookie": `${E2E_NEW_API_RC22_AUTH.refreshCookie}; HttpOnly; Secure; SameSite=Lax; Path=/`,
      },
      body: '<title>New API</title><script src="/assets/index.routes.js"></script>',
    }),
  )
  await context.route(`${origin}/assets/index.routes.js`, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'const route = "/_authenticated/profile/";',
    }),
  )
  await context.route(`${origin}/security`, (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/html",
      body: "<h1>404</h1>",
    }),
  )
  await context.route(`${origin}/profile`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<section aria-labelledby="security-access"><h1 id="security-access">Access Tokens</h1></section>',
    }),
  )
  await context.route(`${origin}/api/user/access_tokens**`, async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/catalog")) {
      await catalogGate
      return route.fulfill({ status: 503, json: { success: false } })
    }
    expect(route.request().method()).toBe("GET")
    return route.fulfill({ json: { success: true, data: { items: [] } } })
  })
  await context.route(`${origin}/api/verify/methods**`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          scope: "access_token.generate",
          methods: [{ method: "password", available: true }],
          oauth_providers: [],
          password_encryption_enabled: false,
        },
      },
    }),
  )
  const site = await context.newPage()
  await site.goto(origin)
  try {
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      autoFillCurrentSiteUrlOnAccountAdd: false,
      openChangelogOnUpdate: false,
    })
    await openAccountManagementPage({ page, extensionId })
    const dialog = await autoDetectAccountFromAddDialog(page, origin)
    const footer = dialog.dialog.locator('[data-slot="modal-footer"]')
    const footerActions = footer.getByRole("group", { name: "Access Token" })
    const siteAction = footerActions.getByRole("button", {
      name: "Get from site",
    })
    const createInExtension = footerActions.getByRole("button", {
      name: "Create token in extension",
    })
    const cancel = footer.getByRole("button", { name: "Cancel" })
    await expect(siteAction).toBeVisible()
    await expect(createInExtension).toBeVisible()
    await expect(
      createInExtension.locator("svg.lucide-shield-plus"),
    ).toBeVisible()
    await expect(footerActions.getByRole("button")).toHaveText([
      "Get from site",
      "Create token in extension",
    ])
    await expect(
      dialog.dialog.getByText(
        "Account detected (e2e-user · self-hosted-new-api.example.invalid)",
      ),
    ).toBeVisible()
    await expect(dialog.accessTokenInput).toHaveAttribute(
      "placeholder",
      "Paste full access token",
    )
    await captureVisualViews({
      page,
      ready: siteAction,
      captureTarget: dialog.dialog,
      id: "token-setup-entry",
      extensionDir,
      views: tokenSetupViews,
    })
    const originalViewport = page.viewportSize()!
    for (const view of tokenSetupViews.filter(
      ({ theme }) => theme === "light",
    )) {
      await page.setViewportSize({ width: view.width, height: view.height })
      await expect(
        dialog.dialog.getByRole("button", { name: "Close", exact: true }),
      ).toBeVisible()
      const [siteBox, createBox] = await Promise.all([
        siteAction.boundingBox(),
        createInExtension.boundingBox(),
      ])
      if (!siteBox || !createBox) throw new Error("Missing token actions")
      const footerBounds = await footer.evaluate((element) => {
        const { left, right } = element.getBoundingClientRect()
        const { paddingLeft, paddingRight } = getComputedStyle(element)
        return {
          left: left + parseFloat(paddingLeft),
          right: right - parseFloat(paddingRight),
          overflow: element.scrollWidth - element.clientWidth,
        }
      })
      expect(footerBounds.overflow).toBe(0)
      expect(
        Math.abs(createBox.x + createBox.width - footerBounds.right),
      ).toBeLessThan(1)
      if (view.id === "narrow") {
        await expect(cancel).toBeHidden()
        expect(createBox.y + createBox.height).toBeLessThan(siteBox.y)
        expect(Math.abs(createBox.x - footerBounds.left)).toBeLessThan(1)
        expect(Math.abs(siteBox.x - footerBounds.left)).toBeLessThan(1)
        expect(
          Math.abs(siteBox.x + siteBox.width - footerBounds.right),
        ).toBeLessThan(1)
      } else {
        await expect(cancel).toBeVisible()
        const cancelBox = await cancel.boundingBox()
        if (!cancelBox) throw new Error("Missing desktop Cancel action")
        expect(Math.abs(cancelBox.x - footerBounds.left)).toBeLessThan(1)
        expect(Math.abs(cancelBox.y - siteBox.y)).toBeLessThan(2)
        expect(Math.abs(siteBox.y - createBox.y)).toBeLessThan(2)
        expect(cancelBox.x + cancelBox.width).toBeLessThan(siteBox.x)
        expect(siteBox.x + siteBox.width).toBeLessThan(createBox.x)
      }
    }
    await page.setViewportSize(originalViewport)
    const manualSetup = dialog.dialog.getByRole("button", {
      name: "Token instructions",
    })
    await expect(
      dialog.dialog.getByRole("button", { name: "Manual setup docs" }),
    ).toBeVisible()
    await manualSetup.click()
    const instructions = page.getByRole("dialog", {
      name: "Token instructions",
    })
    await expect(instructions).toBeVisible()
    await expect(instructions).toContainText(/Create a token in the extension/)
    await expect(instructions).toContainText(
      /Paste the full token into the Access Token field/,
    )
    await expect(
      instructions.getByText(/Regenerate replaces the current token/),
    ).toBeVisible()
    await expect(instructions.getByRole("note")).toContainText(
      "Creating a scoped access token keeps existing tokens valid.",
    )
    await captureVisualViews({
      page,
      ready: instructions,
      id: "token-manual-expanded",
      extensionDir,
      beforeCapture: async () => {
        await page.keyboard.press("Escape")
        await expect(instructions).toBeHidden()
        await manualSetup.click()
      },
      views: tokenSetupViews,
    })
    await page.keyboard.press("Escape")
    await expect(instructions).toBeHidden()
    await expect(manualSetup).toBeFocused()
    await expect(dialog.accessTokenInput).toHaveAccessibleDescription(
      "Paste an existing token to open the full form. Use the buttons below to create or get one.",
    )
    const source = await page.evaluate(() => chrome.tabs.getCurrent())
    if (source?.windowId == null) throw new Error("Account window unavailable")
    const [openedFromFooter] = await Promise.all([
      waitForNewUserFacingCredentialPage(context, worker, source.windowId),
      siteAction.click(),
    ])
    try {
      await expect(openedFromFooter).toHaveURL(`${origin}/profile`)
      await page.bringToFront()
      await expect(dialog.accessTokenInput).toBeFocused()
    } finally {
      await openedFromFooter.close()
    }
    await createInExtension.click()
    await expect(
      dialog.dialog.getByText("Loading...", { exact: true }),
    ).toBeVisible()
    await expect(footer).toBeAttached()
    await expect(footer).toHaveCSS("display", "none")
    const spinner = dialog.dialog.locator('[data-slot="spinner"]')
    await captureVisualViews({
      page,
      ready: spinner,
      captureTarget: dialog.dialog,
      id: "token-creation-loading",
      extensionDir,
      views: tokenSetupViews.filter(({ id }) => id !== "narrow"),
    })
    const fallback = dialog.dialog.getByRole("button", {
      name: "Create token on the site",
    })
    await expect(
      dialog.dialog.getByText("Still loading…", { exact: true }),
    ).toBeVisible()
    await expect(fallback).toBeVisible()
    await expect(fallback).toHaveAccessibleDescription(
      /Loading is taking longer than expected.*create a token on the site and paste the full token here/,
    )
    const [spinnerBox, dialogBox] = await Promise.all([
      spinner.boundingBox(),
      dialog.dialog.boundingBox(),
    ])
    if (!spinnerBox || !dialogBox)
      throw new Error("Loading display unavailable")
    expect(
      Math.abs(
        spinnerBox.x +
          spinnerBox.width / 2 -
          (dialogBox.x + dialogBox.width / 2),
      ),
    ).toBeLessThan(2)
    await captureVisualViews({
      page,
      ready: fallback,
      captureTarget: dialog.dialog,
      id: "token-creation-slow",
      extensionDir,
      views: tokenSetupViews,
    })
    releaseCatalog()
    const retry = footer.getByRole("button", { name: "Retry", exact: true })
    await expect(footer).toBeVisible()
    await expect(retry).toBeVisible()
    await expect(retry).toHaveAttribute("data-variant", "default")
    await expect(
      dialog.dialog.getByRole("alert").filter({
        hasText: "Token creation options unavailable",
      }),
    ).toHaveAttribute("data-slot", "inline-message")
    await expect(
      dialog.dialog.getByRole("button", { name: "Back to account" }),
    ).toBeEnabled()
    await expect(fallback).toBeVisible()
    await expect(fallback).toHaveAccessibleDescription(
      /Token creation in the extension is unavailable right now.*create a token on the site and paste the full token here/,
    )
    await captureVisualViews({
      page,
      ready: retry,
      captureTarget: dialog.dialog,
      id: "token-creation-options-failed",
      extensionDir,
      views: tokenSetupViews.slice(0, 1),
    })
    const [credentialPage] = await Promise.all([
      waitForNewUserFacingCredentialPage(context, worker, source.windowId),
      fallback.click(),
    ])
    try {
      await expect(credentialPage).toHaveURL(`${origin}/profile`)
      await page.bringToFront()
      await expect(dialog.accessTokenInput).toBeFocused()
      await expect(dialog.accessTokenInput).toBeEmpty()
    } finally {
      await credentialPage.close()
    }
  } finally {
    releaseCatalog()
    await site.close()
  }
})

test("the New API connection error offers recovery in the dialog footer", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  if (process.env.AAH_VISUAL_CAPTURE_DIR) test.setTimeout(160_000)
  const origin = "https://token-connection-error.example.invalid"
  let refreshError: 401 | 404 | undefined
  await forceExtensionLanguage(page, "en")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl: origin,
    dashboardAuthMode: "auth-bundle",
  })
  await context.route(`${origin}/api/user/auth/refresh`, (route) =>
    refreshError
      ? route.fulfill({ status: refreshError, json: { success: false } })
      : route.fallback(),
  )
  await context.route(`${origin}/api/user/access_tokens**`, (route) => {
    if (!new URL(route.request().url()).pathname.endsWith("/catalog"))
      return route.fulfill({ json: { success: true, data: { items: [] } } })
    return route.fulfill({
      json: {
        success: true,
        data: {
          default_expiry_days: 30,
          max_tokens: 20,
          groups: [
            {
              group: "personal",
              resources: [
                {
                  resource: "profile",
                  label_key: "Profile",
                  actions: [{ action: "read", label_key: "Read" }],
                },
              ],
            },
          ],
        },
      },
    })
  })
  await context.route(`${origin}/api/verify/methods**`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          scope: "access_token.generate",
          methods: [{ method: "password", available: true }],
          oauth_providers: [],
          password_encryption_enabled: false,
        },
      },
    }),
  )
  const site = await context.newPage()
  await site.goto(origin)
  try {
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      autoFillCurrentSiteUrlOnAccountAdd: false,
      openChangelogOnUpdate: false,
    })
    await openAccountManagementPage({ page, extensionId })
    const dialog = await autoDetectAccountFromAddDialog(page, origin)
    const footer = dialog.dialog.locator('[data-slot="modal-footer"]')
    const openSite = footer.getByRole("button", { name: "Open site page" })
    const retry = footer.getByRole("button", { name: "Retry", exact: true })
    const back = dialog.dialog.getByRole("button", { name: "Back to account" })
    const createInExtension = footer.getByRole("button", {
      name: "Create token in extension",
    })
    await expect(createInExtension).toBeVisible()
    refreshError = 401
    await createInExtension.click()
    const sessionError = dialog.dialog.getByRole("alert").filter({
      hasText: "Could not connect to your site session.",
    })
    await expect(sessionError).toHaveAttribute("data-slot", "inline-message")
    await expect(sessionError).toHaveAttribute("data-tone", "warning")
    const siteAction = dialog.dialog.getByRole("button", {
      name: "Create token on the site",
    })
    await expect(siteAction).toHaveAccessibleDescription(
      /Token creation in the extension is unavailable/,
    )
    await expect(back).toBeEnabled()
    await expect(footer).toBeVisible()
    await expect(openSite).toHaveAttribute("data-variant", "outline")
    await expect(retry).toHaveAttribute("data-variant", "default")
    await captureVisualViews({
      page,
      ready: sessionError,
      captureTarget: dialog.dialog,
      id: "token-creation-session-failed",
      extensionDir,
      views: tokenSetupViews,
    })
    await openSite.click()
    await expect
      .poll(() =>
        page.evaluate(async (origin) => {
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          })
          return tab?.url?.startsWith(origin)
        }, origin),
      )
      .toBe(true)
    await page.bringToFront()

    refreshError = 404
    await retry.click()
    const unsupported = dialog.dialog.getByRole("alert").filter({
      hasText:
        "This deployment does not support creating scoped access tokens in the extension.",
    })
    await expect(unsupported).toBeVisible()
    await expect(openSite).toHaveCount(0)
    await expect(retry).toHaveAttribute("data-variant", "outline")
    await expect(
      footer.getByRole("button", { name: "Create token on the site" }),
    ).toHaveAttribute("data-variant", "default")
    await captureVisualViews({
      page,
      ready: unsupported,
      captureTarget: dialog.dialog,
      id: "token-creation-unsupported",
      extensionDir,
      views: tokenSetupViews.slice(0, 1),
    })

    refreshError = undefined
    await retry.click()
    await expect(
      dialog.dialog.getByLabel("Account password", { exact: true }),
    ).toBeVisible()
    await back.click()
    await expect(dialog.accessTokenInput).toBeEmpty()
    await expect(dialog.accessTokenInput).toBeFocused()
  } finally {
    await site.close()
  }
})

test("a detected New API token opens the full form directly", async ({
  context,
  page,
  extensionId,
}) => {
  const origin = "https://token-detected.example.invalid"
  const token = "nap_detected-fixture"
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl: origin,
    dashboardAuthMode: "auth-bundle",
    accessToken: token,
  })
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    autoFillCurrentSiteUrlOnAccountAdd: false,
    openChangelogOnUpdate: false,
    tempWindowFallback: { enabled: false },
  })
  const site = await context.newPage()
  try {
    await site.goto(origin)
    await openAccountManagementPage({ page, extensionId })
    const dialog = await autoDetectAccountFromAddDialog(page, origin, () =>
      site.bringToFront(),
    )
    await expect(dialog.siteNameInput).toHaveValue("Example")
    await expect(dialog.userIdInput).toHaveValue("1")
    await expect(dialog.accessTokenInput).toHaveValue(token)
    await expect(dialog.confirmAddButton).toBeEnabled()
    await expect(
      dialog.dialog.getByRole("heading", { name: /Add an Access Token/ }),
    ).toBeHidden()
  } finally {
    await site.close()
  }
})

for (const trigger of ["paste", "pause", "blur", "Enter"] as const) {
  test(`compact token entry opens the full form on ${trigger}`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }) => {
    if (process.env.AAH_VISUAL_CAPTURE_DIR) test.setTimeout(120_000)
    const origin = "https://token-manual-entry.example.invalid"
    const token = "nap_manually-entered-fixture"
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, {
      baseUrl: origin,
      dashboardAuthMode: "auth-bundle",
      accessToken: token,
    })
    await context.route(`${origin}/api/user/access_tokens**`, (route) =>
      route.fulfill({ json: { success: true, data: { items: [] } } }),
    )
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      autoFillCurrentSiteUrlOnAccountAdd: false,
      openChangelogOnUpdate: false,
    })
    const site = await context.newPage()
    try {
      await site.goto(origin)
      await openAccountManagementPage({ page, extensionId })
      const dialog = await autoDetectAccountFromAddDialog(page, origin)
      const heading = dialog.dialog.getByRole("heading", {
        name: /Add an Access Token/,
      })
      const create = dialog.dialog.getByRole("button", {
        name: "Create token in extension",
      })
      await expect(heading).toBeVisible()
      await expect(dialog.accessTokenInput).toBeFocused()
      const now = Date.now()
      await page.clock.install({ time: now })
      await page.clock.pauseAt(now + 1000)
      if (trigger === "paste") {
        await pasteAccessToken(dialog.accessTokenInput, token)
      } else {
        await dialog.accessTokenInput.pressSequentially(token)
        await expect(heading).toBeVisible()
        await expect(create).toBeVisible()
        await expect(dialog.confirmAddButton).toBeHidden()
        if (trigger === "pause") {
          await page.clock.runFor(600)
          await dialog.accessTokenInput.clear()
          await page.clock.runFor(800)
          await expect(heading).toBeVisible()
          await expect(create).toBeVisible()
          await dialog.accessTokenInput.pressSequentially(token)
          await page.clock.runFor(799)
          await expect(heading).toBeVisible()
          await page.clock.runFor(1)
        } else if (trigger === "blur") {
          await dialog.accessTokenInput.blur()
        } else {
          await dialog.accessTokenInput.press("Enter")
        }
      }
      await expect(dialog.userIdInput).toHaveValue("1")
      await expect(dialog.accessTokenInput).toHaveValue(token)
      await expect(dialog.confirmAddButton).toBeEnabled()
      await expect(heading).toBeHidden()
      if (trigger !== "blur")
        await expect(dialog.accessTokenInput).toBeFocused()
      await page.clock.resume()
      await expect(
        dialog.dialog
          .getByRole("status")
          .filter({ hasText: verifiedTokenMessage }),
      ).toHaveAttribute("data-tone", "success")
      if (trigger === "paste") {
        await page.emulateMedia({ reducedMotion: "reduce" })
        await captureVisualViews({
          page,
          ready: dialog.accessTokenInput,
          captureTarget: dialog.dialog,
          id: "token-manual-paste-full",
          extensionDir,
          views: tokenSetupViews,
        })
      }
    } finally {
      await site.close()
    }
  })
}

for (const scenario of [
  "valid",
  "invalid",
  "mismatch",
  "mismatch-replaced",
] as const) {
  const replaceMismatch = scenario === "mismatch-replaced"
  const outcome = replaceMismatch ? "mismatch" : scenario
  test(`pasted token verification is advisory when the token is ${scenario}`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }) => {
    if (process.env.AAH_VISUAL_CAPTURE_DIR) test.setTimeout(120_000)
    const origin = `https://verify-token-${outcome}.example.invalid`
    const token = `nap_fixture-${outcome}`
    const replacement = "nap_fixture-replacement"
    const pending = createDeferred<void>()
    let observedChecks = 0
    await forceExtensionLanguage(page, "en")
    await page.emulateMedia({ reducedMotion: "reduce" })
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, {
      baseUrl: origin,
      dashboardAuthMode: "auth-bundle",
      accessToken: outcome === "mismatch" ? replacement : token,
    })
    await context.route(`${origin}/api/user/access_tokens**`, (route) =>
      route.fulfill({ json: { success: true, data: { items: [] } } }),
    )
    await context.route(`${origin}/api/user/self`, async (route) => {
      const request = route.request()
      if (
        request.method() !== "GET" ||
        request.headers()["authorization"] !== `Bearer ${token}`
      )
        return route.fallback()
      if (observedChecks === 0) {
        expect(await request.headerValue("cookie")).toBeNull()
      }
      observedChecks++
      await pending.promise
      if (outcome === "invalid")
        return route.fulfill({
          status: 401,
          json: { success: false, message: "Access token is invalid" },
        })
      return route.fulfill({
        json: {
          success: true,
          data: {
            id: outcome === "mismatch" ? 2 : 1,
            username: "e2e-user",
            quota: 1000,
          },
        },
      })
    })
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      autoFillCurrentSiteUrlOnAccountAdd: false,
      autoProvisionKeyOnAccountAdd: false,
      openChangelogOnUpdate: false,
    })
    const site = await context.newPage()
    try {
      await site.goto(origin)
      await openAccountManagementPage({ page, extensionId })
      const dialog = await autoDetectAccountFromAddDialog(page, origin)
      await expect(
        dialog.dialog.getByRole("heading", { name: /Add an Access Token/ }),
      ).toBeVisible()
      await pasteAccessToken(dialog.accessTokenInput, token)
      await expect(dialog.userIdInput).toHaveValue("1")
      await expect(
        dialog.dialog.getByText("Verifying access token…"),
      ).toBeVisible()
      const auth = dialog.dialog.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionAuth,
      )
      const acquisition = auth.locator(".col-span-full").filter({
        has: page.getByRole("group", { name: "Access Token", exact: true }),
      })
      await expect(acquisition).toHaveCount(0)
      const tokenControl = dialog.accessTokenInput.locator("..")
      const checkingButton = tokenControl.getByRole("button", {
        name: "Verifying access token…",
      })
      await expect(checkingButton).toBeDisabled()
      await expect(checkingButton).toHaveAttribute("aria-busy", "true")
      await expect(dialog.accessTokenInput).toHaveAttribute("aria-busy", "true")
      await expect(dialog.confirmAddButton).toBeEnabled()
      const autoConfig = dialog.dialog.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.autoConfigButton,
      )
      await expect(autoConfig).toBeEnabled()
      pending.resolve()

      const feedback = dialog.dialog.getByRole("status").filter({
        hasText:
          outcome === "valid"
            ? verifiedTokenMessage
            : outcome === "invalid"
              ? "Token may be invalid, expired, or missing permissions. You can still save."
              : "This token belongs to another account. You can still save.",
      })
      await expect(feedback).toHaveAttribute(
        "data-tone",
        outcome === "valid" ? "success" : "warning",
      )
      await expect(feedback).toHaveCSS("font-size", "12px")
      expect(observedChecks).toBe(1)
      await expect(dialog.accessTokenInput).toHaveClass(
        outcome === "valid"
          ? /border-success-border/
          : /border-warning-text\/65/,
      )
      await expect(dialog.accessTokenInput).not.toHaveAttribute(
        "aria-invalid",
        "true",
      )
      await expect(dialog.confirmAddButton).toBeEnabled()
      await expect(autoConfig).toBeEnabled()
      const verifyLabel =
        outcome === "valid" ? "Verify access token" : "Verify again"
      const verifyButton = tokenControl.getByRole("button", {
        name: verifyLabel,
        exact: true,
      })
      await expect(verifyButton).toBeEnabled()
      await expect(
        tokenControl.getByRole("button", { name: "Show Access Token" }),
      ).toBeVisible()
      await expect(feedback.getByRole("button")).toHaveCount(0)

      if (outcome === "valid") {
        await expect(acquisition).toHaveCount(0)
      } else {
        await expect(acquisition).toContainText(
          outcome === "invalid"
            ? "Create a valid token in the extension, or get a new one from the site to replace it."
            : "Create a token for this account in the extension, or copy the matching token from the site.",
        )
        await expect(
          acquisition.getByRole("button", { name: "Get from site" }),
        ).toHaveAttribute("data-variant", "outline")
        const createReplacement = acquisition.getByRole("button", {
          name: "Create token in extension",
        })
        await expect(createReplacement).toHaveAttribute(
          "data-variant",
          "default",
        )
        await expect(
          createReplacement.locator(".lucide-shield-plus"),
        ).toBeVisible()
        await expect(
          acquisition.getByRole("button", { name: "Token instructions" }),
        ).toBeVisible()
        await expect(
          acquisition.getByRole("button", { name: "Manual setup docs" }),
        ).toBeVisible()
        if (!replaceMismatch)
          await captureVisualViews({
            page,
            ready: acquisition,
            captureTarget: dialog.dialog,
            id: `token-verification-${outcome}`,
            extensionDir,
            beforeCapture: async () => {
              if ((page.viewportSize()?.width ?? 0) >= 640) return
              await dialog.dialog
                .getByRole("navigation", { name: "Account settings sections" })
                .getByRole("button")
                .click()
              await page
                .getByRole("menuitem", { name: "Account Authentication" })
                .click()
              await dialog.accessTokenInput.evaluate((input) =>
                input.focus({ preventScroll: true }),
              )
            },
            views:
              outcome === "invalid"
                ? tokenSetupViews
                : tokenSetupViews.slice(0, 1),
          })

        await verifyButton.hover()
        await expect(page.getByRole("tooltip")).toHaveText(verifyLabel)
        await verifyButton.press("Enter")
        await expect.poll(() => observedChecks).toBe(2)
        await expect(feedback).toBeVisible()
      }
      if (replaceMismatch) {
        await dialog.accessTokenInput.fill(replacement)
        await expect(feedback).toBeHidden()
        await expect(acquisition).toHaveCount(0)
        await expect(dialog.accessTokenInput).not.toHaveClass(
          /border-warning-text\/65/,
        )
        await tokenControl
          .getByRole("button", { name: "Verify access token", exact: true })
          .click()
        await expect(
          dialog.dialog.getByText(verifiedTokenMessage, { exact: true }),
        ).toBeVisible()
      }
      await dialog.confirmAddButton.click()
      const saved = await waitForSavedAccount({
        serviceWorker: worker,
        baseUrl: origin,
        siteType: SITE_TYPES.NEW_API,
      })
      expect(saved.account_info.access_token).toBe(
        replaceMismatch ? replacement : token,
      )
      expect(String(saved.account_info.id)).toBe("1")
    } finally {
      pending.resolve()
      await site.close()
    }
  })
}

for (const method of [
  "password",
  "recovery",
  "uncertain",
  "2fa",
  "passkey",
  "github",
  "discord",
  "linuxdo",
  "oidc",
  "company",
  "telegram",
] as const) {
  test(`extension token creation uses ${method} verification without a native token page`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }) => {
    if (process.env.AAH_VISUAL_CAPTURE_DIR) test.setTimeout(240_000)
    else if (method === "password") test.setTimeout(90_000)
    const origin = `https://token-${method}.example.invalid`
    const uncertain = method === "uncertain"
    const canRecover = method === "recovery" || uncertain
    const oauth =
      !canRecover && !["password", "2fa", "passkey"].includes(method)
    const verificationMethod = oauth
      ? "oauth"
      : canRecover
        ? "password"
        : method
    const token = "nap_browser-fixture"
    const rejectedToken = "nap_rejected-before-creation"
    const revocationProof = "bound-revocation-proof"
    const expectedScopes = [
      "profile:read",
      "profile:write",
      "api_key:read",
      "api_key:write",
      "api_key:reveal",
      "usage:read",
      "wallet:read",
      "wallet:write",
      "account_security:read",
      "account_security:write",
    ].sort()
    let issued = 0
    let revoked = false
    let recoveryList: "failed" | "empty" | "with-token" = "failed"
    let listedDraft: Record<string, unknown> = {}
    let consumedBySite = 0
    let callbackExchanges = 0
    let draftContext: unknown
    let heldPasswordAttempt = false
    const releasePasswordAttempt = createDeferred<void>()
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, {
      baseUrl: origin,
      dashboardAuthMode: "auth-bundle",
      accessToken: token,
    })
    if (method === "password") {
      await context.route(`${origin}/api/user/self`, (route) =>
        route.request().headers()["authorization"] === `Bearer ${rejectedToken}`
          ? route.fulfill({
              status: 401,
              json: { success: false, message: "Access token is invalid" },
            })
          : route.fallback(),
      )
    }
    await context.route(`${origin}/api/subscription/self`, (route) =>
      route.fulfill({ json: { success: true, data: [] } }),
    )
    await context.route(`${origin}/api/user/access_tokens**`, (route) => {
      const path = new URL(route.request().url()).pathname
      if (route.request().method() === "DELETE") {
        expect(path).toBe("/api/user/access_tokens/7")
        expect(route.request().headers()["x-security-proof"]).toBe(
          revocationProof,
        )
        revoked = true
        return route.fulfill({ json: { success: true, data: null } })
      }
      if (path.endsWith("/catalog"))
        return route.fulfill({
          json: {
            success: true,
            data: {
              default_expiry_days: 30,
              max_tokens: 20,
              groups: [
                {
                  group: "personal",
                  resources: [
                    {
                      resource: "profile",
                      label_key: "Profile",
                      actions: ["read", "write"].map((action) => ({
                        action,
                        label_key: action,
                      })),
                    },
                    ...[
                      ["api_key", ["read", "write", "reveal"]],
                      ["usage", ["read"]],
                      ["wallet", ["read", "write"]],
                      ["account_security", ["read", "write"]],
                    ].map(([resource, actions]) => ({
                      resource,
                      label_key: resource,
                      actions: (actions as string[]).map((action) => ({
                        action,
                        label_key: action,
                      })),
                    })),
                  ],
                },
              ],
            },
          },
        })
      if (route.request().method() === "POST") {
        expect(route.request().headers()["x-security-proof"]).toBe(
          "bound-proof",
        )
        const draft = route.request().postDataJSON()
        expect({ scopes: draft.scopes, expires_at: draft.expires_at }).toEqual(
          draftContext,
        )
        expect([...draft.scopes].sort()).toEqual(expectedScopes)
        if (method === "password") {
          expect(
            Math.abs(
              draft.expires_at - Math.floor(Date.now() / 1000) - 14 * 86400,
            ),
          ).toBeLessThan(120)
        } else {
          expect(draft.expires_at).toBe(0)
        }
        issued++
        listedDraft = draft
        if (uncertain && issued === 1)
          return route.fulfill({ json: { success: true, data: {} } })
        return route.fulfill({
          json: {
            success: true,
            data: {
              token,
              item: {
                id: 7,
                ...draft,
                ...(method === "recovery" && issued === 1
                  ? { expires_at: 1 }
                  : {}),
              },
            },
          },
        })
      }
      if (uncertain && issued > 0 && recoveryList === "failed")
        return route.fulfill({
          status: 503,
          json: { success: false, message: "List unavailable" },
        })
      return route.fulfill({
        json: {
          success: true,
          data: {
            items:
              canRecover &&
              issued > 0 &&
              !revoked &&
              (!uncertain || recoveryList === "with-token")
                ? [
                    {
                      id: 7,
                      ...listedDraft,
                      created_at: Math.floor(Date.now() / 1000),
                      token_hint: "nap_…7f2a",
                    },
                  ]
                : [],
            legacy: null,
          },
        },
      })
    })
    await context.route(`${origin}/api/verify/methods**`, (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            scope: new URL(route.request().url()).searchParams.get("scope"),
            methods:
              method === "linuxdo"
                ? [
                    { method: "oauth", available: true },
                    { method: "password", available: true },
                    {
                      method: "2fa",
                      available: false,
                      reason: "Not configured",
                    },
                  ]
                : [{ method: verificationMethod, available: true }],
            oauth_providers: oauth
              ? [
                  {
                    slug: method,
                    name: method === "linuxdo" ? "Linux DO" : method,
                  },
                ]
              : [],
            password_encryption_enabled: false,
          },
        },
      }),
    )
    const proof = () => ({
      success: true,
      data: {
        proof_token: "bound-proof",
        scope: "access_token.generate",
        method: verificationMethod,
        expires_at: Date.now() / 1000 + 300,
      },
    })
    await context.route(`${origin}/api/verify`, async (route) => {
      const body = route.request().postDataJSON()
      expect(body.method).toBe(verificationMethod)
      if (body.scope === "access_token.revoke") {
        expect(body.context).toEqual({ token_id: 7 })
        if (body.password === "wrong-fixture-password")
          return route.fulfill({
            status: 400,
            json: { success: false, message: "Wrong password" },
          })
        return route.fulfill({
          json: {
            ...proof(),
            data: {
              ...proof().data,
              scope: "access_token.revoke",
              proof_token: revocationProof,
            },
          },
        })
      }
      expect(body.scope).toBe("access_token.generate")
      if (method === "2fa") expect(body.code).toBe("123456")
      if (method === "password") {
        if (body.password === "wrong-fixture-password") {
          return route.fulfill({
            status: 400,
            json: { success: false, message: "Wrong password" },
          })
        }
        if (!heldPasswordAttempt) {
          heldPasswordAttempt = true
          await releasePasswordAttempt.promise
          await route.abort().catch(() => undefined)
          return
        }
      }
      draftContext = body.context
      return route.fulfill({ json: proof() })
    })
    const site = await context.newPage()
    await site.goto(origin)
    let authenticator:
      | { id: string; cdp: Awaited<ReturnType<typeof context.newCDPSession>> }
      | undefined
    if (method === "passkey") {
      const cdp = await context.newCDPSession(site)
      await cdp.send("WebAuthn.enable")
      const { authenticatorId } = await cdp.send(
        "WebAuthn.addVirtualAuthenticator",
        {
          options: {
            protocol: "ctap2",
            transport: "internal",
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
            automaticPresenceSimulation: true,
          },
        },
      )
      authenticator = { id: authenticatorId, cdp }
      const credentialId = randomBytes(16)
      const { privateKey } = generateKeyPairSync("ec", {
        namedCurve: "prime256v1",
      })
      await cdp.send("WebAuthn.addCredential", {
        authenticatorId,
        credential: {
          credentialId: credentialId.toString("base64"),
          isResidentCredential: true,
          rpId: new URL(origin).hostname,
          privateKey: privateKey
            .export({ type: "pkcs8", format: "der" })
            .toString("base64"),
          userHandle: Buffer.from("1").toString("base64"),
          signCount: 0,
        },
      })
      await context.route(
        `${origin}/api/user/passkey/verify/begin`,
        (route) => {
          draftContext = route.request().postDataJSON().context
          return route.fulfill({
            json: {
              success: true,
              data: {
                flow_token: "passkey-flow",
                options: {
                  publicKey: {
                    challenge: randomBytes(32).toString("base64url"),
                    rpId: new URL(origin).hostname,
                    userVerification: "required",
                    allowCredentials: [
                      {
                        type: "public-key",
                        id: credentialId.toString("base64url"),
                      },
                    ],
                  },
                },
              },
            },
          })
        },
      )
      await context.route(
        `${origin}/api/user/passkey/verify/finish`,
        (route) => {
          const body = route.request().postDataJSON()
          expect(body.flow_token).toBe("passkey-flow")
          expect(body.credential.type).toBe("public-key")
          expect(Boolean(body.credential.response.signature)).toBe(true)
          return route.fulfill({ json: proof() })
        },
      )
    }
    if (oauth) {
      await context.route(`${origin}/api/status`, (route) =>
        route.fulfill({
          json: {
            success: true,
            data: {
              system_name: "New API",
              github_oauth: true,
              github_client_id: "client",
              discord_oauth: true,
              discord_client_id: "client",
              linuxdo_oauth: true,
              linuxdo_client_id: "client",
              oidc_enabled: true,
              oidc_client_id: "client",
              oidc_authorization_endpoint:
                "https://id.example.invalid/authorize",
              custom_oauth_providers: [
                {
                  slug: "company",
                  name: "company",
                  client_id: "client",
                  authorization_endpoint:
                    "https://id.example.invalid/authorize",
                },
              ],
            },
          },
        }),
      )
      await context.route(`${origin}/api/oauth/state`, (route) => {
        const body = route.request().postDataJSON()
        expect(body.intent).toBe("verify")
        expect(body.provider).toBe(method)
        draftContext = body.context
        return route.fulfill({
          json: {
            success: true,
            data: {
              flow_token: "owned-state",
              expires_at: Date.now() / 1000 + 300,
              ...(method === "telegram"
                ? {
                    authorization_url:
                      "https://telegram.example.invalid/authorize?state=owned-state",
                  }
                : {}),
            },
          },
        })
      })
      await context.route(
        /https:\/\/(github\.com|discord\.com|connect\.linux\.do|id\.example\.invalid|telegram\.example\.invalid)\/.*/,
        (route) =>
          route.fulfill({
            contentType: "text/html",
            body: `<a href="${origin}/oauth/${method}?code=single-use&amp;state=owned-state">Authorize verification</a>
              <a href="${origin}/oauth/${method}?error=access_denied&amp;state=owned-state">Decline verification</a>`,
          }),
      )
      await context.route(`${origin}/oauth/${method}**`, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<script>if(new URLSearchParams(location.search).has("code"))fetch("/site-consumed-code")</script><p>Return to All API Hub</p>',
        }),
      )
      await context.route(`${origin}/site-consumed-code`, (route) => {
        consumedBySite++
        return route.fulfill({ body: "consumed" })
      })
      await context.route(`${origin}/api/oauth/${method}**`, (route) => {
        expect(route.request().headers()["authorization"]).toBe(
          `Bearer ${E2E_NEW_API_RC22_AUTH.dashboardToken}`,
        )
        expect(new URL(route.request().url()).searchParams.get("state")).toBe(
          "owned-state",
        )
        callbackExchanges++
        return route.fulfill({ json: proof() })
      })
    }
    try {
      const worker = await getServiceWorker(context)
      await seedUserPreferences(worker, {
        autoFillCurrentSiteUrlOnAccountAdd: false,
        autoProvisionKeyOnAccountAdd: false,
        openChangelogOnUpdate: false,
      })
      await openAccountManagementPage({ page, extensionId })
      const dialog = await autoDetectAccountFromAddDialog(page, origin)
      const tokenStep = dialog.dialog.getByRole("heading", {
        name: "Add an Access Token for Example",
      })
      await expect(tokenStep).toBeVisible({ timeout: 30_000 })
      await expect(dialog.userIdInput).toBeHidden()
      await expect(dialog.accessTokenInput).toBeFocused()
      await expect(dialog.confirmAddButton).toBeHidden()
      const startCreation = dialog.dialog.getByRole("button", {
        name: "Create token in extension",
        exact: true,
      })
      if (method === "linuxdo") {
        await dialog.dialog
          .getByRole("button", { name: "Open full form" })
          .click()
        await expect(dialog.userIdInput).toHaveValue("1")
        const auth = dialog.dialog.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionAuth,
        )
        const acquisition = auth.locator(".col-span-full").filter({
          has: page.getByRole("group", { name: "Access Token", exact: true }),
        })
        await expect(
          acquisition.getByRole("button", { name: "Get from site" }),
        ).toHaveAttribute("data-variant", "outline")
        await expect(startCreation).toHaveAttribute("data-variant", "default")
        await expect(
          startCreation.locator("svg.lucide-shield-plus"),
        ).toBeVisible()
        const footer = dialog.dialog.locator('[data-slot="modal-footer"]')
        const detect = footer.getByRole("button", { name: "Auto Detect" })
        await expect(detect).toHaveAttribute("data-variant", "outline")
        await expect(detect.locator("svg.lucide-sparkles")).toBeVisible()
        await expect(dialog.confirmAddButton).toBeEnabled()
        await expect(dialog.confirmAddButton).toHaveAttribute(
          "data-variant",
          "default",
        )
        await expect(
          dialog.confirmAddButton.locator("svg.lucide-check"),
        ).toBeVisible()
        await expect(
          footer.getByRole("button", { name: "Review incomplete fields" }),
        ).toHaveCount(0)
        await expect(
          footer.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoConfigButton),
        ).toHaveCount(0)
        await captureVisualViews({
          page,
          ready: acquisition,
          captureTarget: dialog.dialog,
          extensionDir,
          id: "account-missing-token",
          views: tokenSetupViews,
        })
        await dialog.confirmAddButton.click()
        await expect(dialog.accessTokenInput).toBeFocused()
        await expect(dialog.accessTokenInput).toHaveAttribute(
          "aria-invalid",
          "true",
        )
        await captureVisualViews({
          page,
          ready: acquisition,
          captureTarget: dialog.dialog,
          extensionDir,
          id: "account-missing-token-save",
          views: tokenSetupViews,
        })
        const siteName = dialog.dialog.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput,
        )
        await siteName.fill("")
        await expect(siteName).toBeFocused()
        await captureVisualViews({
          page,
          ready: siteName,
          captureTarget: dialog.dialog,
          extensionDir,
          id: "account-missing-fields",
          views: [{ id: "desktop", width: 1249, height: 900, theme: "light" }],
        })
        await dialog.confirmAddButton.click()
        await expect(siteName).toBeFocused()
        await expect(siteName).toHaveAttribute("aria-invalid", "true")
        await captureVisualViews({
          page,
          ready: siteName,
          captureTarget: dialog.dialog,
          extensionDir,
          id: "account-validation",
          views: [
            { id: "desktop", width: 1249, height: 900, theme: "light" },
            { id: "narrow", width: 340, height: 680, theme: "light" },
            { id: "dark", width: 1249, height: 900, theme: "dark" },
          ],
        })
        await siteName.fill("Example")
        await expect(siteName).not.toHaveAttribute("aria-invalid", "true")
        await expect(siteName).toBeFocused()
      }
      if (method === "password") {
        await startCreation.click()
        await expect(dialog.userIdInput).toBeHidden()
        await dialog.dialog
          .getByRole("button", {
            name: "Back to account",
          })
          .click()
        await expect(tokenStep).toBeVisible()
        await expect(dialog.accessTokenInput).toBeFocused()
        await pasteAccessToken(dialog.accessTokenInput, rejectedToken)
        await expect(dialog.userIdInput).toHaveValue("1")
        await expect(
          dialog.dialog.getByText(
            "Token may be invalid, expired, or missing permissions. You can still save.",
          ),
        ).toBeVisible()
        const auth = dialog.dialog.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionAuth,
        )
        await expect(
          auth.getByRole("button", { name: "Create token in extension" }),
        ).toBeVisible()
      }
      await startCreation.click()
      await expect(dialog.userIdInput).toBeHidden()
      await expect(dialog.confirmAddButton).toBeHidden()
      await expect(
        dialog.dialog.getByRole("button", {
          name: "Auto Detect",
          exact: true,
        }),
      ).toBeHidden()
      const creator = dialog.dialog.getByRole("region", {
        name: "Create token in extension",
        exact: true,
      })
      const tokenName = creator.getByLabel("Token name", { exact: true })
      await expect(tokenName).toBeVisible()
      await expect(
        creator.getByRole("checkbox", {
          name: "View account profile (Required)",
        }),
      ).toBeDisabled()
      const expiration = creator.getByRole("combobox", { name: "Expiration" })
      await expect(expiration).toHaveText("Never expires")
      await expect(creator.getByRole("spinbutton")).toHaveCount(0)
      await expect(
        creator.getByRole("button", { name: "All", pressed: true }),
      ).toBeVisible()
      const permissions = creator.getByRole("region", { name: "Permissions" })
      const granted = permissions.getByRole("checkbox", { checked: true })
      await expect(granted).toHaveCount(expectedScopes.length)
      await expect(
        permissions.getByRole("heading", { name: "Core & current features" }),
      ).toBeVisible()
      await expect(
        permissions.getByRole("heading", {
          name: "Reserved for future features",
        }),
      ).toBeVisible()
      const footer = dialog.dialog.locator('[data-slot="modal-footer"]')
      const create = footer.getByRole("button", {
        name: "Verify and create token",
        exact: true,
      })
      await expect(create).toBeVisible()
      expect(issued).toBe(0)
      const passwordInput = creator.getByLabel("Account password", {
        exact: true,
      })
      const expectPasswordAlignment = async () => {
        const nameBox = await tokenName.boundingBox()
        const secretBox = await passwordInput.boundingBox()
        if (!nameBox || !secretBox)
          throw new Error("Expected both token name and password fields")
        expect(Math.abs(nameBox.x - secretBox.x)).toBeLessThan(1)
        expect(Math.abs(nameBox.width - secretBox.width)).toBeLessThan(1)
      }
      if (method === "linuxdo" || method === "password") {
        await page.emulateMedia({ reducedMotion: "reduce" })
        const methods = creator.getByRole("radiogroup", {
          name: "Verify your identity",
        })
        if (method === "linuxdo") {
          await methods.getByText("Password", { exact: true }).click()
          await expect(passwordInput).toBeVisible()
          await expectPasswordAlignment()
          await methods.getByText("Linux DO", { exact: true }).click()
          await expect(
            methods.getByRole("radio", { name: "Linux DO" }),
          ).toBeChecked()
          await expect(
            methods.getByRole("radio", { name: /Not configured/ }),
          ).toBeDisabled()
        } else {
          await expect(methods).toHaveCount(0)
          await expect(creator.getByRole("radio")).toHaveCount(0)
          await expect(passwordInput).toHaveAccessibleDescription(
            "Enter your site account password to continue.",
          )
          await expectPasswordAlignment()
          await expect(passwordInput).toHaveAttribute("type", "password")
          await expect(
            passwordInput.locator("..").locator(".lucide-lock"),
          ).toBeVisible()
          await expect(
            creator.getByRole("button", { name: "Show login password" }),
          ).toBeVisible()
        }
        await captureVisualViews({
          page,
          ready: tokenName,
          captureTarget: dialog.dialog,
          extensionDir,
          id: `token-setup-${method}`,
          beforeCapture:
            method === "password" ? expectPasswordAlignment : undefined,
          views:
            method === "password"
              ? tokenSetupViews
              : tokenSetupViews.filter(({ id }) => id !== "narrow"),
        })
        const walletWrite = creator.getByRole("checkbox", {
          name: "Wallet actions, purchases and check-in",
          exact: true,
        })
        const walletHintText =
          "Used by the extension for check-in; the site bundles payments and purchases in this permission."
        const walletHint = walletWrite.locator("..").getByText(walletHintText)
        await expect(walletWrite).toBeChecked()
        await expect(walletHint).toBeVisible()
        await expect(walletWrite).toHaveAccessibleDescription(walletHintText)
        await expect(
          permissions.locator(
            '[data-slot="inline-message"][data-tone="warning"]',
          ),
        ).toHaveCount(0)
        if (method === "password") {
          await captureVisualViews({
            page,
            ready: walletHint,
            captureTarget: dialog.dialog,
            extensionDir,
            id: "token-creation-form",
            views: tokenSetupViews.filter(({ theme }) => theme === "light"),
          })
        }
        await creator
          .getByRole("button", { name: "Standard", exact: true })
          .click()
        await expect(walletWrite).toBeChecked()
        await expect(
          creator.getByText(/Profile editing and account security permissions/),
        ).toBeHidden()
        await creator
          .getByRole("button", { name: "Read-only", exact: true })
          .click()
        await expect(walletWrite).not.toBeChecked()
        await expect(walletHint).toBeVisible()
        await creator.getByRole("button", { name: "All", exact: true }).click()
        if (method === "password") {
          await captureVisualViews({
            page,
            ready: passwordInput,
            captureTarget: dialog.dialog,
            extensionDir,
            id: "token-password-verification",
            views: tokenSetupViews.filter(({ id }) => id === "narrow"),
          })
          await expiration.click()
          await page
            .getByRole("option", { name: "90 days", exact: true })
            .click()
          await expect(expiration).toHaveText("90 days")
          await expect(creator.getByRole("spinbutton")).toHaveCount(0)
          await expiration.click()
          await page
            .getByRole("option", { name: "Custom days", exact: true })
            .click()
          const customDays = creator.getByRole("spinbutton", {
            name: "Expires after (days)",
          })
          await expect(customDays).toHaveValue("30")
          await expect(
            customDays.locator("..").getByText("d", { exact: true }),
          ).toBeVisible()
          const expectExpiryAlignment = async () => {
            const expiryBox = await expiration.boundingBox()
            const daysBox = await customDays.boundingBox()
            const nameBox = await tokenName.boundingBox()
            if (!expiryBox || !daysBox || !nameBox)
              throw new Error(
                "Expected both inline expiration controls and token name",
              )
            expect(Math.abs(expiryBox.y - daysBox.y)).toBeLessThan(1)
            expect(daysBox.x).toBeGreaterThanOrEqual(
              expiryBox.x + expiryBox.width,
            )
            const narrow = (page.viewportSize()?.width ?? 0) < 640
            if (narrow) {
              expect(daysBox.x + daysBox.width).toBeLessThanOrEqual(
                nameBox.x + nameBox.width + 1,
              )
              const extraSpace = await customDays.evaluate((element) => {
                const css = getComputedStyle(element)
                const context = document
                  .createElement("canvas")
                  .getContext("2d")
                if (!context) throw new Error("Canvas text metrics unavailable")
                context.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`
                return (
                  element.clientWidth -
                  parseFloat(css.paddingLeft) -
                  parseFloat(css.paddingRight) -
                  context.measureText("1234").width
                )
              })
              expect(extraSpace).toBeGreaterThanOrEqual(0)
            } else {
              expect(Math.abs(nameBox.y - expiryBox.y)).toBeLessThan(1)
            }
          }
          await expectExpiryAlignment()
          await captureVisualViews({
            page,
            ready: customDays,
            captureTarget: dialog.dialog,
            extensionDir,
            id: "token-custom-expiry",
            beforeCapture: expectExpiryAlignment,
            views: tokenSetupViews.filter(({ id }) => id !== "dark"),
          })
          await customDays.fill("14")
        }
      }
      if (verificationMethod === "password")
        await passwordInput.fill("test-password")
      if (uncertain) await tokenName.fill("Recovery test draft")
      if (method === "2fa")
        await creator
          .getByLabel("Authenticator code", { exact: true })
          .fill("123456")
      if (method === "password") {
        await creator
          .getByRole("button", { name: "Show login password" })
          .click()
        await expect(passwordInput).toHaveAttribute("type", "text")
        await creator
          .getByRole("button", { name: "Hide login password" })
          .click()
        await passwordInput.fill("wrong-fixture-password")
        await passwordInput.press("Enter")
        const failure = creator.getByRole("alert").filter({
          hasText:
            "Incorrect account password. Check your password and try again.",
        })
        const fallback = creator.getByRole("button", {
          name: "Create token on the site",
        })
        await expect(failure).toBeVisible()
        await expect(fallback).toHaveCount(0)
        await captureVisualViews({
          page,
          ready: failure,
          captureTarget: dialog.dialog,
          extensionDir,
          id: "token-creation-failure",
          views: tokenSetupViews.filter(({ id }) => id !== "narrow"),
        })
        await expect(passwordInput).toHaveValue("wrong-fixture-password")
        await expect(passwordInput).toHaveAttribute("type", "password")
        await expect(passwordInput).toHaveAttribute("aria-invalid", "true")
        await expect(failure).toHaveCSS("font-size", "12px")
        await expect(create).toBeEnabled()
        const fieldBox = await passwordInput.boundingBox()
        const errorBox = await failure.boundingBox()
        if (!fieldBox || !errorBox)
          throw new Error("Expected the password and its failure feedback")
        expect(errorBox.y - fieldBox.y - fieldBox.height).toBeLessThanOrEqual(
          12,
        )
        expect(issued).toBe(0)

        await passwordInput.fill("test-password")
        await expect(failure).toBeHidden()
        await expect(fallback).toBeHidden()
        await expect(passwordInput).not.toHaveAttribute("aria-invalid", "true")
        const now = Date.now()
        await page.clock.install({ time: now })
        await page.clock.pauseAt(now + 1000)
        await passwordInput.press("Enter")
        await expect.poll(() => heldPasswordAttempt).toBe(true)
        const pending = footer.getByRole("button", {
          name: "Verifying and creating…",
        })
        const cancel = footer.getByRole("button", {
          name: "Cancel",
          exact: true,
        })
        await expect(pending).toHaveAttribute("aria-busy", "true")
        await expect(pending.locator("svg.animate-spin")).toBeVisible()
        await expect(cancel).toHaveCount(0)
        await captureVisualViews({
          page,
          ready: pending,
          captureTarget: dialog.dialog,
          extensionDir,
          id: "token-creation-fast-pending",
          waitForAnimationFrames: false,
          views: tokenSetupViews.slice(0, 1),
        })
        await page.clock.runFor(1499)
        await expect(cancel).toHaveCount(0)
        await page.clock.runFor(1)
        await page.clock.resume()
        await expect(cancel).toBeVisible()
        const cancelBox = await cancel.boundingBox()
        const pendingBox = await pending.boundingBox()
        if (!cancelBox || !pendingBox)
          throw new Error("Expected Cancel and the pending action")
        expect(cancelBox.x + cancelBox.width).toBeLessThanOrEqual(pendingBox.x)
        await captureVisualViews({
          page,
          ready: pending,
          captureTarget: dialog.dialog,
          extensionDir,
          id: "token-creation-slow-pending",
          views: tokenSetupViews.slice(0, 1),
        })
        await cancel.click()
        await expect(create).toBeEnabled()
        releasePasswordAttempt.resolve()
        await expect(passwordInput).toHaveValue("test-password")
        await expect(failure).toHaveCount(0)
        await expect(fallback).toHaveCount(0)
        expect(issued).toBe(0)
        await create.click()
      } else {
        await create.click()
      }
      if (oauth) {
        const findProvider = () =>
          context
            .pages()
            .find((candidate) =>
              /^https:\/\/(github\.com|discord\.com|connect\.linux\.do|id\.example\.invalid|telegram\.example\.invalid)\//.test(
                candidate.url(),
              ),
            )
        const waitForProvider = async () => {
          await expect.poll(() => Boolean(findProvider())).toBe(true)
          return findProvider()!
        }
        if (method === "github") {
          const provider = await waitForProvider()
          await expect(
            footer.getByRole("button", { name: "Cancel", exact: true }),
          ).toBeVisible()
          await provider
            .getByRole("link", { name: "Decline verification" })
            .click()
          const cancellation = creator.getByRole("status").filter({
            hasText: "Identity verification was cancelled. You can try again.",
          })
          await expect(cancellation).toHaveAttribute("data-tone", "neutral")
          await expect(
            creator.getByRole("button", { name: "Create token on the site" }),
          ).toHaveCount(0)
          expect(callbackExchanges).toBe(0)
          expect(issued).toBe(0)
          await page.bringToFront()
          await captureVisualViews({
            page,
            ready: cancellation,
            captureTarget: dialog.dialog,
            extensionDir,
            id: "token-creation-oauth-cancelled",
            views: tokenSetupViews.slice(0, 1),
          })
          await create.click()
        }
        await (
          await waitForProvider()
        )
          .getByRole("link", { name: "Authorize verification" })
          .click()
      }
      if (canRecover) {
        const captureRecovery = (
          id: string,
          ready: import("@playwright/test").Locator,
        ) =>
          captureVisualViews({
            page,
            ready,
            captureTarget: dialog.dialog,
            extensionDir,
            id,
            views: tokenSetupViews.filter(({ theme }) => theme === "light"),
          })
        const startReview = dialog.dialog.getByRole("button", {
          name: "Review existing tokens",
          exact: true,
        })
        if (uncertain) {
          await expect(create).toHaveCount(0)
          await expect(dialog.dialog.getByRole("alert")).toBeFocused()
          await captureRecovery("token-recovery-uncertain", startReview)
        }
        await startReview.click()
        const recovery = dialog.dialog.getByRole("region", {
          name: "Review existing tokens",
          exact: true,
        })
        const back = dialog.dialog.getByRole("button", {
          name: "Back to token creation",
        })
        await expect(back).toBeEnabled()
        await expect(
          dialog.dialog.getByRole("heading", {
            name: "Review existing tokens",
          }),
        ).toBeFocused()
        await expect(tokenName).toHaveCount(0)
        const finishReview = footer.getByRole("button", {
          name: uncertain
            ? "Reviewed, allow a new attempt"
            : "I have reviewed the result",
          exact: true,
        })
        if (uncertain) {
          const listError = recovery.getByRole("alert")
          await expect(listError).toBeVisible()
          await expect(finishReview).toBeDisabled()
          await captureRecovery("token-recovery-unavailable", listError)
          await back.click()
          await expect(startReview).toBeVisible()
          expect(issued).toBe(1)
          recoveryList = "empty"
          await startReview.click()
          const empty = recovery.getByText(/The site returned no tokens/)
          await expect(empty).toBeVisible()
          await expect(finishReview).toBeEnabled()
          await expect(
            recovery.getByRole("button", {
              name: "Verify and revoke selected token",
            }),
          ).toHaveCount(0)
          await captureRecovery("token-recovery-empty", empty)
          recoveryList = "with-token"
          await recovery
            .getByRole("button", { name: "Refresh", exact: true })
            .click()
        }
        const tokenToRevoke = recovery.getByRole("radio", {
          name: uncertain ? /Recovery test draft/ : /All API Hub/,
        })
        if (uncertain) {
          await expect(tokenToRevoke).not.toBeChecked()
          await captureRecovery("token-recovery-unselected", tokenToRevoke)
          const permissions = recovery.getByText("Permissions (10)", {
            exact: true,
          })
          const profile = recovery.getByText("View account profile", {
            exact: true,
          })
          await expect(profile).toBeHidden()
          await permissions.click()
          await expect(profile).toBeVisible()
          await expect(tokenToRevoke).not.toBeChecked()
          await captureRecovery("token-recovery-permissions", permissions)
          await permissions.click()
        }
        await tokenToRevoke.check()
        const revoke = recovery.getByRole("button", {
          name: "Verify and revoke selected token",
          exact: true,
        })
        if (uncertain) {
          const clear = recovery.getByRole("button", {
            name: "Clear selection",
          })
          await clear.click()
          await expect(tokenToRevoke).toBeFocused()
          await expect(revoke).toHaveCount(0)
          await tokenToRevoke.check()
          await page.setViewportSize({ width: 340, height: 680 })
          const [revokeBox, clearBox] = await Promise.all([
            revoke.boundingBox(),
            clear.boundingBox(),
          ])
          for (const box of [revokeBox, clearBox]) {
            if (!box)
              throw new Error("Expected the recovery button to be visible")
            expect(box.x).toBeGreaterThanOrEqual(0)
            expect(box.x + box.width).toBeLessThanOrEqual(340)
          }
          await page.setViewportSize({ width: 1249, height: 900 })
          await captureRecovery("token-recovery-selected", revoke)
          await page.setViewportSize({ width: 340, height: 680 })
          const revocation = recovery.getByRole("region", {
            name: "Revoke selected token",
          })
          const revokePassword = revocation.getByLabel("Account password", {
            exact: true,
          })
          await revokePassword.fill("wrong-fixture-password")
          await revoke.click()
          const wrongPassword = revocation.getByRole("alert")
          await expect(wrongPassword).toContainText(
            "Incorrect account password",
          )
          await expect(wrongPassword).toBeFocused()
          await expect(revokePassword).toHaveAttribute("aria-invalid", "true")
          expect(revoked).toBe(false)
          await captureRecovery("token-recovery-revoke-failed", wrongPassword)
          await clear.click()
          await expect(finishReview).toBeEnabled()
          await tokenToRevoke.check()
        }
        await recovery
          .getByLabel("Account password", { exact: true })
          .fill("test-password")
        await revoke.click()
        const revokedStatus = recovery.getByText(
          "Revocation confirmed. The token is no longer listed.",
          { exact: true },
        )
        await expect(revokedStatus).toBeVisible()
        if (uncertain)
          await captureRecovery("token-recovery-revoked", revokedStatus)
        await finishReview.click()
        if (uncertain) {
          await expect(tokenName).toHaveValue("Recovery test draft")
          await expect(passwordInput).toHaveValue("")
          expect(issued).toBe(1)
        }
        await creator
          .getByLabel("Account password", { exact: true })
          .fill("test-password")
        await dialog.dialog
          .getByRole("button", { name: "Verify and create token", exact: true })
          .click()
        expect(revoked).toBe(true)
      }
      await expect(
        dialog.dialog.getByRole("status").filter({
          hasText:
            "Token verified and filled in. Review your account details, then save.",
        }),
      ).toHaveAttribute("data-tone", "success", { timeout: 30_000 })
      await page.bringToFront()
      await expect(dialog.userIdInput).toBeVisible()
      await expect(dialog.userIdInput).toHaveValue("1")
      await expect(dialog.accessTokenInput).toHaveValue(token)
      await expect(dialog.accessTokenInput).toBeFocused()
      await expect(dialog.confirmAddButton).toBeEnabled()
      if (method === "password") {
        await expect(startCreation).toBeHidden()
        await expect(
          dialog.dialog.getByText(
            "Token may be invalid, expired, or missing permissions. You can still save.",
          ),
        ).toBeHidden()
        await captureVisualViews({
          page,
          ready: dialog.accessTokenInput,
          captureTarget: dialog.dialog,
          extensionDir,
          id: "token-return-to-account",
          views: tokenSetupViews,
        })
      }
      await dialog.confirmAddButton.click()
      const saved = await waitForSavedAccount({
        serviceWorker: worker,
        baseUrl: origin,
        siteType: SITE_TYPES.NEW_API,
      })
      expect(saved.account_info.access_token).toBe(token)
      expect(String(saved.account_info.id)).toBe("1")
      expect(issued).toBe(canRecover ? 2 : 1)
      expect(consumedBySite).toBe(0)
      if (oauth) expect(callbackExchanges).toBe(1)
    } finally {
      releasePasswordAttempt.resolve()
      if (authenticator) {
        await authenticator.cdp.send("WebAuthn.removeVirtualAuthenticator", {
          authenticatorId: authenticator.id,
        })
        await authenticator.cdp.detach()
      }
      await site.close()
    }
  })
}
