#!/usr/bin/env node
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { expect } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as ids } from "../src/features/AccountManagement/testIds.ts"
import { connectWorktreeExtension, defaultCdpUrl } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { createUiCapture } from "./cdp/ui-driver.mjs"
import { runUiScenarios, validateUiScenarios } from "./cdp/ui-scenarios.mjs"
import {
  assertAccountDetectionOutcome,
  openAccountAddDialog,
} from "./flows/auto-detect.mjs"
import {
  copyNewApiAccessToken,
  fillSecret,
  revokeNewApiAccessTokenFromUi,
} from "./flows/new-api-token-ui.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

const sites = [
  {
    id: "xingya",
    origin: "https://xingya.site",
    method:
      /^(Automatic selection: Xingya daily check-in|自动选择[：:]\s*星芽每日签到)$/u,
    claimPath: "/api/user/xingya-daily-claim",
  },
  {
    id: "runanytime",
    origin: "https://runanytime.hxi.me",
    method: /^(Automatic selection: Daily check-in|自动选择[：:]\s*每日签到)$/u,
    claimPath: "/api/user/checkin",
  },
]
const labels = {
  account: /^(Account Management|账户管理|账号管理)$/u,
  checkin: /^(Auto Check-in|自动签到)$/u,
  detect:
    /^(Detect method|Detect check-in method|检测方式|重新检测签到方式|检测签到方式)$/u,
  method: /^(Check-in method|签到方式)$/u,
  cancel: /^(Cancel|取消|Close|关闭)$/u,
  tokenPage: /^(Open token page|打开令牌页面)$/u,
  already: /Already checked|今日已签到|今天已签到|今日已签/u,
  success: /Checked in|Success|签到成功/u,
}
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const blocked = (reason) => ({ skipped: true, reason })

/** Compare detected identity against an independent source when available. */
export function verifyDetectedIdentity(detected, expected = {}) {
  if (expected.username)
    assert.equal(
      detected.username,
      expected.username,
      "Detected username must match the test account",
    )
  if (expected.userId)
    assert.equal(
      detected.userId,
      String(expected.userId),
      "Detected user ID must match the test account",
    )
  if (!expected.username || !expected.userId)
    return blocked(
      "No complete independent identity available from env or normal observed site responses",
    )
}

/** Configure the offered account login controls without changing the discovered check-in method. */
export async function configureAccountLoginFromUi(
  page,
  accountDialog,
  credentials,
) {
  await accountDialog
    .getByTestId(ids.accountFormSectionCheckIn)
    .getByRole("button", { name: /^(Set up login|设置登录方式)$/u })
    .click()
  const method = accountDialog.getByRole("combobox", {
    name: /^(Login method|登录方式)$/u,
  })
  await method.click()
  const choice = credentials.password
    ? /^(Password login|密码登录)$/u
    : /^Linux DO$/u
  await page.getByRole("option", { name: choice }).click()
  await expect(method).toHaveText(choice)
  if (credentials.password) {
    await fillSecret(
      accountDialog.locator("#account-login-username"),
      credentials.username,
      "login username",
    )
    await fillSecret(
      accountDialog.locator("#account-login-password"),
      credentials.password,
      "login password",
    )
  }
}

/** Keep only claim acknowledgement and challenge evidence, never credentials. */
export function summarizeClaimResponse(url, body, input, status) {
  return {
    status,
    success: body?.success === true,
    alreadyClaimed: body?.data?.already_claimed === true,
    powObserved:
      (url.searchParams.has("pow_challenge") &&
        url.searchParams.has("pow_nonce")) ||
      (typeof input?.pow_challenge === "string" &&
        input?.pow_nonce !== undefined),
  }
}

