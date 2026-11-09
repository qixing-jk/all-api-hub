/* global chrome */
import { randomUUID } from "node:crypto"
import { expect } from "@playwright/test"

import { withUiCreatedAccount } from "../../cdp/sandbox.mjs"
import { openExtensionPage } from "../../cdp/ui-driver.mjs"

/** Shared by isolated mocked E2E and live CDP; all saves go through the UI. */
export async function openAimlapiAuthForm({
  context,
  extensionId,
  siteUrl = "https://aimlapi.com",
}) {
  const page = await openExtensionPage({
    context,
    extensionId,
    route: "options.html#account",
    language: "en",
    dismissUpdateLog: true,
  })
  try {
    await page
      .getByTestId("account-management-add-account-button")
      .first()
      .click()
    const dialog = page.getByTestId("account-management-account-dialog")
    await dialog.getByTestId("account-management-site-url-input").fill(siteUrl)
    await dialog.getByTestId("account-management-auto-detect-button").click()
    await expect(
      dialog.getByTestId("account-management-access-token-input"),
    ).toBeVisible({ timeout: 60000 })
    await expect(dialog).not.toContainText("Still not recognized?")
    const acquisition = dialog.getByRole("button", {
      name: "Open AI/ML API keys",
      exact: true,
    })
    await expect(acquisition).toBeVisible()
    const opened = context.waitForEvent("page")
    await acquisition.click()
    const keysPage = await opened
    try {
      await expect(keysPage).toHaveURL(
        (url) =>
          url.origin === "https://aimlapi.com" &&
          (url.pathname === "/app/keys" ||
            (["/app/auth", "/app/auth/login"].includes(url.pathname) &&
              url.searchParams.get("returnTo") === "/keys")),
        { timeout: 30000 },
      )
    } finally {
      await keysPage.close()
    }
    await page.bringToFront()
    await expect(
      dialog.getByRole("button", { name: "Paste management key", exact: true }),
    ).toHaveCount(0)
    await expect(
      dialog.getByTestId("account-management-access-token-input"),
    ).toBeFocused()
    await dialog
      .locator(
        '[data-testid="account-management-account-form-section-balance"] input[type="number"]',
      )
      .first()
      .fill("7.2")
    return {
      page,
      dialog,
      primary: dialog.getByTestId("account-management-access-token-input"),
      regular: dialog.getByTestId("account-management-aiml-api-key-input"),
      save: dialog.getByTestId("account-management-confirm-add-button"),
    }
  } catch (error) {
    await page.close()
    throw error
  }
}

export async function checkAimlapiRejectedCredential(
  options,
  { primary, regular = "", message },
) {
  const form = await openAimlapiAuthForm(options)
  const rejectedName = `AAH rejected ${randomUUID()}`
  try {
    await form.dialog
      .getByTestId("account-management-site-name-input")
      .fill(rejectedName)
    await form.primary.fill(primary)
    await form.regular.fill(regular)
    await form.dialog
      .getByTestId("account-management-auto-detect-button")
      .click()
    await expect(
      form.page.getByText(message, { exact: false }).first(),
    ).toBeVisible({ timeout: 30000 })
    expect(
      await options.serviceWorker.evaluate(async (name) => {
        const raw = (await chrome.storage.local.get("site_accounts"))
          .site_accounts
        const data = typeof raw === "string" ? JSON.parse(raw) : raw
        return (data?.accounts || []).some(
          (account) =>
            account.site_type === "aimlapi" && account.site_name === name,
        )
      }, rejectedName),
    ).toBe(false)
  } finally {
    await form.page.close()
  }
}

