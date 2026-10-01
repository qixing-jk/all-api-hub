import type { Locator, Page } from "@playwright/test"

import { generateNewApiTotpCode } from "~/services/managedSites/providers/newApiTotp"
import { expect } from "~~/e2e/fixtures/extensionTest"
import type { ExtensionPageGuardOptions } from "~~/e2e/utils/commonUserFlows"
import type { AccountAddDialog } from "~~/e2e/utils/realSite/accountAdd"
import type { CompatibleApiRealSiteConfig } from "~~/e2e/utils/realSite/compatibleApi"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

import {
  E2E_ACCESS_TOKEN_NAME,
  revokeStaleE2eAccessTokens,
} from "./newApiAccessTokens"

/**
 * Follow the same manual-token recovery offered to a user after auto-detection.
 * Only the token endpoint's expected 403 is allowed through the console guard;
 * the flow must still reach either a saveable account or the recovery guidance.
 */
export function createNewApiAccountRecovery(params: {
  page: Page
  config: CompatibleApiRealSiteConfig
  /** Readiness budget for the detected-account dialog; tests shorten it. */
  dialogReadyTimeoutMs?: number
}): {
  extensionPageGuardOptions: ExtensionPageGuardOptions
  prepareDetectedDialog: (dialog: AccountAddDialog) => Promise<void>
} {
  const baseUrl = `${params.config.baseUrl.replace(/\/+$/u, "")}/`
  // Older builds refuse the rotating token call until the browser session passes
  // their own security check. Newer builds never reach that refusal here: the
  // extension reads their contract instead of attempting creation.
  const tokenUrl = new URL("api/user/token", baseUrl).href
  const dialogReadyTimeoutMs = params.dialogReadyTimeoutMs ?? 30_000

  return {
    extensionPageGuardOptions: {
      ignoreConsoleError: (message) =>
        message.location().url === tokenUrl &&
        /^Failed to load resource: .*status of 403\b/u.test(message.text()),
    },
    prepareDetectedDialog: async (dialog) => {
      const recoveryHeading = dialog.dialog.getByText(
        "Enter an Access Token manually",
        { exact: true },
      )
      try {
        await expect
          .poll(
            async () =>
              ((await dialog.confirmAddButton.isVisible()) &&
                (await dialog.confirmAddButton.isEnabled())) ||
              (await recoveryHeading.isVisible()),
            { timeout: dialogReadyTimeoutMs },
          )
          .toBe(true)
      } catch (error) {
        if (!isDetectedDialogPollTimeout(error)) throw error

        throw new Error(await describeDetectedDialogFailure(dialog, error))
      }

      if (!(await recoveryHeading.isVisible())) return

      const fields = [
        dialog.siteUrlInput,
        dialog.siteNameInput,
        dialog.usernameInput,
        dialog.userIdInput,
      ]
      const detectedValues = await Promise.all(
        fields.map((field) => field.inputValue()),
      )
      expect(detectedValues.every((value) => value.trim().length > 0)).toBe(
        true,
      )
      await expect(dialog.accessTokenInput).toBeEmpty()

      const context = params.page.context()
      const [securityPage] = await Promise.all([
        context.waitForEvent("page"),
        dialog.dialog
          .getByRole("button", {
            name: "Open site security settings",
            exact: true,
          })
          .click(),
      ])

      try {
        await expect(securityPage).toHaveURL(
          new URL("security#security-access", baseUrl).href,
        )
        await expect(dialog.accessTokenInput).toHaveAttribute(
          "type",
          "password",
        )
        await expect(dialog.accessTokenInput).toBeInViewport()
        await expect(dialog.accessTokenInput).toBeFocused()

        const token = await copyNewApiAccessToken(securityPage, params.config)
        await params.page.bringToFront()
        for (const [index, field] of fields.entries()) {
          await expect(field).toHaveValue(atIndex(detectedValues, index))
        }
        await fillSecret(dialog.accessTokenInput, token, "Access Token")
        await expect
          .poll(
            async () => (await dialog.accessTokenInput.inputValue()) === token,
          )
          .toBe(true)
      } finally {
        // A generated token is displayed once in plaintext by the upstream UI.
        // Close this page even on failure, before Playwright captures screenshots.
        await securityPage.close()
      }
    },
  }
}

