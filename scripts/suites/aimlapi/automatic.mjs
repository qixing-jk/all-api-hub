/* global chrome */
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { withUiCreatedAccount } from "../../cdp/sandbox.mjs"
import { openExtensionPage } from "../../cdp/ui-driver.mjs"

/** A failed delete must leave actionable ownership evidence. */
function requireDeleted(status, id) {
  if (status !== 200)
    throw new Error(
      `Owned automatic-onboarding key cleanup failed: ${id} (${status})`,
    )
}

/** Live automatic onboarding; cleans only keys proven created by this run. */
export async function runAimlapiAutomaticOnboarding({
  context,
  extensionId,
  serviceWorker,
  evidenceDir = ".scratch/aimlapi-integration/artifacts",
}) {
  const cookies = await context.cookies("https://aimlapi.com")
  const cookie = cookies.find((c) => c.name === "playground.token")
  if (!cookie)
    throw new Error(
      "AI/ML API console session is required in the selected profile",
    )
  const session = JSON.parse(decodeURIComponent(cookie.value))
  const identity = await serviceWorker.evaluate(async (token) => {
    const r = await fetch("https://app.aimlapi.com/v1/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const j = await r.json()
    return r.ok ? { id: String(j.id), email: j.email } : null
  }, session.key)
  if (!identity?.id || !identity.email)
    throw new Error("AI/ML API console identity preflight failed")
  const readLedger = () =>
    serviceWorker.evaluate(async () => {
      const raw = (
        await chrome.storage.local.get("aimlapiConnectionCredentials_v1")
      ).aimlapiConnectionCredentials_v1
      const j = typeof raw === "string" ? JSON.parse(raw) : raw
      return Object.fromEntries(
        Object.entries(j || {}).map(([user, v]) => [
          user,
          Object.fromEntries(
            Object.entries(v).map(([kind, item]) => [
              kind,
              { state: item.state, id: item.id },
            ]),
          ),
        ]),
      )
    })
  const before = await readLedger()
  const knownIds = new Set(
    Object.values(before).flatMap((v) => Object.values(v).map((x) => x.id)),
  )
  const page = await openExtensionPage({
    context,
    extensionId,
    route: "options.html#account",
    language: "en",
    dismissUpdateLog: true,
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await fs.mkdir(evidenceDir, { recursive: true })
  try {
    await page
      .getByTestId("account-management-add-account-button")
      .first()
      .click()
    const dialog = page.getByTestId("account-management-account-dialog")
    await dialog
      .getByTestId("account-management-site-url-input")
      .fill("https://aimlapi.com")
    await dialog.getByTestId("account-management-auto-detect-button").click()
    await expect(
      dialog.getByTestId("account-management-username-input"),
    ).toHaveValue(identity.email, { timeout: 60000 })
    await expect(
      dialog.getByTestId("account-management-user-id-input"),
    ).toHaveValue(identity.id)
    await expect
      .poll(
        async () =>
          !!(await dialog
            .getByTestId("account-management-access-token-input")
            .inputValue()),
      )
      .toBe(true)
    await expect
      .poll(
        async () =>
          !!(await dialog
            .getByTestId("account-management-aiml-api-key-input")
            .inputValue()),
      )
      .toBe(true)
    await page.screenshot({
      path: path.join(evidenceDir, "automatic-identity.png"),
      animations: "disabled",
    })
    await withUiCreatedAccount(
      serviceWorker,
      async (name) => {
        await dialog
          .getByTestId("account-management-site-name-input")
          .fill(name)
        await dialog
          .getByTestId("account-management-confirm-add-button")
          .click()
        await expect(dialog).toBeHidden({ timeout: 60000 })
      },
      async (account) => {
        expect(account.account_info.id).toBe(identity.id)
        expect(account.account_info.username).toBe(identity.email)
        expect(!!account.aimlApiAuth?.apiKey).toBe(true)
        await page.reload()
        const row = page.getByTestId(
          `account-management-account-list-item-${account.id}`,
        )
        await row.waitFor({ state: "visible", timeout: 30000 })
        await row.hover()
        await row
          .getByTestId("account-management-row-more-actions-button")
          .click()
        await page
          .getByTestId("account-management-row-refresh-menu-item")
          .click()
        await expect
          .poll(
            () =>
              serviceWorker.evaluate(async (id) => {
                const raw = (await chrome.storage.local.get("site_accounts"))
                  .site_accounts
                const data = typeof raw === "string" ? JSON.parse(raw) : raw
                const a = data.accounts.find((x) => x.id === id)
                return a?.account_info?.nativeBalance?.unit || null
              }, account.id),
            { timeout: 60000 },
          )
          .toBe("USD")
      },
    )
    console.log(
      "PASS automatic session -> durable credentials -> identity fill -> save -> refresh",
    )
  } finally {
    await page.close()
    const after = await readLedger()
    const owned = Object.values(after[identity.id] || {})
      .filter((x) => x.state === "ready" && x.id && !knownIds.has(x.id))
      .map((x) => x.id)
    for (const id of owned) {
      const result = await serviceWorker.evaluate(
        async ({ id, token }) => {
          const r = await fetch(
            `https://app.aimlapi.com/v1/keys/${encodeURIComponent(id)}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
          )
          return r.status
        },
        { id, token: session.key },
      )
      requireDeleted(result, id)
    }
    if (
      owned.length &&
      Object.keys(before).length === 0 &&
      Object.values(after[identity.id] || {}).every(
        (entry) => entry.state === "ready",
      ) &&
      Object.keys(after).every((id) => id === identity.id)
    )
      await serviceWorker.evaluate(() =>
        chrome.storage.local.remove("aimlapiConnectionCredentials_v1"),
      )
    console.log(`Cleaned ${owned.length} keys proven created by this run`)
  }
}