export async function checkAimlapiSavedCredentials(
  options,
  { primary, regular = "", replacements = [] },
) {
  const form = await openAimlapiAuthForm(options)
  try {
    await withUiCreatedAccount(
      options.serviceWorker,
      async (name) => {
        await form.dialog
          .getByTestId("account-management-site-name-input")
          .fill(name)
        await form.primary.fill(primary)
        await form.regular.fill(regular)
        await form.dialog
          .getByTestId("account-management-auto-detect-button")
          .click()
        await expect(
          form.dialog.getByTestId("account-management-username-input"),
        ).not.toHaveValue("")
        await expect(
          form.dialog.getByTestId("account-management-user-id-input"),
        ).not.toHaveValue("")
        await form.save.click()
        await expect(form.dialog).toBeHidden({ timeout: 60000 })
      },
      async (account) => {
        expect(account.account_info.access_token === primary).toBe(true)
        expect((account.aimlApiAuth?.apiKey || "") === regular).toBe(true)
        await form.page.reload()
        const row = form.page.getByTestId(
          `account-management-account-list-item-${account.id}`,
        )
        // Use the product's row action to re-open persisted authentication fields.
        await row.waitFor({ state: "visible", timeout: 30000 })
        await row.hover()
        await row.getByTestId("account-management-row-edit-button").click()
        await expect
          .poll(async () => (await form.primary.inputValue()) === primary)
          .toBe(true)
        await expect
          .poll(async () => (await form.regular.inputValue()) === regular)
          .toBe(true)
        for (const replacement of replacements) {
          await form.primary.fill(replacement.primary)
          await form.regular.fill(replacement.regular || "")
          await form.save.click()
          await expect(form.dialog).toBeHidden({ timeout: 60000 })
          await expect
            .poll(() =>
              options.serviceWorker.evaluate(
                async ({ id, primary, regular }) => {
                  const raw = (await chrome.storage.local.get("site_accounts"))
                    .site_accounts
                  const data = typeof raw === "string" ? JSON.parse(raw) : raw
                  const saved = data.accounts.find((item) => item.id === id)
                  return (
                    saved?.account_info.access_token === primary &&
                    (saved?.aimlApiAuth?.apiKey || "") === regular
                  )
                },
                {
                  id: account.id,
                  primary: replacement.primary,
                  regular: replacement.regular || "",
                },
              ),
            )
            .toBe(true)
          await form.page.reload()
          await row.waitFor({ state: "visible", timeout: 30000 })
          await row.hover()
          await row.getByTestId("account-management-row-edit-button").click()
          await expect
            .poll(
              async () =>
                (await form.primary.inputValue()) === replacement.primary,
            )
            .toBe(true)
          await expect
            .poll(
              async () =>
                (await form.regular.inputValue()) ===
                (replacement.regular || ""),
            )
            .toBe(true)
        }
        await form.dialog
          .getByRole("button", { name: "Cancel", exact: true })
          .click()
        const previousSync = await options.serviceWorker.evaluate(
          async (id) => {
            const raw = (await chrome.storage.local.get("site_accounts"))
              .site_accounts
            const data = typeof raw === "string" ? JSON.parse(raw) : raw
            return (
              data.accounts.find((item) => item.id === id)?.last_sync_time || 0
            )
          },
          account.id,
        )
        await row.hover()
        await row
          .getByTestId("account-management-row-more-actions-button")
          .click()
        await form.page
          .getByTestId("account-management-row-refresh-menu-item")
          .click()
        await expect
          .poll(
            () =>
              options.serviceWorker.evaluate(
                async ({ id, previousSync }) => {
                  const raw = (await chrome.storage.local.get("site_accounts"))
                    .site_accounts
                  const data = typeof raw === "string" ? JSON.parse(raw) : raw
                  return (
                    (data.accounts.find((item) => item.id === id)
                      ?.last_sync_time || 0) > previousSync
                  )
                },
                { id: account.id, previousSync },
              ),
            { timeout: 60000 },
          )
          .toBe(true)
      },
    )
  } finally {
    await form.page.close()
  }
}

/** No remote writes: only local account saves and authenticated GET requests. */
export async function runAimlapiAuthMatrix(options) {
  const results = []
  const run = async (name, work, available = true) => {
    if (!available) {
      results.push({
        name,
        status: "skipped",
        reason: "required credential unavailable",
      })
      return
    }
    await work()
    results.push({ name, status: "passed" })
    console.log(`  PASS ${name}`)
  }
  const form = await openAimlapiAuthForm(options)
  try {
    await expect(form.primary).toHaveValue("")
    await expect(form.regular).toHaveValue("")
    await expect(form.dialog).toContainText("Use an AI/ML API management key")
    await expect(form.save).toHaveCount(0)
    if (options.apiKey) {
      await form.regular.fill(options.apiKey)
      await expect(form.save).toHaveCount(0)
    }
    results.push({ name: "missing-primary-is-blocked", status: "passed" })
  } finally {
    await form.page.close()
  }
  await run("invalid-primary", () =>
    checkAimlapiRejectedCredential(options, {
      primary: "aah-invalid-credential",
      message: "The AI/ML API key is invalid or has expired.",
    }),
  )
  await run(
    "management-only-save-reopen",
    () =>
      checkAimlapiSavedCredentials(options, { primary: options.managementKey }),
    !!options.managementKey,
  )
  await run(
    "dual-key-save-reopen",
    () =>
      checkAimlapiSavedCredentials(options, {
        primary: options.managementKey,
        regular: options.apiKey,
      }),
    !!options.managementKey && !!options.apiKey,
  )
  await run(
    "invalid-primary-valid-regular",
    () =>
      checkAimlapiRejectedCredential(options, {
        primary: "aah-invalid-credential",
        regular: options.apiKey,
        message: "The AI/ML API key is invalid or has expired.",
      }),
    !!options.apiKey,
  )
  return results
}
