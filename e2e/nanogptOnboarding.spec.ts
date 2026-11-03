import fs from "node:fs/promises"

import {
  ACCOUNT_MANAGEMENT_TEST_IDS as accounts,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { getAccounts } from "~~/scripts/cdp/sandbox.mjs"
import {
  assertAccountDetectionOutcome,
  closeAccountDraft,
  openAccountAddDialog,
} from "~~/scripts/flows/auto-detect.mjs"

const SITE = "https://nano-gpt.com"
const API = "https://api.nano-gpt.com"
const ADDRESS = "nano_fixture_account"
const KEY = "sk-nano-fixture-inference"
const OTHER_KEY = "sk-nano-fixture-other-account"

for (const mismatchedRefresh of [false, true]) {
  test(`NanoGPT automatic draft survives key handoff, save and ${mismatchedRefresh ? "mismatched refresh" : "zero-balance refresh"}`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    test.setTimeout(120000)
    await forceExtensionLanguage(page, "en")
    await page.setViewportSize({ width: 1280, height: 960 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await stubLlmMetadataIndex(context)
    let refreshing = false
    const calls: string[] = []
    const logs: string[] = []
    page.on("console", (message) => logs.push(message.text()))
    await context.route(`${SITE}/**`, async (route) => {
      const request = route.request()
      expect(request.method()).toBe("GET") // no console key or invitation creation
      const pathname = new URL(request.url()).pathname
      if (pathname === "/api/auth/session")
        return route.fulfill({
          json: {
            user: {
              id: "00000000-0000-4000-8000-0000000000a1",
              name: "Fixture User",
              email: "fixture@example.invalid",
            },
          },
        })
      if (pathname === "/api/auth/local-session")
        return route.fulfill({
          json: {
            data: {
              nanoDepositAddress: ADDRESS,
              usd_balance: "12.5",
              nano_balance: "3",
            },
          },
        })
      return route.fulfill({
        contentType: "text/html",
        body: "<html><head><title>NanoGPT</title></head><body>Native API key page fixture</body></html>",
      })
    })
    await context.route(`${API}/**`, async (route) => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      }
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers })
      calls.push(`${request.method()} ${pathname}`)
      expect(request.headers().cookie).toBeUndefined()
      expect([`Bearer ${KEY}`, `Bearer ${OTHER_KEY}`]).toContain(
        request.headers().authorization,
      )
      if (pathname === "/api/check-balance") {
        expect(request.method()).toBe("POST")
        return route.fulfill({
          headers,
          json: {
            usd_balance: refreshing ? "0" : "12.5",
            nano_balance: "3",
            nanoDepositAddress:
              request.headers().authorization === `Bearer ${OTHER_KEY}` ||
              (refreshing && mismatchedRefresh)
                ? "nano_other_account"
                : ADDRESS,
          },
        })
      }
      expect(request.method()).toBe("GET")
      if (pathname === "/api/v1/usage")
        return route.fulfill({
          headers,
          json: { totals: { requests: 3, totalTokens: 900, netCostUsd: 1.25 } },
        })
      if (pathname === "/api/subscription/v1/usage")
        return route.fulfill({
          headers,
          json: {
            active: true,
            dailyInputTokens: null,
            weeklyInputTokens: {
              used: 930,
              remaining: 70,
              resetAt: 1_793_707_200_000,
            },
          },
        })
      throw new Error(`Unexpected NanoGPT endpoint: ${pathname}`)
    })
    await page.goto(`chrome-extension://${extensionId}/options.html#account`)
    const worker = await getServiceWorker(context)
    const dialog = await openAccountAddDialog({ page, targetUrl: SITE })
    await dialog.getByTestId(accounts.autoDetectButton).click()
    await assertAccountDetectionOutcome({
      page,
      expectedType: "nanogpt",
      fields: {
        siteUrlInput: SITE,
        usernameInput: "Fixture User",
        userIdInput: ADDRESS,
        accessTokenInput: "",
        exchangeRateInput: "7.2",
      },
      saveState: "absent",
      guidance: "Complete NanoGPT credentials",
      timeoutMs: 60000,
    })
    expect(await getAccounts(worker)).toHaveLength(0)
    expect(calls).toHaveLength(0)
    await expect(
      dialog.getByText("Complete NanoGPT credentials", { exact: true }),
    ).toHaveCount(1)
    await dialog.screenshot({
      path: testInfo.outputPath("01-detection-guidance.png"),
      animations: "disabled",
    })
    const nextPage = context.waitForEvent("page")
    await dialog
      .getByRole("button", { name: "Open NanoGPT API keys", exact: true })
      .click()
    const native = await nextPage
    await native.waitForURL(`${SITE}/api`)
    await native.close()
    await expect(dialog.getByTestId(accounts.userIdInput)).toHaveValue(ADDRESS)
    await expect(dialog.getByTestId(accounts.accessTokenInput)).toHaveValue("")
    await dialog
      .getByTestId(accounts.siteNameInput)
      .fill("NanoGPT fixture onboarding")
    if (mismatchedRefresh) {
      await dialog.getByTestId(accounts.accessTokenInput).fill(OTHER_KEY)
      await dialog.getByTestId(accounts.confirmAddButton).click()
      await expect(
        page.getByText(
          "The detected account does not match the current account.",
          { exact: false },
        ),
      ).toBeVisible()
      await expect(dialog).toBeVisible()
      expect(await getAccounts(worker)).toHaveLength(0)
      await expect(dialog.getByTestId(accounts.userIdInput)).toHaveValue(
        ADDRESS,
      )
      await expect(dialog.getByTestId(accounts.siteNameInput)).toHaveValue(
        "NanoGPT fixture onboarding",
      )
    }
    await dialog.getByTestId(accounts.accessTokenInput).fill(KEY)
    await expect(dialog.getByTestId(accounts.confirmAddButton)).toBeEnabled()
    await dialog.getByTestId(accounts.confirmAddButton).click()
    await dialog.waitFor({ state: "hidden", timeout: 60000 })
    const saved = (await getAccounts(worker))[0]
    if (!saved) throw new Error("No saved NanoGPT account")
    await fs.writeFile(
      testInfo.outputPath("saved-state-and-protocol.json"),
      JSON.stringify({ saved, calls, logs }, null, 2),
    )
    expect(saved).toMatchObject({
      site_type: "nanogpt",
      authType: "access_token",
      account_info: {
        id: ADDRESS,
        username: "Fixture User",
        access_token: KEY,
      },
    })
    const row = page.getByTestId(getAccountManagementListItemTestId(saved.id))
    await expect(row).toBeVisible()
    // Saving is deliberately configuration-first. Verify data through the
    // product's explicit refresh, not by treating the optimistic zero as balance.
    await row.getByTestId(accounts.rowMoreActionsButton).click()
    await page.getByTestId(accounts.rowRefreshMenuItem).click()
    await expect
      .poll(async () => (await getAccounts(worker))[0]?.account_info.quota)
      .toBe(6_250_000)
    const verified = (await getAccounts(worker))[0]
    expect(verified).toMatchObject({
      health: { status: "healthy" },
      account_info: {
        subscription: { isActive: true, remainingTokens: 70, period: "week" },
      },
    })
    await expect(row).toContainText("70")
    await row.getByTestId(accounts.rowEditButton).click()
    await expect(dialog.getByTestId(accounts.accessTokenInput)).toHaveValue(KEY)
    await expect(dialog.getByTestId(accounts.userIdInput)).toHaveValue(ADDRESS)
    await closeAccountDraft(page)
    refreshing = true
    await row.getByTestId(accounts.rowMoreActionsButton).click()
    await page.getByTestId(accounts.rowRefreshMenuItem).click()
    if (mismatchedRefresh) {
      await expect
        .poll(async () => (await getAccounts(worker))[0]?.health.status)
        .not.toBe("healthy")
      const current = (await getAccounts(worker))[0]
      if (!current) throw new Error("Saved account disappeared during refresh")
      expect(current.account_info.quota).toBe(6_250_000)
      expect(current.account_info.id).toBe(ADDRESS)
      expect(current.last_sync_time).toBeGreaterThanOrEqual(
        saved.last_sync_time,
      )
    } else {
      await expect
        .poll(async () => (await getAccounts(worker))[0]?.account_info.quota)
        .toBe(0)
      await expect(row).toContainText("0.00")
      expect((await getAccounts(worker))[0]?.health.status).toBe("healthy")
    }
    await row.screenshot({
      path: testInfo.outputPath("02-refreshed-account.png"),
      animations: "disabled",
    })
    expect(
      calls.filter((call) => call === "POST /api/check-balance").length,
    ).toBeGreaterThanOrEqual(2)
  })
}
