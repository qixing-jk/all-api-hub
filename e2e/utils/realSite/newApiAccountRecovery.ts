import type { Locator, Page } from "@playwright/test"

import { generateNewApiTotpCode } from "~/services/managedSites/providers/newApiTotp"
import { expect } from "~~/e2e/fixtures/extensionTest"
import type { ExtensionPageGuardOptions } from "~~/e2e/utils/commonUserFlows"
import type { AccountAddDialog } from "~~/e2e/utils/realSite/accountAdd"
import type { CompatibleApiRealSiteConfig } from "~~/e2e/utils/realSite/compatibleApi"

/**
 * Follow the same manual-token recovery offered to a user after auto-detection.
 * Only the token endpoint's expected 403 is allowed through the console guard;
 * the flow must still reach either a saveable account or the recovery guidance.
 */
export function createNewApiAccountRecovery(params: {
  page: Page
  config: CompatibleApiRealSiteConfig
}): {
  extensionPageGuardOptions: ExtensionPageGuardOptions
  prepareDetectedDialog: (dialog: AccountAddDialog) => Promise<void>
} {
  const baseUrl = `${params.config.baseUrl.replace(/\/+$/u, "")}/`
  const tokenUrl = new URL("api/user/token", baseUrl).href

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
      await expect
        .poll(
          async () =>
            ((await dialog.confirmAddButton.isVisible()) &&
              (await dialog.confirmAddButton.isEnabled())) ||
            (await recoveryHeading.isVisible()),
          { timeout: 30_000 },
        )
        .toBe(true)

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
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: new URL(baseUrl).origin,
      })
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
          await expect(field).toHaveValue(detectedValues[index])
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
 * New API's security UI owns verification and one-time token display.
 * https://github.com/QuantumNous/new-api/tree/bee45b58a3c0b77e8dc81e6b5aeb4474aa9058d1/web/src/features/security
 */
async function copyNewApiAccessToken(
  page: Page,
  config: CompatibleApiRealSiteConfig,
) {
  const tokenCard = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { name: /^(Access Token|访问令牌)$/u }),
  })
  const generateButton = tokenCard.getByRole("button", {
    name: /^(Generate|Regenerate|生成|重新生成)$/u,
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
  const token = await page.evaluate(() => navigator.clipboard.readText())
  const displayedToken = await tokenDialog
    .getByLabel(/^(Token|令牌)$/u, { exact: true })
    .inputValue()
  // Boolean assertions keep plaintext credentials out of failure reports.
  expect(token.length > 0 && token === displayedToken).toBe(true)
  await tokenDialog
    .getByRole("button", { name: /^(Close|关闭)$/u })
    // The footer and dialog's close icon perform the same action upstream.
    .first()
    .click()
  return token
}

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

async function fillSecret(input: Locator, value: string, label: string) {
  await expect(input, `New API ${label} input must be editable`).toBeEditable()
  try {
    await input.fill(value)
  } catch {
    // Locator action errors can contain the fill value in their call log.
    throw new Error(`Could not fill the New API ${label} field.`)
  }
}
