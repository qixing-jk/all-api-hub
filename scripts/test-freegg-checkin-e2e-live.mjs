/* global chrome */
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as ids } from "../src/features/AccountManagement/testIds.ts"
import { connectWorktreeExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { runLiveSuites } from "./cdp/live-suites.mjs"
import { getAccounts, withUiCreatedAccount } from "./cdp/sandbox.mjs"
import { dismissModals, openExtensionPage } from "./cdp/ui-driver.mjs"
import { openAccountAddDialog } from "./flows/auto-detect.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

loadLocalEnv()
applyIsolateFlag(process.argv)
const origin = "https://freegg.app"
const methodId = "freegg:daily-allowance"
const token = process.env.FREEGG_ACCESS_TOKEN?.trim()
// Assertion against independently verified native identity; never a form prefill.
const expectedUserId = process.env.FREEGG_EXPECTED_USER_ID
const extensionPath = path.resolve(".output/chrome-mv3")
const evidenceRoot = path.resolve("test-results/freegg-live")

/** Read-only token validation, independent of the native browser Cookie session. */
async function ledger() {
  const response = await fetch(
    `${origin}/api/log/self?p=1&page_size=100&type=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "New-Api-User": expectedUserId,
      },
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    },
  )
  assert.equal(response.status, 200, "Saved token must read the ledger")
  const body = await response.json()
  assert.equal(body.success, true, "Saved token must be accepted")
  assert(Array.isArray(body.data?.items), "Structured ledger required")
  assert(
    body.data.items.every((item) => String(item.user_id) === expectedUserId),
    "Ledger identity must match the native account",
  )
  return body.data
}

/** Complete ordinary detection and existing-token continuation, then daily operation. */
async function onboardingAndCheckin() {
  const evidenceDir = await fs.mkdtemp(path.join(evidenceRoot, "workflow-"))
  const before = await ledger()
  const dev = await connectWorktreeExtension({ extensionPath })
  const requests = []
  const observe = (request) => {
    const url = new URL(request.url())
    if (url.origin === origin && url.pathname.startsWith("/api/"))
      requests.push({
        at: Date.now(),
        path: url.pathname,
        method: request.method(),
      })
  }
  dev.context.on("request", observe)
  let page
  let checkin
  let executionError
  const cleanupErrors = []
  try {
    page = await openExtensionPage({
      context: dev.context,
      extensionId: dev.extensionId,
      route: "options.html#account",
      language: "en",
      viewport: { width: 1500, height: 1050 },
      dismissUpdateLog: true,
    })
    await page.emulateMedia({ reducedMotion: "reduce" })
    const notNow = page.getByRole("button", { name: "Not now", exact: true })
    if (await notNow.isVisible()) await notNow.click()
    await withUiCreatedAccount(
      dev.serviceWorker,
      async (name) => {
        const dialog = await openAccountAddDialog({ page, targetUrl: origin })
        await dialog.getByTestId(ids.autoDetectButton).click()
        await expect(
          page.getByRole("button", { name: "Open full form", exact: true }),
        ).toBeVisible({ timeout: 90_000 })
        await page.getByRole("dialog").screenshot({
          path: path.join(evidenceDir, "credential-continuation.png"),
          mask: [page.locator('input[type="password"]')],
        })
        await page
          .getByRole("button", { name: "Open full form", exact: true })
          .click()
        await expect(dialog.getByTestId(ids.siteTypeTrigger)).toHaveAttribute(
          "data-site-type",
          "new-api",
        )
        await expect(dialog.getByTestId(ids.userIdInput)).toHaveValue(
          expectedUserId,
        )
        assert.equal(
          await dialog.getByTestId(ids.accessTokenInput).inputValue(),
          "",
          "Detection must request a scoped token",
        )
        await expect(
          dialog.getByRole("button", { name: "Get from site", exact: true }),
        ).toBeVisible()
        await dialog.getByTestId(ids.siteNameInput).fill(name)
        await dialog.getByTestId(ids.accessTokenInput).fill(token)
        await dialog.getByTestId(ids.confirmAddButton).click()
        await expect(dialog).toBeHidden({ timeout: 90_000 })
        await dismissModals(page)
      },
      async (account) => {
        assert.equal(account.site_type, "new-api")
        assert.equal(String(account.account_info.id), expectedUserId)
        assert(
          account.account_info.access_token === token,
          "UI must save the supplied scoped token",
        )
        const row = page.getByTestId(
          `account-management-account-list-item-${account.id}`,
        )
        await row.hover()
        await row.getByTestId(ids.rowEditButton).click()
        const dialog = page.getByTestId(ids.accountDialog)
        await expect(dialog.getByTestId(ids.userIdInput)).toHaveValue(
          expectedUserId,
        )
        assert(
          (await dialog.getByTestId(ids.accessTokenInput).inputValue()) ===
            token,
          "Reopened credential must match",
        )
        const section = dialog.getByTestId(ids.accountFormSectionCheckIn)
        await section.scrollIntoViewIfNeeded()
        await section
          .getByRole("button", {
            name: /^(Detect method|Re-detect check-in method)$/,
          })
          .click()
        await expect(
          section.getByRole("button", {
            name: /^(Detect method|Re-detect check-in method)$/,
          }),
        ).not.toHaveAttribute("aria-busy", "true", { timeout: 90_000 })
        await expect(section).toContainText("UTC+8", { timeout: 90_000 })
        const automatic = dialog.locator(
          "#account-check-in-automatic-execution",
        )
        if ((await automatic.getAttribute("aria-checked")) !== "true")
          await automatic.click()
        await dialog.getByTestId(ids.confirmAddButton).click()
        await expect(dialog).toBeHidden({ timeout: 60_000 })
        await dismissModals(page)
        const saved = (await getAccounts(dev.serviceWorker)).find(
          (item) => item.id === account.id,
        )
        assert.equal(saved.checkIn.selection.methodId, methodId)
        assert.equal(saved.checkIn.automaticExecutionEnabled, true)
        assert.equal(
          saved.checkIn.methodKnowledge.methods[methodId].detection.outcome,
          "matched",
        )
        await row.hover()
        await row.getByTestId(ids.rowEditButton).click()
        await section.scrollIntoViewIfNeeded()
        await section.screenshot({
          path: path.join(evidenceDir, "persisted-method.png"),
        })
        await dialog
          .getByRole("button", { name: "Cancel", exact: true })
          .click()
        await row.getByTestId(ids.rowMoreActionsButton).click()
        const syncBefore = (await getAccounts(dev.serviceWorker)).find(
          (item) => item.id === account.id,
        ).last_sync_time
        const refreshed = page.waitForResponse(
          (response) =>
            response.url() === `${origin}/api/user/self` &&
            response.status() === 200,
        )
        await page.getByTestId(ids.rowRefreshMenuItem).click()
        const nativeReadback = (await (await refreshed).json()).data
        assert.equal(String(nativeReadback.id), expectedUserId)
        await expect
          .poll(
            async () =>
              (await getAccounts(dev.serviceWorker)).find(
                (item) => item.id === account.id,
              )?.last_sync_time,
            { timeout: 60_000 },
          )
          .toBeGreaterThan(syncBefore)
        await expect(row).toContainText(
          `$${(nativeReadback.quota / 500000).toFixed(2)}`,
        )

        checkin = await openExtensionPage({
          context: dev.context,
          extensionId: dev.extensionId,
          route: "options.html#autoCheckin",
          language: "en",
          viewport: { width: 1500, height: 1050 },
          dismissUpdateLog: true,
        })
        assert(
          (await getAccounts(dev.serviceWorker)).every(
            (item) =>
              item.id === account.id ||
              item.disabled ||
              !item.checkIn?.automaticExecutionEnabled,
          ),
          "Run now must only target the test account",
        )
        const start = requests.length
        await checkin.getByTestId("auto-checkin-run-now-button").click()
        let result
        await expect
          .poll(
            async () => {
              result = await dev.serviceWorker.evaluate(async (id) => {
                const raw = (
                  await chrome.storage.local.get("autoCheckin_status")
                ).autoCheckin_status
                const status = typeof raw === "string" ? JSON.parse(raw) : raw
                return status?.perAccount?.[id]
              }, account.id)
              return result?.status
            },
            { timeout: 90_000 },
          )
          .toMatch(/^(already_checked|skipped)$/)
        assert(
          result.status === "already_checked" ||
            result.reasonCode === "already_checked_today",
          "Today's grant must be confirmed, not skipped for ineligibility",
        )
        await expect(
          checkin.getByTestId("auto-checkin-run-now-button"),
        ).toBeEnabled({ timeout: 60_000 })
        assert.equal(
          requests.slice(start).filter((item) => item.path === "/api/user/self")
            .length,
          0,
          "Already claimed execution must not mutate or refresh self",
        )
        const after = await ledger()
        assert.equal(
          after.total,
          before.total,
          "Already claimed run must not create income",
        )
        await checkin.screenshot({
          path: path.join(evidenceDir, "execution-result.png"),
          fullPage: true,
        })
        await fs.writeFile(
          path.join(evidenceDir, "result.json"),
          JSON.stringify(
            {
              extensionId: dev.extensionId,
              extensionPath,
              result,
              beforeTotal: before.total,
              afterTotal: after.total,
              requests,
            },
            null,
            2,
          ),
        )
        // Optional actual mutation coverage: prepare the account before midnight,
        // then leave the site idle until the real deployment day changes.
        if (process.argv.includes("--await-reset")) {
          const resetAt =
            (Math.floor((Date.now() + 8 * 3600000) / 86400000) + 1) * 86400000 -
            8 * 3600000 +
            3000
          assert(
            resetAt - Date.now() < 30 * 60000,
            "Start reset acceptance within 30 minutes of midnight UTC+8",
          )
          for (const nativePage of dev.context.pages()) {
            if (nativePage.url().startsWith(origin)) await nativePage.close()
          }
          console.log(
            "Existing-token workflow passed; prepared account is idle until the actual UTC+8 reset.",
          )
          while (Date.now() < resetAt)
            await new Promise((resolve) =>
              setTimeout(resolve, Math.min(30000, resetAt - Date.now())),
            )
          const claimStart = requests.length
          const claimAt = Date.now()
          await checkin.getByTestId("auto-checkin-run-now-button").click()
          await expect
            .poll(
              async () => {
                result = await dev.serviceWorker.evaluate(async (id) => {
                  const raw = (
                    await chrome.storage.local.get("autoCheckin_status")
                  ).autoCheckin_status
                  return (typeof raw === "string" ? JSON.parse(raw) : raw)
                    ?.perAccount?.[id]
                }, account.id)
                return result?.timestamp >= claimAt ? result.status : undefined
              },
              { timeout: 90_000 },
            )
            .toBe("success")
          await expect(
            checkin.getByTestId("auto-checkin-run-now-button"),
          ).toBeEnabled({ timeout: 60_000 })
          assert.equal(
            requests
              .slice(claimStart)
              .filter((item) => item.path === "/api/user/self").length,
            1,
            "One explicit daily mutation only",
          )
          const claimed = await ledger()
          assert.equal(
            claimed.total,
            after.total + 1,
            "Exactly one allowance must be credited",
          )
          assert.equal(
            result.awards?.[0]?.amount?.value,
            "20",
            "Verified deployment grants USD 20",
          )
          assert.equal(result.awards?.[0]?.asset?.code, "USD")
          await checkin.screenshot({
            path: path.join(evidenceDir, "actual-claim.png"),
            fullPage: true,
          })
          await fs.writeFile(
            path.join(evidenceDir, "actual-claim.json"),
            JSON.stringify(
              {
                result,
                previousTotal: after.total,
                total: claimed.total,
                record: {
                  type: claimed.items[0].type,
                  created_at: claimed.items[0].created_at,
                  quota: claimed.items[0].quota,
                  other: claimed.items[0].other,
                },
                requests: requests.slice(claimStart),
              },
              null,
              2,
            ),
          )
        }
      },
    )
  } catch (error) {
    executionError = error
    if (page)
      await page
        .screenshot({
          path: path.join(evidenceDir, "failure.png"),
          mask: [
            page.locator('input[type="password"]'),
            page.getByTestId(ids.accessTokenInput),
          ],
        })
        .catch(() => {})
  } finally {
    await fs
      .writeFile(
        path.join(evidenceDir, "requests.json"),
        JSON.stringify(requests, null, 2),
      )
      .catch((error) => cleanupErrors.push(error))
    dev.context.off("request", observe)
    for (const owned of [checkin, page])
      if (owned) await owned.close().catch((error) => cleanupErrors.push(error))
    await dev.close().catch((error) => cleanupErrors.push(error))
  }
  if (executionError || cleanupErrors.length)
    throw new AggregateError(
      [executionError, ...cleanupErrors].filter(Boolean),
      [executionError?.message, ...cleanupErrors.map((error) => error.message)]
        .filter(Boolean)
        .join("; "),
    )
}

await fs.mkdir(evidenceRoot, { recursive: true })
await runLiveSuites({
  suite:
    process.argv.find((arg) => arg.startsWith("--suite="))?.slice(8) ?? "all",
  evidenceDir: evidenceRoot,
  environment: {
    extensionPath,
    origin,
    credentialPath: "existing-scoped-token",
  },
  suites: [
    {
      id: "existing-token-onboarding-and-checkin",
      covers: [
        "normal-detection",
        "credential-continuation",
        "save-reopen-refresh",
        "method-discovery",
        "automatic-intent",
        "already-claimed-no-mutation",
        "result-history",
        "owned-account-cleanup",
      ],
      prerequisite: () =>
        !token || !expectedUserId
          ? "Configure FREEGG_ACCESS_TOKEN and independently verified FREEGG_EXPECTED_USER_ID in shared .env.local"
          : undefined,
      run: onboardingAndCheckin,
    },
  ],
})
