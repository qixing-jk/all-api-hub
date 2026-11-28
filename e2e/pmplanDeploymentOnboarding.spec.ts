import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import {
  ACCOUNT_MANAGEMENT_TEST_IDS as accounts,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import {
  PMPLAN_ENDPOINTS,
  PMPLAN_PROGRAM_NAME,
} from "~/services/apiService/pmplan/constants"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { readStoredAccounts } from "~~/e2e/scenarios/accountManualAdd"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { openAccountManagementPage } from "~~/e2e/utils/realSite/accountAdd"
import {
  assertAccountDetectionOutcome,
  closeAccountDraft,
  detectAccountSiteType,
  openAccountAddDialog,
} from "~~/scripts/flows/auto-detect.mjs"

// Native upstream response fixtures. Website Cookie setup is synthetic; extension
// identity, credential acquisition and persistence run through the normal UI.
test("PM-Plan discovers independent deployments and preserves their sessions through save and refresh", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  let officialRequests = 0
  const expiredOrigins = new Set<string>()
  const identityReads = new Map<string, number>()
  // A real HTTP boundary observes headers after Chromium's DNR rules run.
  const server = createServer((request, response) => {
    const origin = `http://${request.headers.host}`
    const pathname = new URL(request.url!, origin).pathname
    const index = new URL(origin).hostname === "localhost" ? 1 : 0
    const json = (body: unknown, status = 200) => {
      response.writeHead(status, { "content-type": "application/json" })
      response.end(JSON.stringify(body))
    }
    if (pathname === PMPLAN_ENDPOINTS.Health)
      return json({
        ok: true,
        name: PMPLAN_PROGRAM_NAME,
        version: "0.1.0",
        time: "2026-11-28T00:00:00Z",
      })
    if (pathname === "/api/me") {
      identityReads.set(origin, (identityReads.get(origin) ?? 0) + 1)
      if (
        expiredOrigins.has(origin) ||
        request.headers.cookie !== `pmplan_session=instance-${index}` ||
        request.headers.authorization
      )
        return json({ error: "unauthorized" }, 401)
      return json({
        user: { id: 661, username: `user-${index}` },
        plan: { name: "Lite" },
        usage: {
          h5_used: 250000,
          h5_limit: 1000000,
          weekly_used: 500000,
          weekly_limit: 2000000,
          monthly_used: 1000000,
          monthly_limit: 5000000,
          requests_30d: 12,
          tokens_30d: 450,
        },
        checkin: {
          today: "2026-11-28",
          checked_in_today: true,
          can_checkin: false,
          streak: 1,
        },
      })
    }
    if (pathname === "/") {
      response.writeHead(200, { "content-type": "text/html" })
      return response.end(
        "<html><title>My custom gateway</title><body>Console</body></html>",
      )
    }
    return json({ error: "not found" }, 404)
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const port = (server.address() as AddressInfo).port
  const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`]
  try {
    await context.route("https://plan.pmcat.top/**", (route) => {
      officialRequests++
      return route.abort()
    })
    await forceExtensionLanguage(page, "en")
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      autoFillCurrentSiteUrlOnAccountAdd: false,
      autoProvisionKeyOnAccountAdd: false,
    })
    for (const [index, origin] of origins.entries()) {
      await context.addCookies([
        {
          name: "pmplan_session",
          value: `instance-${index}`,
          url: origin,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ])
      const site = await context.newPage()
      await site.goto(origin)
      await openAccountManagementPage({ page, extensionId })
      await page.bringToFront()
      const dialog = await openAccountAddDialog({ page, targetUrl: origin })
      if (index === 0) {
        await dialog.getByTestId(accounts.autoDetectButton).click()
        await expect(
          dialog.getByTestId(accounts.autoDetectErrorMessage),
        ).toContainText("Check the extension permissions")
        await expect(
          dialog.getByTestId(accounts.authTypeTrigger),
        ).toHaveAttribute("data-auth-type", "cookie")
        await expect(dialog.getByTestId(accounts.siteUrlInput)).toHaveValue(
          origin,
        )
        await expect(dialog.getByTestId(accounts.userIdInput)).toHaveValue(
          "661",
        )
        expect(await readStoredAccounts(worker)).toEqual([])
        await dialog.screenshot({
          path: testInfo.outputPath("cookie-permission-recovery.png"),
          animations: "disabled",
        })
        await dialog.getByTestId(accounts.cookiePermissionGrantButton).click()
        await expect
          .poll(() =>
            worker.evaluate(() =>
              chrome.permissions.contains({ permissions: ["cookies"] }),
            ),
          )
          .toBe(true)
      }
      await detectAccountSiteType({ page, expectedType: "pmplan" })
      await assertAccountDetectionOutcome({
        page,
        expectedType: "pmplan",
        fields: {
          siteUrlInput: origin,
          userIdInput: "661",
          usernameInput: `user-${index}`,
        },
        saveState: "enabled",
      })
      await dialog
        .getByTestId(accounts.siteNameInput)
        .fill(`Deployment ${index}`)
      await dialog.getByTestId(accounts.confirmAddButton).click()
      await expect(dialog).toBeHidden()
      await expect
        .poll(
          async () =>
            (await readStoredAccounts(worker)).find(
              (account) => account.site_url === origin,
            )?.health?.status,
        )
        .toBe("healthy")
      const saved = (await readStoredAccounts(worker)).find(
        (account) => account.site_url === origin,
      )!
      expect(saved.authType).toBe("cookie")
      expect(saved.cookieAuth?.sessionCookie).toContain(
        `pmplan_session=instance-${index}`,
      )
      expect(saved.account_info.access_token).toBe("")
      await site.close()
      await context.clearCookies({ domain: new URL(origin).hostname })
      const row = page.getByTestId(getAccountManagementListItemTestId(saved.id))
      await row.getByTestId(accounts.rowEditButton).click()
      await expect(dialog.getByTestId(accounts.siteUrlInput)).toHaveValue(
        origin,
      )
      await expect(dialog.getByTestId(accounts.usernameInput)).toHaveValue(
        `user-${index}`,
      )
      await closeAccountDraft(page)
      const previousReads = identityReads.get(origin) ?? 0
      await row.getByTestId(accounts.rowMoreActionsButton).click()
      await page.getByTestId(accounts.rowRefreshMenuItem).click()
      await expect
        .poll(
          async () =>
            (await readStoredAccounts(worker)).find(
              (account) => account.id === saved.id,
            )?.last_sync_time ?? 0,
        )
        .toBeGreaterThan(saved.last_sync_time)
      await expect
        .poll(() => identityReads.get(origin) ?? 0)
        .toBeGreaterThan(previousReads)
      await expect
        .poll(
          async () =>
            (await readStoredAccounts(worker)).find(
              (account) => account.id === saved.id,
            )?.health?.status,
        )
        .toBe("healthy")
    }
    expect(
      (await readStoredAccounts(worker))
        .filter((account) => account.site_type === "pmplan")
        .map((account) => account.site_url)
        .sort(),
    ).toEqual([...origins].sort())
    expect(officialRequests).toBe(0)
    await page.screenshot({
      path: testInfo.outputPath("independent-deployments.png"),
      animations: "disabled",
    })
    expiredOrigins.add(origins[0]!)
    const savedAccounts = await readStoredAccounts(worker)
    const first = savedAccounts.find(
      (account) => account.site_url === origins[0],
    )!
    await page
      .getByTestId(getAccountManagementListItemTestId(first.id))
      .getByTestId(accounts.rowMoreActionsButton)
      .click()
    await page.getByTestId(accounts.rowRefreshMenuItem).click()
    await expect
      .poll(
        async () =>
          (await readStoredAccounts(worker)).find(
            (account) => account.id === first.id,
          )?.health.reason,
      )
      .toContain("401")
    const afterFailure = await readStoredAccounts(worker)
    expect(
      afterFailure.find((account) => account.id === first.id)?.cookieAuth
        ?.sessionCookie,
    ).toBe(first.cookieAuth?.sessionCookie)
    expect(
      afterFailure.find((account) => account.site_url === origins[1])?.health
        .status,
    ).toBe("healthy")
    expect(officialRequests).toBe(0)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
