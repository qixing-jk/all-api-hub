import type { Page, Response } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { hasNewApiLoginAssistCredentials } from "~/services/managedSites/providers/newApi/newApiSessionContracts"
import { generateNewApiTotpCode } from "~/services/managedSites/providers/newApi/newApiTotp"
import type { NewApiConfig } from "~/types/newApiConfig"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  getServiceWorker,
  getStoredUserPreferences,
} from "~~/e2e/utils/extensionState"

/** Exercise the settings entry against native responses without reading a channel key. */
export async function runNewApiSettingsSessionVerificationScenario(params: {
  page: Page
  extensionId: string
  config: NewApiConfig
}) {
  const { page, extensionId, config } = params
  if (!hasNewApiLoginAssistCredentials(config) || !config.totpSecret?.trim()) {
    test.info().annotations.push({
      type: "session-verification-not-tested",
      description:
        "Settings session checks need administrator login and TOTP credentials.",
    })
    return
  }
  const worker = await getServiceWorker(page.context())
  const preferences = await getStoredUserPreferences(worker)
  const originalTotpSecret = (
    preferences.newApi as Partial<NewApiConfig> | undefined
  )?.totpSecret
  const origin = new URL(config.baseUrl).origin
  const observedChannels = new Set<number>()
  let secureRequests = 0
  let keyReads = 0
  let hasScopedProof = false
  let hasValidContext = false
  let isLegacy = false
  let selectedChannel: number | undefined
  const observeResponse = async (response: Response) => {
    const url = new URL(response.url())
    if (url.origin !== origin) return
    if (/\/api\/channel\/\d+\/key$/.test(url.pathname)) keyReads++
    if (!response.ok()) return
    if (url.pathname === "/api/channel/") {
      const data = (await response.json()).data
      for (const channel of data?.items ?? []) {
        if (Number.isSafeInteger(channel.id) && channel.id > 0)
          observedChannels.add(channel.id)
      }
    }
    if (url.pathname !== "/api/verify") return
    const body = response.request().postDataJSON()
    const result = await response.json()
    if (result.success !== true) return
    isLegacy = !body.scope
    hasValidContext = Boolean(
      body.scope === "channel.key.read" &&
      body.context &&
      Object.keys(body.context).length === 1 &&
      Number.isSafeInteger(body.context.channel_id) &&
      body.context.channel_id > 0,
    )
    selectedChannel = body.context?.channel_id
    hasScopedProof =
      typeof result.data?.proof_token === "string" &&
      result.data.proof_token.length > 0
    secureRequests++
  }
  // Keep authenticated bodies in memory; only boolean evidence reaches assertions.
  page.context().on("response", observeResponse)
  try {
    for (const mode of ["automatic", "manual"] as const) {
      await test.step(`Test New API settings session with ${mode} TOTP`, async () => {
        observedChannels.clear()
        secureRequests = 0
        hasScopedProof = false
        hasValidContext = false
        isLegacy = false
        selectedChannel = undefined
        const settingsUrl = `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=managedSite&anchor=new-api-session-test#${MENU_ITEM_IDS.BASIC}`
        // Reload an identical URL so each mode starts with fresh page state.
        if (page.url() === settingsUrl) await page.reload()
        else await page.goto(settingsUrl)
        const totp = page.locator("#new-api-totp-secret input")
        await totp.fill(mode === "automatic" ? config.totpSecret! : "")
        await totp.blur()
        await page.locator("#new-api-session-test").getByRole("button").click()
        const success = page.getByText(
          /The New API login session and this two-factor verification test passed/,
        )
        if (mode === "manual") {
          const dialog = page.getByRole("dialog")
          const code = dialog.getByLabel("Verification code", { exact: true })
          // A fresh session may require login 2FA before secure verification.
          for (let stage = 0; stage < 2; stage++) {
            await expect(code.or(success)).toBeVisible({ timeout: 45_000 })
            if (await success.isVisible()) break
            await code.fill(generateNewApiTotpCode(config.totpSecret!))
            const login = dialog.getByRole("button", {
              name: "Submit login code",
              exact: true,
            })
            if (await login.isVisible()) {
              await login.click()
              await expect(login).toBeHidden({ timeout: 45_000 })
            } else {
              await dialog
                .getByRole("button", {
                  name: "Submit verification code",
                  exact: true,
                })
                .click()
              break
            }
          }
        }
        await expect(success).toBeVisible({ timeout: 45_000 })
        await expect(page.getByRole("dialog")).toHaveCount(0)
        await expect
          .poll(() => secureRequests, {
            message: "A real security verification request completed",
          })
          .toBe(1)
        if (isLegacy) {
          test.info().annotations.push({
            type: "new-api-session-verification",
            description: `${mode}: legacy Cookie verification passed; modern channel context not exercised`,
          })
        } else {
          expect(
            hasValidContext,
            "Security verification binds a positive channel ID",
          ).toBe(true)
          expect(
            observedChannels.has(selectedChannel!),
            "Selected channel was returned by the live inventory",
          ).toBe(true)
          expect(hasScopedProof, "Server issued a scoped security proof").toBe(
            true,
          )
          test.info().annotations.push({
            type: "new-api-session-verification",
            description: `${mode}: native inventory, channel context, and scoped proof verified`,
          })
        }
        expect(
          keyReads,
          "Settings verification does not read channel secrets",
        ).toBe(0)
      })
    }
  } finally {
    page.context().off("response", observeResponse)
    await worker.evaluate(
      async ({ key, lock, original, scenarioSecret }) => {
        await navigator.locks.request(lock, async () => {
          const raw = (await chrome.storage.local.get(key))[key]
          const current = typeof raw === "string" ? JSON.parse(raw) : raw
          if (!current?.newApi) return
          // Restore only this scenario's writes; retain unrelated/operator changes.
          if (
            current.newApi.totpSecret !== "" &&
            current.newApi.totpSecret !== scenarioSecret
          )
            return
          if (original === undefined) delete current.newApi.totpSecret
          else current.newApi.totpSecret = original
          current.lastUpdated = Date.now()
          await chrome.storage.local.set({
            [key]: typeof raw === "string" ? JSON.stringify(current) : current,
          })
        })
      },
      {
        key: STORAGE_KEYS.USER_PREFERENCES,
        lock: STORAGE_LOCKS.USER_PREFERENCES,
        original: originalTotpSecret,
        scenarioSecret: config.totpSecret,
      },
    )
  }
}