/**
 * Reads the account credential out of whichever token UI the deployment serves.
 *
 * rc.41 replaced the single dashboard token card with a scoped access-token
 * list: the card is titled "Access tokens", creating one opens a dialog asking
 * for a name, a permission selection and an expiry, and the plaintext is shown
 * once in a follow-up dialog. Older builds keep the one card whose
 * "Generate"/"Regenerate" button rotated the dashboard token.
 * https://github.com/QuantumNous/new-api/tree/v1.0.0-rc.41/web/src/features/security
 */
async function copyNewApiAccessToken(
  page: Page,
  config: CompatibleApiRealSiteConfig,
) {
  const createButton = page.getByRole("button", {
    name: /^(Create access token|创建访问令牌)$/u,
  })
  const generateButton = page.getByRole("button", {
    name: /^(Generate|Regenerate|生成|重新生成)$/u,
  })

  await expect(createButton.or(generateButton).first()).toBeVisible({
    timeout: 30_000,
  })

  return (await createButton.count()) > 0
    ? await createScopedTokenOnSecurityPage(page, createButton.first(), config)
    : await regenerateDashboardTokenOnSecurityPage(
        page,
        generateButton.first(),
        config,
      )
}

/** Creates a scoped access token in the rc.41 security page. */
async function createScopedTokenOnSecurityPage(
  page: Page,
  createButton: Locator,
  config: CompatibleApiRealSiteConfig,
) {
  // A deployment caps a user at 20 access tokens and shows each plaintext once,
  // so a run that cannot clean up would eventually be refused a new one.
  await revokeStaleE2eAccessTokens(config)

  await createButton.click()

  const createDialog = page.getByRole("dialog").last()
  await createDialog.locator('input[name="name"]').fill(E2E_ACCESS_TOKEN_NAME)
  // All API Hub cannot choose the grant for the user, and the deployment offers
  // these permissions as one catalog the user already holds. Selecting all of
  // them keeps the fixture independent of how the catalog is laid out.
  await createDialog
    .getByRole("button", { name: /^(Select all|全选)$/u })
    .click()
  await createDialog
    .getByRole("button", { name: /^(Never expires|永不过期)$/u })
    .click()
  await createDialog
    .getByRole("button", { name: /^(Create access token|创建访问令牌)$/u })
    .click()

  const verificationDialog = page.getByRole("dialog", {
    name: /^(Security verification|安全验证)$/u,
  })
  const tokenDialog = page.getByRole("dialog", {
    name: /^(Access tokens|访问令牌)$/u,
  })
  await expect(verificationDialog.or(tokenDialog).first()).toBeVisible()
  if (!(await tokenDialog.isVisible())) {
    await completeNewApiSecurityVerification(verificationDialog, config)
  }

  await expect(tokenDialog).toBeVisible()
  await expect(tokenDialog).toContainText(
    /will not be shown again|不会再次显示/u,
  )
  // The plaintext is shown once in the deployment's own field; read it directly
  // rather than through the clipboard, whose copy control is icon-only.
  const token = (await tokenDialog.locator("input").first().inputValue()).trim()
  if (!token) {
    throw new Error("New API access token dialog did not expose a token")
  }
  await tokenDialog
    .getByRole("button", { name: /^(Close|关闭)$/u })
    .first()
    .click()
  return token
}

/**
 * Copies the token older builds rotate in place.
 *
 * The token is displayed once in plaintext, and the deployment's own copy
 * control is what reaches the clipboard, so the flow waits for that write to
 * land rather than reading the field.
 */
