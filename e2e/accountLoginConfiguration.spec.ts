import type { BrowserContext, Page } from "@playwright/test"

import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import type { AccountStorageConfig } from "~/types"
import type { AutoCheckinStatus } from "~/types/autoCheckin"
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
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
  holdExtensionWindowNavigation,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

async function setupLoginFixture({
  context,
  page,
  method,
  savedPassword = false,
}: {
  context: BrowserContext
  page: Page
  method: "linuxdo" | "password"
  savedPassword?: boolean
}) {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://agentrouter.org",
    userId: 17,
    systemName: "Agent Router",
  })
  const loginBodies: unknown[] = []
  let signedIn = false
  await context.route("https://agentrouter.org/api/user/self", (route) => {
    const savedCredential = route.request().headers().authorization
    return route.fulfill(
      signedIn || savedCredential
        ? { json: { success: true, data: { id: 17 } } }
        : { status: 401, json: { success: false } },
    )
  })
  await context.route(
    "https://agentrouter.org/api/user/auth/refresh",
    (route) => route.fulfill({ status: 401, json: { success: false } }),
  )
  await context.route(
    "https://agentrouter.org/api/user/login",
    async (route) => {
      loginBodies.push(route.request().postDataJSON())
      signedIn = true
      await route.fulfill({
        json: { success: true, data: { id: 17, checked_in: true } },
      })
    },
  )
  await context.route("https://agentrouter.org/login", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Agent Router native login fixture</title>
        <form><input name="username" autocomplete="username"><input type="password" autocomplete="current-password"><button type="submit">Login</button></form>
        <script>document.querySelector('form').addEventListener('submit', async event => {
          event.preventDefault();
          const result = await fetch('/api/user/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:document.querySelector('[name=username]').value,password:document.querySelector('[type=password]').value})}).then(response=>response.json());
          localStorage.setItem('user',JSON.stringify(result.data));
          location.assign('/console');
        });</script>`,
    }),
  )
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    preferencesVersion: DEFAULT_PREFERENCES.preferencesVersion,
    openChangelogOnUpdate: false,
    autoCheckin: {
      ...DEFAULT_PREFERENCES.autoCheckin!,
      globalEnabled: method === "password",
      pretriggerDailyOnUiOpen: false,
    },
  })
  await seedStoredAccounts(worker, [
    createStoredAccount({
      id: "login-config-account",
      site_name: "AgentRouter",
      site_type: SITE_TYPES.NEW_API,
      site_url: "https://agentrouter.org",
      login: savedPassword
        ? {
            methodId: ACCOUNT_LOGIN_METHODS.Password,
            credentials: {
              username: "native-member",
              password: " fixture password ",
            },
          }
        : { methodId: "github" },
      account_info: {
        id: "17",
        username: "member",
        access_token: "e2e-token",
      },
      checkIn: {
        automaticExecutionEnabled: method === "password",
        selection: {
          mode: "automatic",
          methodId: AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn,
        },
        methodKnowledge: {
          methods: {
            [AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn]: {
              detection: {
                outcome: "matched",
                evidence: { source: "probe", observedAt: Date.now() },
              },
            },
          },
        },
      },
    }),
  ])
  return { worker, loginBodies }
}

for (const method of ["linuxdo", "password"] as const) {
  test(`account login configuration saves ${method} for login check-in`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }, testInfo) => {
    const { worker, loginBodies } = await setupLoginFixture({
      context,
      page,
      method,
    })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
    )
    await waitForExtensionRoot(page)
    const row = page.getByTestId(
      getAccountManagementListItemTestId("login-config-account"),
    )
    await row.hover()
    await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionCheckIn),
    ).toBeVisible()
    const loginSection = dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionLogin,
    )
    const checkInSection = dialog.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionCheckIn,
    )
    const setFormViewport = async (viewport: {
      width: number
      height: number
    }) => {
      await page.setViewportSize(viewport)
      await expect(checkInSection).toHaveAttribute("data-layout", "continuous")
      await expect(loginSection).toHaveAttribute("data-layout", "continuous")
    }
    await expect(
      loginSection.getByRole("combobox", { name: "Login method", exact: true }),
    ).toHaveText("GitHub")
    await expect(
      dialog
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionCheckIn)
        .getByRole("combobox", { name: "Login method", exact: true }),
    ).toHaveCount(0)
    await expect(
      dialog.getByText("AgentRouter checks in by signing in again"),
    ).toBeVisible()
    const loginNotice = dialog
      .getByRole("status")
      .filter({ hasText: "AgentRouter checks in by signing in again" })
    const typography = await loginNotice.evaluate((element) => {
      const title = element.ownerDocument.getElementById(
        element.getAttribute("aria-labelledby") ?? "",
      )
      const description = element.ownerDocument.getElementById(
        element.getAttribute("aria-describedby") ?? "",
      )
      return {
        title: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
        description: description
          ? parseFloat(getComputedStyle(description).fontSize)
          : 0,
      }
    })
    expect(typography.title).toBeGreaterThan(typography.description)
    const noticeGeometry = await loginNotice.evaluate((element) => {
      const description = element.ownerDocument
        .getElementById(element.getAttribute("aria-describedby") ?? "")!
        .getBoundingClientRect()
      const button = element.querySelector("button")!.getBoundingClientRect()
      return {
        descriptionRight: description.right,
        buttonLeft: button.left,
        height: element.getBoundingClientRect().height,
      }
    })
    expect(noticeGeometry.buttonLeft).toBeGreaterThanOrEqual(
      noticeGeometry.descriptionRight,
    )
    expect(noticeGeometry.height).toBeLessThan(95)
    const originalViewport = page.viewportSize()!
    for (const width of [1280, 390]) {
      await setFormViewport({ width, height: 900 })
      for (const textSize of ["default", "extra-large"]) {
        await page.evaluate((value) => {
          document.documentElement.setAttribute("data-theme-text-size", value)
        }, textSize)
        const layout = await loginNotice.evaluate((element) => {
          const title = document.getElementById(
            element.getAttribute("aria-labelledby")!,
          )!
          const icon = element.querySelector("[aria-hidden=true] svg")!
          const iconBounds = icon.getBoundingClientRect()
          const titleBounds = title.getBoundingClientRect()
          const description = document.getElementById(
            element.getAttribute("aria-describedby")!,
          )!
          const button = element.querySelector("button")!
          const bounds = element.getBoundingClientRect()
          const buttonBounds = button.getBoundingClientRect()
          const copyBounds = description.getBoundingClientRect()
          return {
            iconAlignmentError: Math.abs(
              iconBounds.top +
                iconBounds.height / 2 -
                (titleBounds.top +
                  parseFloat(getComputedStyle(title).lineHeight) / 2),
            ),
            bodySize: parseFloat(getComputedStyle(description).fontSize),
            actionSize: parseFloat(getComputedStyle(button).fontSize),
            overflows: element.scrollWidth > element.clientWidth,
            actionFits:
              buttonBounds.left >= bounds.left &&
              buttonBounds.right <= bounds.right,
            inline: buttonBounds.left >= copyBounds.right,
            below: buttonBounds.top >= copyBounds.bottom,
          }
        })
        expect(layout.actionSize).toBeLessThanOrEqual(layout.bodySize)
        expect(layout.iconAlignmentError).toBeLessThanOrEqual(1)
        expect(layout.overflows).toBe(false)
        expect(layout.actionFits).toBe(true)
        expect(width === 1280 ? layout.inline : layout.below).toBe(true)
      }
    }
    await setFormViewport(originalViewport)
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme-text-size", "default")
    })
    const checkInMethod = dialog.getByRole("combobox", {
      name: "Check-in method",
      exact: true,
    })
    await checkInMethod.click()
    await page
      .getByRole("option", { name: "Log in again and check in", exact: true })
      .click()
    const restoreAutomatic = dialog.getByRole("button", {
      name: "Restore automatic selection",
    })
    await expect(restoreAutomatic).toBeVisible()
    for (const width of [1280, 390]) {
      await setFormViewport({ width, height: 900 })
      await expect(async () => {
        const actionBounds = await restoreAutomatic.boundingBox()
        const selectBounds = await checkInMethod.boundingBox()
        expect(actionBounds).not.toBeNull()
        expect(selectBounds).not.toBeNull()
        expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(
          selectBounds!.y,
        )
        expect(actionBounds!.x).toBeGreaterThanOrEqual(selectBounds!.x)
        expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(
          selectBounds!.x + selectBounds!.width + 1,
        )
      }).toPass({ timeout: 10_000 })
    }
    await setFormViewport(originalViewport)
    await captureVisualViews({
      page,
      ready: restoreAutomatic,
      id: "check-in-manual-selection",
      extensionDir,
    })
    await restoreAutomatic.click()
    await expect(restoreAutomatic).toBeHidden()
    await expect(checkInMethod).toContainText("Automatic selection")
    await captureVisualViews({
      page,
      ready: dialog.getByText("AgentRouter checks in by signing in again"),
      id: "account-login-dependency",
      extensionDir,
    })
    await captureVisualViews({
      page,
      ready: loginSection,
      id: `account-login-${method}-editor`,
      extensionDir,
    })
    await loginNotice
      .getByRole("button", { name: "Change account login" })
      .click()
    await expect(
      loginSection.getByRole("combobox", { name: "Login method", exact: true }),
    ).toBeFocused()
    await expect(loginSection).toHaveClass(/ring-theme-500/)
    await captureVisualViews({
      page,
      ready: loginSection,
      id: `account-login-${method}-guidance`,
      extensionDir,
    })
    await expect(loginSection).not.toHaveClass(/ring-theme-500/)
    if (method === "password") {
      const viewport = page.viewportSize()!
      await setFormViewport({ width: 390, height: 844 })
      const loginMethod = loginSection.getByRole("combobox", {
        name: "Login method",
        exact: true,
      })
      await expect(loginMethod).toBeVisible()
      await loginNotice
        .getByRole("button", { name: "Change account login" })
        .click()
      await expect(loginMethod).toBeFocused()
      await expect(loginSection).toHaveClass(/ring-theme-500/)
      const sectionBounds = (await loginSection.boundingBox())!
      const dialogBounds = (await dialog.boundingBox())!
      const footerBounds = (await dialog
        .getByRole("button", { name: "Save Changes", exact: true })
        .boundingBox())!
      // Near the end of a form the remaining scroll range can prevent top
      // alignment; the destination must still fit between header and footer.
      expect(sectionBounds.y).toBeGreaterThanOrEqual(dialogBounds.y + 50)
      expect(sectionBounds.y + sectionBounds.height).toBeLessThanOrEqual(
        footerBounds.y,
      )
      await loginSection.screenshot({
        path: testInfo.outputPath("mobile-login-guidance.png"),
      })
      await setFormViewport(viewport)
    }
    await loginSection
      .getByRole("combobox", { name: "Login method", exact: true })
      .click()
    await page
      .getByRole("option", {
        name: method === "password" ? "Password login" : "Linux DO",
        exact: true,
      })
      .click()
    if (method === "password") {
      await captureVisualViews({
        page,
        ready: loginNotice,
        id: "account-login-dependency-missing",
        extensionDir,
      })
      await expect(
        dialog.getByRole("button", { name: "Save Changes", exact: true }),
      ).toBeDisabled()
      await loginSection
        .getByLabel("Login username or email")
        .fill("native-member")
      await loginSection
        .locator("#account-login-password")
        .fill(" fixture password ")
      await expect(
        loginSection.locator("#account-login-password"),
      ).toHaveAttribute("type", "password")
      await captureVisualViews({
        page,
        ready: loginSection,
        id: "account-login-password-configured",
        extensionDir,
      })
    }
    await dialog
      .getByRole("button", { name: "Save Changes", exact: true })
      .click()
    await expect(dialog).toBeHidden()
    await expect
      .poll(async () => {
        const stored = await getPlasmoStorageJsonValue<AccountStorageConfig>(
          worker,
          ACCOUNT_STORAGE_KEYS.ACCOUNTS,
        )
        const account = stored?.accounts.find(
          (item) => item.id === "login-config-account",
        )
        return {
          login: account?.login,
          automaticExecutionEnabled: account?.checkIn.automaticExecutionEnabled,
          legacy: account?.checkIn.loginCheckIn,
        }
      })
      .toEqual({
        login:
          method === "password"
            ? {
                methodId: ACCOUNT_LOGIN_METHODS.Password,
                credentials: {
                  username: "native-member",
                  password: " fixture password ",
                },
              }
            : { methodId: "linuxdo" },
        automaticExecutionEnabled: method === "password",
        legacy: undefined,
      })
    expect(loginBodies).toHaveLength(0)
  })
}

test("password login uses an isolated window when private access is allowed and regular login otherwise", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  const { loginBodies } = await setupLoginFixture({
    context,
    page,
    method: "password",
    savedPassword: true,
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  let row = page.getByTestId(
    getAccountManagementListItemTestId("login-config-account"),
  )
  let dialog = page.getByRole("dialog")
  const loginSection = dialog.getByTestId(
    ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionLogin,
  )
  await row.hover()
  await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
  await expect(dialog.locator("#account-login-username")).toHaveValue(
    "native-member",
  )
  await expect(dialog.locator("#account-login-password")).toHaveValue(
    " fixture password ",
  )
  await expect(
    dialog.getByText("Current login method: Password login."),
  ).toBeVisible()
  await expect(
    loginSection.getByText("Allow private browsing for isolated login", {
      exact: true,
    }),
  ).toBeVisible()
  await loginSection
    .getByRole("button", { name: "Settings", exact: true })
    .click()
  const accessDialog = page.getByRole("dialog", {
    name: "Incognito / private browsing access",
    exact: true,
  })
  await expect(
    accessDialog.getByText(
      "Changing this permission may reload the extension, close extension pages or interrupt tasks. Save unfinished edits first.",
      { exact: true },
    ),
  ).toBeVisible()
  await accessDialog
    .getByRole("button", { name: "Cancel", exact: true })
    .click()
  await expect(loginSection.locator("#account-login-username")).toHaveValue(
    "native-member",
  )
  await expect(loginSection.locator("#account-login-password")).toHaveValue(
    " fixture password ",
  )
  await loginSection
    .getByRole("button", { name: "Settings", exact: true })
    .click()
  const settingsOpened = context.waitForEvent("page")
  await accessDialog
    .getByRole("button", {
      name: "Chrome settings",
      exact: true,
    })
    .click()
  const settings = await settingsOpened
  await expect(settings).toHaveURL(`chrome://extensions/?id=${extensionId}`)
  // Permission changes reload unpacked extensions; keep this isolated test
  // profile in developer mode so Chromium does not disable the test build.
  await settings.locator("extensions-toolbar #devMode").click()
  const privateToggle = settings.locator("#allow-incognito cr-toggle")
  const changePrivateAccess = async (allowed: boolean) => {
    await expect(privateToggle).toHaveJSProperty("checked", !allowed)
    const previousWorker = await getServiceWorker(context)
    let previousWorkerClosed = false
    previousWorker.once("close", () => {
      previousWorkerClosed = true
    })
    // Permission changes reload the extension. Wait for the old worker to
    // close so a permission read cannot succeed on the worker being discarded.
    await privateToggle.click()
    await expect(privateToggle).toHaveJSProperty("checked", allowed)
    await expect
      .poll(() => previousWorkerClosed, {
        message: "pre-permission-change service worker closes",
      })
      .toBe(true)
    await expect
      .poll(async () => {
        const currentWorker = await getServiceWorker(context)
        return currentWorker
          .evaluate(() => {
            const api = (globalThis as any).chrome
            if (!api?.extension?.isAllowedIncognitoAccess) return null
            return new Promise<boolean>((resolve) =>
              api.extension.isAllowedIncognitoAccess(resolve),
            )
          })
          .catch(() => null)
      })
      .toBe(allowed)
  }
  await changePrivateAccess(true)
  // Changing private access closes existing extension pages.
  page = await context.newPage()
  installExtensionPageGuards(page)
  row = page.getByTestId(
    getAccountManagementListItemTestId("login-config-account"),
  )
  dialog = page.getByRole("dialog")
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await row.hover()
  await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
  await expect(
    dialog.getByText("Private browsing access allowed", { exact: true }),
  ).toHaveCount(0)
  await expect(
    dialog.getByText("Allow private browsing for isolated login", {
      exact: true,
    }),
  ).toHaveCount(0)
  await expect(
    dialog.getByText(
      "Keep password login separate from regular windows to avoid account mix-ups and session interference.",
      { exact: true },
    ),
  ).toHaveCount(0)
  await captureVisualViews({
    page,
    ready: dialog.locator("#account-login-password"),
    id: "account-login-private-access-granted",
    extensionDir,
  })
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  const privateWorker = await getServiceWorker(context)
  await privateWorker.evaluate(() => {
    const chromeApi = (globalThis as any).chrome
    const create = chromeApi.windows.create.bind(chromeApi.windows)
    // Keep this browser-boundary check offline: observe the real private
    // window chosen by password login before any site credentials dispatch.
    chromeApi.windows.create = async (options: Record<string, unknown>) => {
      chromeApi.windows.create = create
      const opened = await create({ ...options, url: "about:blank" })
      ;(globalThis as any).__passwordLoginWindow = {
        id: opened.id,
        incognito: opened.incognito,
      }
      return opened
    }
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#autoCheckin`,
  )
  await page.getByRole("button", { name: "Run now", exact: true }).click()
  await expect
    .poll(() =>
      privateWorker.evaluate(
        () => (globalThis as any).__passwordLoginWindow?.incognito,
      ),
    )
    .toBe(true)
  await privateWorker.evaluate(async () => {
    await (globalThis as any).chrome.windows.remove(
      (globalThis as any).__passwordLoginWindow.id,
    )
  })
  await expect
    .poll(
      async () =>
        (
          await getPlasmoStorageJsonValue<AutoCheckinStatus>(
            privateWorker,
            "autoCheckin_status",
          )
        )?.perAccount?.["login-config-account"]?.status,
    )
    .toBe("failed")
  await settings.bringToFront()
  await changePrivateAccess(false)
  await settings.close()
  const regularWorker = await getServiceWorker(context)
  page = await context.newPage()
  installExtensionPageGuards(page)
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#autoCheckin`,
  )
  const releaseNavigation = await holdExtensionWindowNavigation(
    context,
    regularWorker,
    "https://agentrouter.org/login",
  )
  await page.getByRole("button", { name: "Run now", exact: true }).click()
  await releaseNavigation()
  await expect
    .poll(
      async () =>
        (
          await getPlasmoStorageJsonValue<AutoCheckinStatus>(
            regularWorker,
            "autoCheckin_status",
          )
        )?.perAccount?.["login-config-account"]?.status,
      { timeout: 30_000 },
    )
    .toBe("success")
  expect(loginBodies).toEqual([
    { username: "native-member", password: " fixture password " },
  ])
})