/** Drive explicit discovery without selecting a method. */
export async function redetectCheckinMethod(section, expectedMethod) {
  await section.getByRole("button", { name: labels.detect }).click()
  await expect(
    section.getByRole("button", { name: labels.detect }),
  ).toBeEnabled({ timeout: 60_000 })
  await expect(
    section.getByRole("status").filter({
      hasText:
        /An available check-in method was detected\.|已检测到可用的签到方式。/u,
    }),
  ).toBeVisible()
  await expect(
    section.getByRole("combobox", { name: labels.method }),
  ).toHaveText(expectedMethod, { timeout: 60_000 })
}

/** Refresh the account through its own menu before inspecting persisted fields. */
export async function refreshAccountFromUi(page, accountRow, accountName) {
  const feedback = page
    .getByRole("status")
    .or(page.getByRole("alert"))
    .filter({ hasText: accountName })
  // A save may still have its own success toast. Require a new refresh result.
  await expect(feedback).toBeHidden({ timeout: 20_000 })
  await accountRow.getByTestId(ids.rowMoreActionsButton).click()
  await page.getByTestId(ids.rowRefreshMenuItem).click()
  await expect(feedback).toBeVisible({ timeout: 60_000 })
  await expect(feedback).not.toContainText(/Refreshing|正在刷新/u, {
    timeout: 60_000,
  })
  const name = escapeRegex(accountName)
  await expect(feedback).toContainText(
    new RegExp(`${name} (?:refreshed successfully!|刷新成功！)`, "u"),
  )
}

/** Remove only this run's display-labelled account through the normal UI. */
export async function removeOwnedAccountFromUi(
  context,
  page,
  extensionId,
  accountName,
) {
  const needsPage = !page || page.isClosed()
  if (needsPage) page = await context.newPage()
  try {
    if (needsPage) {
      await page.goto(
        `chrome-extension://${extensionId}/options.html#account`,
        { waitUntil: "domcontentloaded", timeout: 60_000 },
      )
      await expect(page.getByTestId("options-app")).toBeVisible({
        timeout: 60_000,
      })
    }
    const draft = page.getByTestId(ids.accountDialog)
    if (await draft.isVisible()) {
      await draft.getByRole("button", { name: labels.cancel }).first().click()
      await expect(draft).toBeHidden()
    }
    await page.getByRole("button", { name: labels.account }).click()
    await expect(page.getByTestId(ids.accountListView)).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByTestId(ids.accountListView)).not.toHaveAttribute(
      "aria-busy",
      "true",
      { timeout: 30_000 },
    )
    await page
      .getByPlaceholder(
        /^(Enter site information or account information to search|输入站点信息或账号信息进行搜索)$/u,
      )
      .fill(accountName)
    const accountRow = page
      .locator('[data-testid^="account-management-account-list-item-"]')
      .filter({ hasText: accountName })
    // Search mounts virtualized rows after its debounce. A missing DOM row is
    // never sufficient evidence that a saved account has already disappeared.
    await expect(accountRow).toBeVisible({ timeout: 30_000 })
    await accountRow.hover()
    await accountRow.getByTestId(ids.rowMoreActionsButton).click()
    await page.getByTestId(ids.rowDeleteMenuItem).click()
    await page.getByTestId(ids.deleteConfirmButton).click()
    await expect(accountRow).toHaveCount(0)
  } finally {
    if (needsPage) await page.close()
  }
}