async function regenerateDashboardTokenOnSecurityPage(
  page: Page,
  generateButton: Locator,
  config: CompatibleApiRealSiteConfig,
) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  })
  await expect(generateButton).toBeEnabled({ timeout: 30_000 })
  const regenerating = /^(Regenerate|重新生成)$/u.test(
    (await generateButton.innerText()).trim(),
  )
  await generateButton.click()

  if (regenerating) {
    const confirmation = page.getByRole("alertdialog")
    await expect(confirmation).toContainText(
      /invalidate your existing access token|现有.*令牌.*失效/u,
    )
    await confirmation
      .getByRole("button", { name: /^(Regenerate token|重新生成令牌)$/u })
      .click()
  }

  const tokenDialog = page.getByRole("dialog", {
    name: /^(Access Token|访问令牌)$/u,
  })
  const verificationDialog = page.getByRole("dialog", {
    name: /^(Security verification|安全验证)$/u,
  })
  await expect(tokenDialog.or(verificationDialog).first()).toBeVisible()
  if (!(await tokenDialog.isVisible())) {
    await completeNewApiSecurityVerification(verificationDialog, config)
  }

  await expect(tokenDialog).toBeVisible()
  await expect(tokenDialog).toContainText(
    /won't be able to view it again|关闭.*无法再次查看/u,
  )
  await tokenDialog
    .getByRole("button", { name: /^(Copy token|复制令牌)$/u })
    .click()
  const displayedToken = await tokenDialog
    .getByLabel(/^(Token|令牌)$/u, { exact: true })
    .inputValue()
  let token = ""
  // Boolean assertions keep plaintext credentials out of failure reports.
  await expect
    .poll(async () => {
      token = await page.evaluate(() => navigator.clipboard.readText())
      return token.length > 0 && token === displayedToken
    })
    .toBe(true)
  await tokenDialog
    .getByRole("button", { name: /^(Close|关闭)$/u })
    // The footer and dialog's close icon perform the same action upstream.
    .first()
    .click()
  return token
}

/**
 * Prefer configured authenticator verification when offered by the site,
 * otherwise use its password challenge. Fail if neither method is available.
 */
async function completeNewApiSecurityVerification(
  dialog: Locator,
  config: CompatibleApiRealSiteConfig,
) {
  await expect(dialog.getByRole("tab").first()).toBeVisible()
  const totpTab = dialog.getByRole("tab", {
    name: /^(Authenticator code|身份验证器代码)$/u,
  })
  const passwordTab = dialog.getByRole("tab", { name: /^(Password|密码)$/u })

  if (
    config.totpSecret &&
    (await totpTab.count()) &&
    (await totpTab.isEnabled())
  ) {
    await totpTab.click()
    await fillSecret(
      dialog
        .getByLabel(/Authenticator code|认证器验证码|身份验证器代码/u)
        .and(dialog.locator("input")),
      generateNewApiTotpCode(config.totpSecret),
      "authenticator code",
    )
  } else if ((await passwordTab.count()) && (await passwordTab.isEnabled())) {
    await passwordTab.click()
    await fillSecret(
      dialog.getByLabel(/^(Password|密码)$/u).and(dialog.locator("input")),
      config.password,
      "password",
    )
  } else {
    throw new Error(
      "New API security verification has no supported configured method. Enable password verification or configure AAH_E2E_NEW_API_TOTP_SECRET for the test account.",
    )
  }

  await dialog.getByRole("button", { name: /^(Verify|验证)$/u }).click()
}

/** Fill a credential without exposing it through Playwright action error logs. */
async function fillSecret(input: Locator, value: string, label: string) {
  await expect(input, `New API ${label} input must be editable`).toBeEditable()
  try {
    await input.fill(value)
  } catch {
    // Locator action errors can contain the fill value in their call log.
    throw new Error(`Could not fill the New API ${label} field.`)
  }
}

/**
 * Playwright reports poll exhaustion as a timeout in the assertion call log,
 * while a predicate failure (for example a strict-mode locator error) rejects
 * immediately with its own error and must keep that identity.
 */
function isDetectedDialogPollTimeout(error: unknown) {
  return (
    error instanceof Error &&
    /Timeout \d+ms exceeded while waiting on the predicate/u.test(error.message)
  )
}

/**
 * New API detection can stop before either supported state appears (for
 * example "Could not get User ID"). Surface the dialog's own failure text so a
 * CI log names the real reason instead of only reporting a poll timeout.
 */
async function describeDetectedDialogFailure(
  dialog: AccountAddDialog,
  error: unknown,
) {
  const failureText = await readDetectedDialogFailureText(dialog)
  const detail =
    failureText || (error instanceof Error ? error.message : String(error))

  return `New API account detection never became confirmable: ${detail}`
}

async function readDetectedDialogFailureText(dialog: AccountAddDialog) {
  try {
    const banner = dialog.dialog.getByText(/^Auto-detection failed:/u).first()
    if (!(await banner.isVisible())) return ""

    return (await banner.innerText()).replace(/\s+/gu, " ").trim()
  } catch {
    return ""
  }
}
