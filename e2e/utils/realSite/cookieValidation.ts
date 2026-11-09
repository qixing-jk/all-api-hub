import { writeFile } from "node:fs/promises"
import type { BrowserContext, Page, TestInfo, Worker } from "@playwright/test"

import type { AccountSiteType } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { AuthTypeEnum } from "~/types"
import { extractSessionCookieHeader } from "~/utils/browser/cookieString"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  readStoredAccounts,
  saveManualAccountFromApp,
} from "~~/e2e/scenarios/accountManualAdd"
import { requestAndExpectOptionalPermissions } from "~~/e2e/utils/extensionState"
import { openAccountManagementPage } from "~~/e2e/utils/realSite/accountAdd"

/** Exercise supplied Cookie authentication against the hosted server through the editor. */
export async function verifyRealSiteCookieThroughUi(params: {
  context: BrowserContext
  page: Page
  sitePage: Page
  worker: Worker
  extensionId: string
  baseUrl: string
  siteType: AccountSiteType
  userId: string
  cookieIdentityHeader?: string
  testInfo: TestInfo
}) {
  const { context, page, sitePage, worker, userId, testInfo } = params
  page.setDefaultTimeout(20_000)
  const origin = new URL(params.baseUrl).origin
  const nativeIdentity = async () =>
    sitePage.evaluate(
      async ({ userId, header }) => {
        const response = await fetch("/api/user/self", {
          credentials: "include",
          headers: header ? { [header]: userId } : {},
        })
        const body = await response.json()
        return {
          status: response.status,
          success: body.success === true,
          identityMatches: String(body.data?.id ?? "") === userId,
        }
      },
      { userId, header: params.cookieIdentityHeader },
    )
  expect(await nativeIdentity()).toEqual({
    status: 200,
    success: true,
    identityMatches: true,
  })
  const session = (await context.cookies(origin)).find(
    (cookie) => cookie.name === "session",
  )
  expect(
    Boolean(session?.value),
    "Login must write a real session Cookie",
  ).toBe(true)
  const validCookie = `session=${session!.value}`
  await openAccountManagementPage({ page, extensionId: params.extensionId })
  await requestAndExpectOptionalPermissions(page, ["cookies"])
  const account = await saveManualAccountFromApp({
    page,
    extensionId: params.extensionId,
    serviceWorker: worker,
    baseUrl: params.baseUrl,
    siteType: params.siteType,
    account: {
      authType: AuthTypeEnum.Cookie,
      siteName: "Real Cookie validation",
      username: "Cookie validation",
      userId,
      cookieAuthSessionCookie: validCookie,
    },
  })
  expect(account.account_info.access_token).toBe("")
  expect(account.cookieAuth?.sessionCookie === validCookie).toBe(true)

  const row = page.getByTestId(getAccountManagementListItemTestId(account.id))
  const dialog = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
  const group = dialog.getByRole("group", {
    name: "Session Cookie",
    exact: true,
  })
  const input = group.getByRole("textbox")
  const status = group.getByRole("status")
  const openEditor = async () => {
    await row.hover()
    await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
    await expect(input).toBeVisible()
  }
  await openEditor()

  // Ordinary Playwright headers may precede DNR. CDP ExtraInfo observes the
  // outgoing headers; reduce them immediately so evidence never contains secrets.
  const cdp = await context.newCDPSession(page)
  await cdp.send("Network.enable")
  let stage = "valid"
  let expectedCookie = validCookie
  type Evidence = {
    stage: string
    sentExpectedCookie?: boolean
    authorizationAbsent?: boolean
    status?: number
    success?: boolean
    identityMatches?: boolean
  }
  const requests = new Map<string, Evidence>()
  const headers = new Map<
    string,
    Pick<Evidence, "sentExpectedCookie" | "authorizationAbsent">
  >()
  const pending = new Set<Promise<void>>()
  cdp.on("Network.requestWillBeSent", ({ requestId, request }) => {
    const url = new URL(request.url)
    if (
      url.origin === origin &&
      url.pathname === "/api/user/self" &&
      request.method === "GET"
    ) {
      requests.set(requestId, { stage, ...headers.get(requestId) })
    }
  })
  cdp.on(
    "Network.requestWillBeSentExtraInfo",
    ({ requestId, headers: raw }) => {
      const normalized = Object.fromEntries(
        Object.entries(raw).map(([key, value]) => [key.toLowerCase(), value]),
      )
      const safeHeaders = {
        sentExpectedCookie:
          extractSessionCookieHeader(String(normalized.cookie ?? "")) ===
          expectedCookie,
        authorizationAbsent: !normalized.authorization,
      }
      headers.set(requestId, safeHeaders)
      const request = requests.get(requestId)
      if (request) Object.assign(request, safeHeaders)
    },
  )
  cdp.on("Network.responseReceived", ({ requestId, response }) => {
    const request = requests.get(requestId)
    if (request) request.status = response.status
  })
  cdp.on("Network.loadingFinished", ({ requestId }) => {
    const request = requests.get(requestId)
    if (!request) return
    const read = (async () => {
      try {
        const response = await cdp.send("Network.getResponseBody", {
          requestId,
        })
        const body = JSON.parse(
          response.base64Encoded
            ? Buffer.from(response.body, "base64").toString("utf8")
            : response.body,
        )
        request.success = body.success === true
        request.identityMatches = String(body.data?.id ?? "") === userId
      } catch {
        // The assertions below require readable server evidence, not just a toast.
      }
    })()
    pending.add(read)
    void read.finally(() => pending.delete(read))
  })
  const verify = async (nextStage: string, cookie: string, valid: boolean) => {
    stage = nextStage
    expectedCookie = cookie
    await group
      .getByRole("button", { name: "Verify this Cookie", exact: true })
      .click()
    await expect(status).toContainText(
      valid ? "Cookie verified for this account." : "This Cookie is invalid.",
      { timeout: 60_000 },
    )
    await expect
      .poll(() => [...requests.values()].filter((row) => row.stage === stage), {
        message:
          "The hosted server must receive the supplied Cookie without a Token",
      })
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sentExpectedCookie: true,
            authorizationAbsent: true,
            success: valid,
            identityMatches: valid,
          }),
        ]),
      )
  }
  try {
    await test.step("Valid stored Cookie authenticates without an Access Token", async () => {
      await verify("valid", validCookie, true)
    })
    await test.step("Invalid draft Cookie cannot borrow the ambient browser login", async () => {
      const invalidCookie = "session=aah-e2e-invalid-session"
      await input.fill(invalidCookie)
      await verify("invalid-with-browser-login", invalidCookie, false)
      expect(await nativeIdentity()).toEqual({
        status: 200,
        success: true,
        identityMatches: true,
      })
      const stored = (await readStoredAccounts(worker)).find(
        (candidate) => candidate.id === account.id,
      )
      expect(stored?.cookieAuth?.sessionCookie === validCookie).toBe(true)
    })
    await test.step("Import restores a valid Cookie and survives saving and reopening", async () => {
      stage = "import"
      expectedCookie = validCookie
      await dialog
        .getByRole("button", { name: "Import from current login", exact: true })
        .click()
      await expect
        .poll(async () => (await input.inputValue()) === validCookie)
        .toBe(true)
      await verify("imported", validCookie, true)
      await dialog
        .getByRole("button", { name: "Save Changes", exact: true })
        .click()
      await expect(dialog).toBeHidden({ timeout: 30_000 })
      await page.reload()
      await openEditor()
      await expect
        .poll(async () => (await input.inputValue()) === validCookie)
        .toBe(true)
      await verify("reopened", validCookie, true)
      const stored = (await readStoredAccounts(worker)).find(
        (candidate) => candidate.id === account.id,
      )
      expect(stored?.authType).toBe(AuthTypeEnum.Cookie)
      expect(stored?.account_info.access_token).toBe("")
      expect(stored?.cookieAuth?.sessionCookie === validCookie).toBe(true)
    })
  } finally {
    await Promise.all(pending)
    const evidencePath = testInfo.outputPath("detection-cookie-validation.json")
    await writeFile(
      evidencePath,
      JSON.stringify([...requests.values()], null, 2),
    )
    await testInfo.attach("real-cookie-wire-evidence", {
      path: evidencePath,
      contentType: "application/json",
    })
    if (!page.isClosed()) await cdp.detach()
  }
}