/** Start from Add Account and keep identity, authentication and method discovery intact. */
async function runSite({ dev, site, directory, keepAccount }) {
  const { context, extensionId } = dev
  const screenshots = []
  const responses = []
  const identities = []
  const pending = new Set()
  const ownedPages = []
  const state = {}
  const errors = []
  const label = `AAH CDP ${site.id} ${Date.now()}`
  const tokenName = `${label} token`
  const credentials = {
    username: process.env[`${site.id.toUpperCase()}_USERNAME`] || "",
    password: process.env[`${site.id.toUpperCase()}_PASSWORD`] || "",
    totpSecret: process.env[`${site.id.toUpperCase()}_TOTP_SECRET`],
  }
  const observe = (response) => {
    const url = new URL(response.url())
    if (url.origin !== site.origin) return
    const identityResponse =
      url.pathname === "/api/user/self" && response.request().method() === "GET"
    const claimResponse =
      url.pathname === site.claimPath && response.request().method() === "POST"
    if (!identityResponse && !claimResponse) return
    const task = (async () => {
      const body = await response.json().catch(() => null)
      if (identityResponse) {
        if (body?.success === true && body.data?.id && body.data?.username)
          identities.push({
            username: body.data.username,
            userId: String(body.data.id),
          })
        return
      }
      const input = response.request().postDataJSON()
      responses.push(
        summarizeClaimResponse(url, body, input, response.status()),
      )
    })().catch(() => {
      if (claimResponse)
        responses.push({ status: response.status(), unreadable: true })
    })
    pending.add(task)
    void task.finally(() => pending.delete(task))
  }
  context.on("response", observe)
  let page, sitePage, capture, outcomes
  const row = () =>
    page
      .locator('[data-testid^="account-management-account-list-item-"]')
      .filter({ hasText: label })
  const dialog = () => page.getByTestId(ids.accountDialog)
  const goAccount = async () => {
    await page.getByRole("button", { name: labels.account }).click()
    await expect(page.getByTestId(ids.accountListView)).toBeVisible({
      timeout: 30_000,
    })
  }
  const closeDraft = async () => {
    if (await dialog().isVisible()) {
      await dialog()
        .getByRole("button", { name: labels.cancel })
        .first()
        .click()
      await expect(dialog()).toBeHidden()
    }
  }
  const execute = async () => {
    await goAccount()
    const toast = page.getByText(new RegExp(`^${escapeRegex(label)}:`))
    await expect(toast).toBeHidden({ timeout: 20_000 })
    await row().getByTestId(ids.rowMoreActionsButton).click()
    await page.getByTestId(ids.rowQuickCheckinMenuItem).click()
    await expect(toast).toBeVisible({ timeout: 120_000 })
    await page.getByRole("button", { name: labels.checkin }).click()
    const result = page.getByRole("row").filter({ hasText: label })
    await expect(result).toBeVisible({ timeout: 30_000 })
    const text = await result.innerText()
    await capture(state.first ? "repeat" : "execution", result)
    assert.ok(
      labels.already.test(text) || labels.success.test(text),
      "Check-in must report success or already checked; see execution screenshot",
    )
    return { alreadyChecked: labels.already.test(text) }
  }
  try {
    sitePage = await context.newPage()
    ownedPages.push(sitePage)
    await sitePage.goto(`${site.origin}/dashboard/overview`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    })
    page = await context.newPage()
    ownedPages.push(page)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(`chrome-extension://${extensionId}/options.html#account`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    })
    await expect(page.getByTestId("options-app")).toBeVisible({
      timeout: 60_000,
    })
    await page.addLocatorHandler(
      page.getByTestId(ids.duplicateWarningContinueButton),
      (button) => button.click(),
    )
    capture = createUiCapture({
      page,
      directory,
      screenshots,
      timeoutMs: 20_000,
    })
    const scenarios = [
      {
        id: "automatic-detection",
        covers: ["fresh-add", "site-type", "identity-extraction"],
        run: async () => {
          await openAccountAddDialog({ page, targetUrl: site.origin })
          await dialog().getByTestId(ids.autoDetectButton).click()
          await expect
            .poll(
              async () =>
                (await dialog()
                  .getByTestId(ids.confirmAddButton)
                  .isVisible()) ||
                (await dialog()
                  .getByTestId(ids.autoDetectErrorMessage)
                  .isVisible()),
              { timeout: 60_000 },
            )
            .toBe(true)
          const username = await dialog()
            .getByTestId(ids.usernameInput)
            .inputValue()
          const userId = await dialog()
            .getByTestId(ids.userIdInput)
            .inputValue()
          assert.ok(
            username && userId,
            "Automatic detection must provide username and user ID",
          )
          const expectedUsername =
            process.env[`${site.id.toUpperCase()}_USERNAME`]
          const expectedId = process.env[`${site.id.toUpperCase()}_USER_ID`]
          if (expectedUsername)
            assert.equal(
              username,
              expectedUsername,
              "Detected username must match the test account",
            )
          if (expectedId)
            assert.equal(
              userId,
              expectedId,
              "Detected user ID must match the test account",
            )
          const guidance = await dialog()
            .getByTestId(ids.autoDetectErrorMessage)
            .isVisible()
          await assertAccountDetectionOutcome({
            page,
            expectedType: "new-api",
            fields: {
              siteUrlInput: site.origin,
              usernameInput: username,
              userIdInput: userId,
            },
            saveState: guidance ? "absent" : "enabled",
            ...(guidance
              ? {
                  guidance:
                    /Enter an Access Token manually|手动.*Access Token|手动.*访问令牌/u,
                }
              : {}),
          })
          state.identity = { username, userId }
          state.guidance = guidance
          await capture(
            "automatic-detection",
            dialog().getByTestId(ids.accountFormSectionSiteInfo),
          )
        },
      },
      {
        id: "identity-verification",
        covers: ["independent-account-identity"],
        prerequisite: () =>
          !state.identity
            ? "Automatic identity detection did not complete"
            : undefined,
        run: async () => {
          await Promise.all([...pending])
          const observed = identities.at(-1)
          const expected = {
            username:
              process.env[`${site.id.toUpperCase()}_USERNAME`] ||
              observed?.username,
            userId:
              process.env[`${site.id.toUpperCase()}_USER_ID`] ||
              observed?.userId,
          }
          const result = verifyDetectedIdentity(state.identity, expected)
          if (result) return result
          state.identityVerified = true
          state.identitySource = observed
            ? "env-and-passive-site-response"
            : "env"
        },
      },
      {
        id: "credential-completion",
        covers: ["default-authentication"],
        prerequisite: () =>
          !state.identityVerified
            ? "Independent account identity verification did not complete"
            : undefined,
        run: async () => {
          if (state.guidance) {
            if (!credentials.password && !credentials.totpSecret)
              return blocked(
                "Native token verification needs the site password or TOTP input in env",
              )
            const priorPages = new Set(context.pages())
            await dialog()
              .getByRole("button", { name: labels.tokenPage })
              .click()
            let securityPage
            await expect
              .poll(
                () => {
                  securityPage = context
                    .pages()
                    .find(
                      (candidate) =>
                        !priorPages.has(candidate) &&
                        candidate.url().startsWith(`${site.origin}/security`),
                    )
                  return Boolean(securityPage)
                },
                { timeout: 30_000 },
              )
              .toBe(true)
            ownedPages.push(securityPage)
            try {
              const token = await copyNewApiAccessToken(
                securityPage,
                credentials,
                {
                  tokenName,
                  beforeCreateScopedToken: async () => {
                    state.tokenCreationAttempted = true
                  },
                  onScopedTokenCreated: () => {
                    state.createdToken = true
                  },
                },
              )
              await fillSecret(
                dialog().getByTestId(ids.accessTokenInput),
                token,
                "Access Token",
              )
            } finally {
              await securityPage.close()
            }
          }
          assert.ok(
            (
              await dialog().getByTestId(ids.accessTokenInput).inputValue()
            ).trim(),
            "The normal token field must contain a credential",
          )
          await expect(dialog().getByTestId(ids.usernameInput)).toHaveValue(
            state.identity.username,
          )
          await expect(dialog().getByTestId(ids.userIdInput)).toHaveValue(
            state.identity.userId,
          )
          state.credentials = true
          state.credentialPath = state.guidance
            ? "native-ui-security-verification"
            : "automatic"
        },
      },
      {
        id: "checkin-discovery",
        covers: ["automatic-method-selection", "explicit-redetect"],
        prerequisite: () =>
          !state.credentials
            ? "Credential completion did not finish"
            : undefined,
        run: async () => {
          const section = dialog().getByTestId(ids.accountFormSectionCheckIn)
          await redetectCheckinMethod(section, site.method)
          state.discovery = true
          await capture("automatic-checkin-method", section)
        },
      },
      {
        id: "save-refresh-reopen",
        covers: [
          "normal-save",
          "refresh",
          "identity-continuity",
          "method-persistence",
        ],
        prerequisite: () =>
          !state.discovery
            ? "Automatic check-in discovery did not complete"
            : undefined,
        run: async () => {
          // Only the display label changes, to identify resources owned by this run.
          await dialog().getByTestId(ids.siteNameInput).fill(label)
          state.accountSaveAttempted = true
          await dialog().getByTestId(ids.confirmAddButton).click()
          await expect(dialog()).toBeHidden({ timeout: 60_000 })
          await expect(row()).toBeVisible({ timeout: 30_000 })
          state.saved = true
          await refreshAccountFromUi(page, row(), label)
          await row().getByTestId(ids.rowEditButton).click()
          await expect(dialog().getByTestId(ids.usernameInput)).toHaveValue(
            state.identity.username,
          )
          await expect(dialog().getByTestId(ids.userIdInput)).toHaveValue(
            state.identity.userId,
          )
          await expect(
            dialog().getByRole("combobox", { name: labels.method }),
          ).toHaveText(site.method)
          await capture(
            "saved-checkin-method",
            dialog().getByTestId(ids.accountFormSectionCheckIn),
          )
          await closeDraft()
          state.reopened = true
        },
      },
      {
        id: "account-login-configuration",
        covers: [
          "normal-login-guidance",
          "login-save-reopen",
          "automatic-checkin-selection-preserved",
        ],
        prerequisite: () =>
          !state.reopened
            ? "Saved account was not verified by reopening"
            : undefined,
        run: async () => {
          if (
            site.id === "xingya" &&
            (!credentials.username || !credentials.password)
          )
            return blocked(
              "Xingya session check-in needs username/password inputs for the offered account login UI",
            )
          await goAccount()
          await row().getByTestId(ids.rowEditButton).click()
          await configureAccountLoginFromUi(
            page,
            dialog(),
            site.id === "xingya" ? credentials : {},
          )
          await expect(
            dialog().getByRole("combobox", { name: labels.method }),
          ).toHaveText(site.method)
          await dialog()
            .getByRole("button", { name: /^(Save Changes|保存更改)$/u })
            .click()
          await expect(dialog()).toBeHidden({ timeout: 60_000 })
          await row().getByTestId(ids.rowEditButton).click()
          await expect(
            dialog().getByRole("combobox", {
              name: /^(Login method|登录方式)$/u,
            }),
          ).toHaveText(
            site.id === "xingya"
              ? /^(Password login|密码登录)$/u
              : /^Linux DO$/u,
          )
          await expect(
            dialog().getByRole("combobox", { name: labels.method }),
          ).toHaveText(site.method)
          if (site.id === "xingya") {
            assert.equal(
              await dialog().locator("#account-login-username").inputValue(),
              credentials.username,
              "Saved login username must match",
            )
            assert.ok(
              Boolean(
                await dialog().locator("#account-login-password").inputValue(),
              ),
              "Saved login credential must be present",
            )
          }
          await capture(
            "configured-checkin-login",
            dialog().getByTestId(ids.accountFormSectionCheckIn),
          )
          await closeDraft()
          state.loginConfigured = true
        },
      },
      {
        id: "extension-execution",
        covers: ["account-scoped-ui-command", "visible-result"],
        prerequisite: () =>
          !state.loginConfigured
            ? "Account login configuration did not complete"
            : undefined,
        run: async () => {
          state.first = await execute()
          await Promise.all([...pending])
          state.firstClaimCount = responses.length
        },
      },
      {
        id: "first-claim",
        covers: ["new-daily-grant"],
        prerequisite: () =>
          !state.first ? "No completed extension execution" : undefined,
        run: async () =>
          state.first.alreadyChecked
            ? blocked(
                "Account already checked today; wait for the site's next day or an authorized unclaimed account",
              )
            : responses.some(
                  (response) => response.success && !response.alreadyClaimed,
                )
              ? undefined
              : blocked(
                  "UI success lacks a passively observed fresh claim acknowledgement",
                ),
      },
      {
        id: "repeat",
        covers: ["repeat-ui-command", "no-repeated-observed-claim"],
        prerequisite: () =>
          !state.first ? "No completed first execution" : undefined,
        run: async () => {
          state.repeat = await execute()
          await Promise.all([...pending])
          assert.equal(
            state.repeat.alreadyChecked,
            true,
            "Repeat must report already checked",
          )
          assert.equal(
            responses.length,
            state.firstClaimCount,
            "Repeat must not send another observed claim",
          )
        },
      },
      ...(site.id === "runanytime"
        ? [
            {
              id: "native-pow",
              covers: ["real-native-pow"],
              run: async () =>
                !state.first?.alreadyChecked &&
                responses.some(
                  (response) =>
                    response.powObserved &&
                    response.success &&
                    !response.alreadyClaimed,
                )
                  ? undefined
                  : blocked(
                      "No fresh native PoW completion observed; an already-checked skip does not cover PoW",
                    ),
            },
          ]
        : []),
    ]
    outcomes = await runUiScenarios({
      scenarios,
      selected: scenarios.map(({ id }) => id),
      continueOnFailure: true,
    })
  } catch (error) {
    errors.push({ phase: "setup", message: error.message })
  } finally {
    if (!keepAccount) {
      try {
        if (state.accountSaveAttempted)
          await removeOwnedAccountFromUi(context, page, extensionId, label)
        state.accountCleanupConfirmed = true
      } catch (error) {
        errors.push({ phase: "account-cleanup", message: error.message })
      }
    }
    if (state.tokenCreationAttempted && !keepAccount) {
      try {
        await revokeNewApiAccessTokenFromUi(sitePage, {
          origin: site.origin,
          tokenName,
          ...credentials,
        })
        state.tokenCleanupConfirmed = true
      } catch (error) {
        errors.push({ phase: "token-cleanup", message: error.message })
      }
    }
    for (const owned of ownedPages) {
      try {
        await owned.close()
      } catch (error) {
        errors.push({ phase: "page-cleanup", message: error.message })
      }
    }
    await Promise.all([...pending])
    context.off("response", observe)
  }
  const report = {
    site: site.id,
    origin: site.origin,
    workflow: "extension-ui",
    ...outcomes,
    ok: Boolean(outcomes?.ok) && errors.length === 0,
    identitySource: state.identitySource,
    credentialPath: state.credentialPath,
    firstAlreadyChecked: state.first?.alreadyChecked,
    claimObservations: responses,
    screenshots,
    errors,
    cleanup: {
      ok: errors.every(({ phase }) => !phase.endsWith("cleanup")),
      accountRetained: state.accountCleanupConfirmed
        ? false
        : keepAccount && state.saved
          ? true
          : state.accountSaveAttempted
            ? null
            : false,
      tokenRetained: state.tokenCleanupConfirmed
        ? false
        : state.createdToken
          ? true
          : state.tokenCreationAttempted
            ? null
            : false,
    },
    unverified: [
      "cold-login",
      "expired-session-recovery",
      "real-captcha",
      ...(!state.guidance ? ["native-token-guidance"] : []),
    ],
  }
  await fs.writeFile(
    path.join(directory, "report.json"),
    JSON.stringify(report, null, 2),
  )
  await fs.writeFile(
    path.join(directory, "report.md"),
    `# ${site.id} extension UI acceptance\n\n${report.scenarios?.map(({ id, status, reason }) => `- ${id}: **${status}**${reason ? ` — ${reason}` : ""}`).join("\n") ?? "Setup failed"}\n\n${screenshots.map((file) => `![${file}](${file})`).join("\n\n")}\n`,
  )
  return report
}

