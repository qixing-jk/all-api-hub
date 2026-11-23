#!/usr/bin/env node
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { expect } from "@playwright/test"

import {
  getAccountManagementListItemTestId,
  ACCOUNT_MANAGEMENT_TEST_IDS as ids,
} from "../src/features/AccountManagement/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { connectWorktreeExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { runLiveSuites } from "./cdp/live-suites.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import {
  createUiCapture,
  navigateExtensionPage,
  openExtensionPage,
} from "./cdp/ui-driver.mjs"
import {
  closeAccountDraft,
  openAccountAddDialog,
} from "./flows/auto-detect.mjs"
import { testModelCatalogFlow } from "./flows/model-catalog.mjs"
import { fillSecret } from "./flows/new-api-token-ui.mjs"
import { readShellLiveConfig } from "./suites/shell/config.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

const { values } = parseArgs({
  options: {
    site: { type: "string", default: "all" },
    "env-file": { type: "string" },
    "extension-path": { type: "string", default: ".output/chrome-mv3" },
    "evidence-dir": {
      type: "string",
      default: ".scratch/apiyi-laozhang-relationship/artifacts/live",
    },
    isolate: { type: "boolean" },
  },
})
loadLocalEnv({ envFile: values["env-file"] })
applyIsolateFlag(process.argv)
const targets = readShellLiveConfig(values.site)
const evidenceRoot = path.resolve(values["evidence-dir"])
execFileSync("git", [
  "check-ignore",
  "--quiet",
  path.join(evidenceRoot, "report.json"),
])
await fs.mkdir(evidenceRoot, { recursive: true })
const extensionPath = path.resolve(values["extension-path"])
const dev = await connectWorktreeExtension({ extensionPath })
const failures = []
try {
  for (const config of targets) {
    try {
      await runSite(config)
    } catch (error) {
      failures.push(error)
    }
  }
} finally {
  await dev.close()
}
if (failures.length)
  throw new AggregateError(
    failures,
    "Shell live acceptance incomplete; inspect the per-site reports",
  )

