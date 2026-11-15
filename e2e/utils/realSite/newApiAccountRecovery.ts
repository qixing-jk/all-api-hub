import type { BrowserContext, Page, Worker } from "@playwright/test"

import { expect } from "~~/e2e/fixtures/extensionTest"
import type { ExtensionPageGuardOptions } from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import type { AccountAddDialog } from "~~/e2e/utils/realSite/accountAdd"
import type { CompatibleApiRealSiteConfig } from "~~/e2e/utils/realSite/compatibleApi"
import {
  copyNewApiAccessToken,
  fillSecret,
} from "~~/scripts/flows/new-api-token-ui.mjs"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

import {
  E2E_ACCESS_TOKEN_NAME,
  revokeStaleE2eAccessTokens,
} from "./newApiAccessTokens"
import { observeNewApiRefreshes } from "./newApiRefreshObserver"

export {
  describeNewApiRefreshObservations,
  observeNewApiRefreshes,
  type NewApiRefreshObservation,
} from "./newApiRefreshObserver"

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
  const refreshObserver = observeNewApiRefreshes(params.page, baseUrl)

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

        throw new Error(
          await describeDetectedDialogFailure(dialog, error, refreshObserver),
          { cause: error },
        )
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
      const worker = await getServiceWorker(context)
      const sourceTab = await params.page.evaluate(() =>
        chrome.tabs.getCurrent(),
      )
      if (sourceTab?.windowId == null) {
        throw new Error("Credential recovery requires the account dialog's tab")
      }
      const [securityPage] = await Promise.all([
        waitForNewUserFacingCredentialPage(context, worker, sourceTab.windowId),
        dialog.dialog
          .getByRole("button", { name: "Open token page", exact: true })
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

        const token = await copyNewApiAccessToken(securityPage, params.config, {
          tokenName: E2E_ACCESS_TOKEN_NAME,
          neverExpires: true,
          useClipboard: true,
          allowLegacyRotation: true,
          beforeCreateScopedToken: () =>
            revokeStaleE2eAccessTokens(params.config),
        })
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
  refreshObserver: ReturnType<typeof observeNewApiRefreshes>,
) {
  const failureText = await readDetectedDialogFailureText(dialog)
  const detail =
    failureText || (error instanceof Error ? error.message : String(error))
  const refreshObservations =
    refreshObserver.describe() || "dashboard refresh requests: none observed"

  return [
    `New API account detection never became confirmable: ${detail}`,
    refreshObservations,
  ].join("; ")
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

/** Waits for a new credential page to become active in the account dialog's window. */
export async function waitForNewUserFacingCredentialPage(
  context: BrowserContext,
  worker: Worker,
  sourceWindowId: number,
  timeout = 30_000,
): Promise<Page> {
  const existingPages = new Set(context.pages())
  let selectedPage: Page | undefined
  const inspecting = new Set<Page>()
  let finished = false
  // A page event can precede tab activation. Keep inspecting new candidates
  // until the document matches the source window's active tab. Inspection
  // windows may briefly gain focus, but they never own the user's token flow.
  try {
    await expect
      .poll(
        () => {
          for (const candidate of context.pages()) {
            if (
              existingPages.has(candidate) ||
              candidate.isClosed() ||
              inspecting.has(candidate)
            )
              continue
            inspecting.add(candidate)
            void isUserFacingCredentialPage(candidate, worker, sourceWindowId)
              .then((matches) => {
                if (!finished && matches) selectedPage = candidate
              })
              .finally(() => inspecting.delete(candidate))
          }
          return selectedPage !== undefined
        },
        { timeout },
      )
      .toBe(true)
    return selectedPage!
  } finally {
    finished = true
  }
}

/** Excludes temporary inspection windows even when they gain focus at the same URL. */
export async function isUserFacingCredentialPage(
  page: Page,
  worker: Worker,
  sourceWindowId: number,
) {
  const marker = `data-aah-credential-candidate-${crypto.randomUUID()}`
  try {
    await page.waitForLoadState("domcontentloaded")
    await page.evaluate((marker) => {
      document.documentElement.setAttribute(marker, "")
    }, marker)
    return await worker.evaluate(
      async ({ marker, url, sourceWindowId }) => {
        const [tab] = await chrome.tabs.query({
          active: true,
          windowId: sourceWindowId,
        })
        if (tab?.id == null || tab.url !== url) return false
        // Different windows can have visible documents at the same URL, even
        // with hasFocus() true in headless Chrome. Match the actual document.
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (marker) => document.documentElement.hasAttribute(marker),
          args: [marker],
        })
        return result?.result === true
      },
      { marker, url: page.url(), sourceWindowId },
    )
  } catch {
    // An owned inspection page may be released before loading completes.
    return false
  } finally {
    await page
      .evaluate(
        (marker) => document.documentElement.removeAttribute(marker),
        marker,
      )
      .catch(() => {})
  }
}