async function main() {
  const { values } = parseArgs({
    options: {
      site: { type: "string", default: "all" },
      runanytime: { type: "boolean" },
      isolate: { type: "boolean" },
      "check-in": { type: "boolean" },
      prod: { type: "boolean" },
      "keep-account": { type: "boolean" },
      "evidence-dir": { type: "string" },
      help: { type: "boolean" },
    },
  })
  if (values.help) {
    console.log(`Usage: pnpm e2e:cdp:checkin-ui -- --isolate --check-in [--site=all|xingya|runanytime] [--prod]
  --runanytime       Compatibility alias for --site=runanytime
  --keep-account    Keep this run's UI-created account/token for follow-up
  --evidence-dir    Parent for a unique report directory

Starts at Add Account, automatically detects identity and check-in method,
follows native token/security UI using env inputs, saves/reopens, and executes
through the account menu. Existing site logins are reused; no account/storage
seeding, fixed method selection, direct API requests or cookie clearing.
If already checked today, first claim and native PoW stay incomplete.
English or Chinese UI; XINGYA_USERNAME/PASSWORD supply account login and native verification.
Exit: 0 required checks passed; 1 failure; 2 incomplete coverage.`)
    return
  }
  const selection = values.runanytime ? "runanytime" : values.site
  const selected = selection === "all" ? sites.map(({ id }) => id) : [selection]
  validateUiScenarios(sites, selected)
  assert.ok(
    values.isolate && values["check-in"],
    "Use --isolate --check-in to authorize UI account setup and a real daily grant",
  )
  loadLocalEnv()
  applyIsolateFlag(process.argv)
  const root = path.resolve(
    values["evidence-dir"] || ".scratch/xingya-checkin/evidence",
  )
  await fs.mkdir(root, { recursive: true })
  const directory = await fs.mkdtemp(path.join(root, "extension-ui-"))
  const extensionPath = path.resolve(
    values.prod ? ".output/chrome-mv3" : ".output/chrome-mv3-dev",
  )
  const environment = {
    worktree: process.cwd(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty: Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim(),
    ),
    extensionPath,
    cdpUrl: process.env.CDP_URL || defaultCdpUrl(),
  }
  const report = { environment, selected, sites: [], errors: [] }
  let dev
  try {
    dev = await connectWorktreeExtension({ extensionPath })
    environment.extensionId = dev.extensionId
    for (const definition of sites) {
      if (!selected.includes(definition.id)) {
        report.sites.push({ site: definition.id, status: "not_selected" })
        continue
      }
      const siteDirectory = path.join(directory, definition.id)
      await fs.mkdir(siteDirectory)
      const site = {
        ...definition,
        origin:
          process.env[`${definition.id.toUpperCase()}_ORIGIN`] ||
          definition.origin,
      }
      report.sites.push(
        await runSite({
          dev,
          site,
          directory: siteDirectory,
          keepAccount: values["keep-account"] === true,
        }),
      )
    }
  } catch (error) {
    report.errors.push(error.message)
  } finally {
    await dev?.close()
  }
  const failed =
    report.errors.length ||
    report.sites.some(
      (site) =>
        site.errors?.length ||
        site.scenarios?.some(({ status }) => status === "failed"),
    )
  const incomplete = report.sites.some((site) =>
    site.scenarios?.some(({ status }) =>
      ["blocked", "not_run"].includes(status),
    ),
  )
  report.exitCode = failed ? 1 : incomplete ? 2 : 0
  await fs.writeFile(
    path.join(directory, "report.json"),
    JSON.stringify(report, null, 2),
  )
  console.log(JSON.stringify({ ...report, directory }, null, 2))
  process.exitCode = report.exitCode
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