/** All provider interaction starts in native or extension UI; no seeded accounts. */
async function runSite(config) {
  const { id, origin } = config
  const directory = await fs.mkdtemp(path.join(evidenceRoot, `${id}-`))
  let ui,
    user,
    account,
    capture,
    identityVerified = false,
    detectionVerified = false,
    accountVerified = false
  const accountName = `AAH Shell CDP ${randomUUID()}`
  const before = new Set(
    (await getAccounts(dev.serviceWorker)).map((a) => a.id),
  )
  const site = await dev.context.newPage()
  const environment = {
    site: id,
    origin,
    extensionPath,
    extensionId: dev.extensionId,
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    browser: await dev.browser.version(),
    credentialSource: "not-acquired",
    screenshots: [],
    exclusions: [
      "key creation/edit/delete/reveal",
      "redemption consumption",
      "paid inference",
      "usage-history synchronization",
      "announcement content parity",
      "Cookie-free System token validation",
      "native pricing value parity",
      "expired-session recovery",
    ],
  }
  // Keep only identity/balance facts from the site's ordinary profile request.
  const observations = new Set()
  const observe = (response) => {
    const url = new URL(response.url())
    if (url.origin !== origin || url.pathname !== "/api/user/self") return
    const pending = response
      .json()
      .then((body) => {
        if (
          response.ok() &&
          body.success === true &&
          body.data?.id &&
          body.data?.username
        )
          user = {
            id: String(body.data.id),
            username: body.data.username,
            quota: body.data.quota,
          }
      })
      .catch(() => {})
      .finally(() => observations.delete(pending))
    observations.add(pending)
  }
  site.on("response", observe)
  const needsIdentity = () =>
    !identityVerified &&
    "Native profile identity is unverified; supply matching local env login credentials or sign in in the dev browser"
  const needsAccount = () =>
    !accountVerified &&
    "A matching account has not been saved and refreshed successfully by this run"
  const accountRow = () =>
    ui.getByTestId(getAccountManagementListItemTestId(account.id))
  const route = async (hash) =>
    navigateExtensionPage(
      ui,
      `chrome-extension://${dev.extensionId}/options.html#${hash}`,
    )
  const suites = [
    {
      id: "native-login",
      covers: [
        "existing native session or env password login",
        "passively observed profile identity",
      ],
      run: async () => {
        await site.goto(`${origin}/account/profile`, {
          waitUntil: "domcontentloaded",
        })
        await expect
          .poll(
            async () => {
              await Promise.allSettled([...observations])
              return (
                !!user ||
                (await site
                  .getByPlaceholder(/Please enter your username|请输入用户名/u)
                  .isVisible())
              )
            },
            { timeout: 30_000 },
          )
          .toBe(true)
        if (!user) {
          if (!config.username || !config.password)
            return { skipped: true, reason: needsIdentity() }
          assert.equal(
            new URL(site.url()).origin,
            origin,
            "Native login changed origin",
          )
          await fillSecret(
            site.getByPlaceholder(/Please enter your username|请输入用户名/u),
            config.username,
            "Shell username",
          )
          await fillSecret(
            site.getByPlaceholder(/Please enter your password|请输入密码/u),
            config.password,
            "Shell password",
          )
          const agreement = site.getByRole("checkbox")
          if ((await agreement.count()) === 1 && !(await agreement.isChecked()))
            await agreement.check()
          // Submit once; challenges and failed credentials remain explicit failures.
          await site
            .getByRole("button", { name: /^(Login|登录)$/u })
            .last()
            .click()
          await site.waitForURL(
            (url) =>
              url.origin === origin && !url.pathname.startsWith("/login"),
            { timeout: 45_000 },
          )
          await site.goto(`${origin}/account/profile`, {
            waitUntil: "domcontentloaded",
          })
          await expect.poll(() => !!user, { timeout: 30_000 }).toBe(true)
        }
        if (config.expectedUserId)
          assert.equal(
            user.id,
            config.expectedUserId,
            "Native identity differs from the configured test account",
          )
        identityVerified = true
      },
    },
    {
      id: "detection",
      covers: [
        "hosted site type preserved",
        "identity detection or signed-out guidance",
        "default token acquisition outcome",
      ],
      run: async () => {
        ui = await openExtensionPage({
          context: dev.context,
          extensionId: dev.extensionId,
          route: "options.html#account",
          language: "en",
          viewport: { width: 1440, height: 1000 },
          autoDismissModals: false,
          dismissUpdateLog: true,
        })
        capture = createUiCapture({
          page: ui,
          directory,
          screenshots: environment.screenshots,
          mask: [
            ui.getByTestId(ids.accessTokenInput),
            ui.locator("textarea"),
            ui.getByTestId(keys.keyResourceSecretDisplay),
          ],
        })
        const dialog = await openAccountAddDialog({
          page: ui,
          targetUrl: origin,
        })
        await dialog.getByTestId(ids.autoDetectButton).click()
        await expect(dialog.getByTestId(ids.siteTypeTrigger)).toHaveAttribute(
          "data-site-type",
          id,
          { timeout: 60_000 },
        )
        await expect
          .poll(
            async () => {
              const detect = dialog.getByTestId(ids.autoDetectButton)
              return (
                !(await detect.count()) ||
                (await detect.getAttribute("aria-busy")) !== "true"
              )
            },
            { timeout: 60_000 },
          )
          .toBe(true)
        if (user) {
          assert.equal(
            identityVerified,
            true,
            "Native identity verification failed",
          )
          await expect(dialog.getByTestId(ids.userIdInput)).toHaveValue(user.id)
          await expect(dialog.getByTestId(ids.usernameInput)).toHaveValue(
            user.username,
          )
        } else {
          await expect(dialog.getByTestId(ids.userIdInput)).toHaveValue("")
          await expect(
            dialog.getByTestId(ids.autoDetectErrorMessage),
          ).toContainText("signed-in account could not be confirmed")
          await expect(dialog.getByTestId(ids.confirmAddButton)).toBeHidden()
        }
        await capture("detection", dialog)
        detectionVerified = true
      },
    },
    {
      id: "account",
      covers: [
        "UI save",
        "matching native balance",
        "refresh",
        "reopen identity/auth",
      ],
      prerequisite: () =>
        needsIdentity() ||
        (!detectionVerified && "Extension identity detection has not passed"),
      run: async () => {
        const dialog = ui.getByTestId(ids.accountDialog)
        if (config.accessToken) {
          await fillSecret(
            dialog.getByTestId(ids.accessTokenInput),
            config.accessToken,
            "existing Shell System token",
          )
          environment.credentialSource = "existing-env-system-token"
        } else if (
          await dialog.getByTestId(ids.accessTokenInput).inputValue()
        ) {
          environment.credentialSource = "automatic-acquisition"
        } else {
          await expect(
            dialog.getByRole("button", {
              name: /Open (?:APIYI|LaoZhang) profile/iu,
            }),
          ).toBeVisible()
          await dialog.getByTestId(ids.authTypeTrigger).click()
          await ui
            .getByRole("option", { name: "Cookie Authentication", exact: true })
            .click()
          environment.credentialSource = "explicit-cookie-alternative"
          const grant = dialog.getByTestId(ids.cookiePermissionGrantButton)
          if (await grant.isVisible()) {
            await grant.click()
            await expect(grant).toBeHidden({ timeout: 45_000 })
          }
          await dialog
            .getByRole("button", {
              name: "Import from current login",
              exact: true,
            })
            .click()
          await expect
            .poll(
              async () =>
                !!(await dialog
                  .getByPlaceholder("Paste Cookie header value", {
                    exact: true,
                  })
                  .inputValue()),
              { timeout: 45_000 },
            )
            .toBe(true)
        }
        await dialog.getByTestId(ids.siteNameInput).fill(accountName)
        await expect(dialog.getByTestId(ids.confirmAddButton)).toBeEnabled({
          timeout: 30_000,
        })
        await dialog.getByTestId(ids.confirmAddButton).click()
        await expect(dialog).toBeHidden({ timeout: 60_000 })
        await expect
          .poll(async () => {
            account = (await getAccounts(dev.serviceWorker)).find(
              (a) => !before.has(a.id) && a.site_name === accountName,
            )
            return !!account
          })
          .toBe(true)
        const card = accountRow()
        await card.getByTestId(ids.rowMoreActionsButton).click()
        await ui.getByTestId(ids.rowRefreshMenuItem).click()
        const savedAt = account.last_sync_time
        await expect
          .poll(
            async () => {
              account = (await getAccounts(dev.serviceWorker)).find(
                (a) => a.id === account.id,
              )
              return (
                account.last_sync_time > savedAt &&
                account.health?.status === "healthy"
              )
            },
            { timeout: 60_000 },
          )
          .toBe(true)
        assert.equal(account.site_type, id)
        assert.equal(String(account.account_info.id), user.id)
        const usd = account.account_info.balance?.positions.find(
          (p) => p.asset.kind === "currency" && p.asset.code === "USD",
        )
        assert.ok(
          usd && Number.isFinite(Number(user.quota)),
          "Native quota and normalized USD balance are required",
        )
        assert.equal(
          Number(usd.amount.value),
          Number(user.quota) / 500000,
          "Saved USD balance must match native quota",
        )
        await capture("account", card)
        await card.hover()
        await card.getByTestId(ids.rowEditButton).click()
        await expect(dialog.getByTestId(ids.userIdInput)).toHaveValue(user.id)
        await expect(dialog.getByTestId(ids.usernameInput)).toHaveValue(
          user.username,
        )
        await expect(dialog.getByTestId(ids.authTypeTrigger)).toHaveAttribute(
          "data-auth-type",
          account.authType,
        )
        await closeAccountDraft(ui)
        accountVerified = true
      },
    },
    {
      id: "models",
      covers: ["account-scoped rendered models and prices"],
      prerequisite: needsAccount,
      run: async () => {
        await testModelCatalogFlow({
          page: ui,
          extensionId: dev.extensionId,
          accountName,
          accountId: account.id,
          timeoutMs: 60_000,
        })
        await capture("models")
      },
    },
    {
      id: "keys",
      covers: ["account-scoped key list or successful empty state"],
      prerequisite: needsAccount,
      run: async () => {
        await route(`keys?accountId=${encodeURIComponent(account.id)}`)
        await expect(ui.getByTestId(keys.addTokenButton)).toBeVisible({
          timeout: 60_000,
        })
        await expect(ui.getByTestId(keys.accountScopeSelect)).toContainText(
          accountName,
        )
        await expect(
          ui.getByRole("button", { name: "Refresh Key List", exact: true }),
        ).toBeEnabled({ timeout: 60_000 })
        await expect(ui.getByText(/^Total \d+ keys?$/u)).toBeVisible({
          timeout: 60_000,
        })
        await expect(
          ui
            .getByTestId(keys.nativeKeyRow)
            .first()
            .or(ui.getByText("No key data yet", { exact: true })),
        ).toBeVisible({
          timeout: 60_000,
        })
        await capture("keys")
      },
    },
    {
      id: "invite",
      covers: ["native invite copy action feedback"],
      prerequisite: needsAccount,
      run: async () => {
        await route("account")
        await accountRow().getByTestId(ids.rowMoreActionsButton).click()
        await ui.getByRole("menuitem", { name: "Share", exact: true }).hover()
        await ui.getByTestId(ids.rowCopyInviteLinkMenuItem).click()
        await expect(
          ui.getByText("Invite link copied", { exact: false }),
        ).toBeVisible({ timeout: 30_000 })
        await capture("invite")
      },
    },
    {
      id: "cleanup",
      covers: ["remove only UI accounts and pages created by this run"],
      run: cleanup,
    },
  ]
  try {
    await runLiveSuites({
      suite: "all",
      suites: suites.map((suite) => ({
        ...suite,
        run: async () => {
          try {
            return await suite.run()
          } catch (error) {
            const page = suite.id === "native-login" ? site : ui
            if (page && !page.isClosed()) {
              try {
                await createUiCapture({
                  page,
                  directory,
                  screenshots: environment.screenshots,
                  mask: [
                    page.locator("input, textarea"),
                    page.getByTestId(keys.keyResourceSecretDisplay),
                  ],
                  timeoutMs: 10_000,
                })(`${suite.id}-failure`)
              } catch (captureError) {
                throw new AggregateError(
                  [error, captureError],
                  `${error.message}; failure capture: ${captureError.message}`,
                  { cause: captureError },
                )
              }
            }
            throw error
          }
        },
      })),
      evidenceDir: directory,
      environment,
    })
  } finally {
    // Page creation/setup failures must still detach owned pages. Account cleanup
    // is an explicit reported suite and is never silently retried after uncertainty.
    await Promise.allSettled([site.close(), ui?.close()])
  }

  async function cleanup() {
    const owned = (await getAccounts(dev.serviceWorker)).filter(
      (a) => !before.has(a.id) && a.site_name === accountName,
    )
    if (ui) {
      if (await ui.getByTestId(ids.accountDialog).isVisible())
        await closeAccountDraft(ui)
      for (const saved of owned) {
        await route("account")
        const row = ui.getByTestId(getAccountManagementListItemTestId(saved.id))
        await row.getByTestId(ids.rowMoreActionsButton).click()
        await ui.getByTestId(ids.rowDeleteMenuItem).click()
        await ui.getByTestId(ids.deleteConfirmButton).click()
        await expect
          .poll(async () =>
            (await getAccounts(dev.serviceWorker)).some(
              (a) => a.id === saved.id,
            ),
          )
          .toBe(false)
      }
    }
    assert.equal(
      (await getAccounts(dev.serviceWorker)).some(
        (a) => !before.has(a.id) && a.site_name === accountName,
      ),
      false,
      "Owned account cleanup incomplete",
    )
    const closed = await Promise.allSettled([site.close(), ui?.close()])
    const errors = closed
      .filter((result) => result.status === "rejected")
      .map((result) => String(result.reason))
    if (errors.length)
      throw new Error(`Owned page cleanup failed: ${errors.join("; ")}`)
  }
}
