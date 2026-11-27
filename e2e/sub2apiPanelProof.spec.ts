import { createHash, createPublicKey, verify } from "node:crypto"
import http from "node:http"
import type { AddressInfo } from "node:net"

import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_ROUTE_PARAMS } from "~/features/AccountManagement/routeParams"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { SUB2API_PANEL_PROOF_DATABASE_NAME } from "~/services/core/storageKeys"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { readStoredAccounts } from "~~/e2e/scenarios/accountManualAdd"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const verificationMode of [
  "none",
  "turnstile",
  "local-pow",
  "first-login",
  "pow-only",
] as const) {
  const attendedCaptcha = verificationMode === "turnstile"
  const signed = verificationMode !== "pow-only"
  const firstLogin = verificationMode === "first-login" || !signed
  const localPow = verificationMode === "local-pow" || firstLogin
  test(`Sub2API ${signed ? "signed" : "unsigned local-pow"} credentials ${firstLogin ? "acquire from an empty token through protocol discovery" : attendedCaptcha ? "acquire through the account dialog CAPTCHA action" : localPow ? "complete local verification in the background" : "recover in the background"} and renew without cookies`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    test.slow()
    const hash = (value: string | Buffer) =>
      createHash("sha256").update(value).digest("base64url")
    const issueToken = (key: string, version: number) =>
      `e30.${Buffer.from(JSON.stringify({ ...(signed ? { cnf: { jkt: key } } : {}), exp: Math.floor(Date.now() / 1000) + 3600, version })).toString("base64url")}.signature`
    const user = {
      id: 17,
      email: "member@example.com",
      username: "member",
      balance: 12.5,
    }
    let keyBinding = "foreign-browser-key"
    let accessToken = issueToken(keyBinding, 0)
    let refreshToken = ""
    let expired = false
    let logins = 0
    let rotations = 0
    const pagesOpened: string[] = []
    const failures: string[] = []
    const server = http.createServer(async (request, response) => {
      const url = new URL(request.url!, "http://localhost")
      response.setHeader("Content-Type", "application/json")
      const send = (data: unknown) =>
        response.end(JSON.stringify({ code: 0, message: "success", data }))
      const reject = (reason: string) => {
        response.statusCode = 401
        response.end(
          JSON.stringify({ code: 401, message: "Request rejected", reason }),
        )
      }
      if (url.pathname === "/api/v1/settings/public")
        return send({
          site_name: "Sub2API",
          password_login_enabled: true,
          turnstile_enabled: attendedCaptcha || localPow,
        })
      if (url.pathname === "/checkin/api/status") {
        response.statusCode = 404
        return response.end(JSON.stringify({ code: 404 }))
      }
      if (!url.pathname.startsWith("/api/")) {
        pagesOpened.push(url.pathname)
        response.setHeader("Content-Type", "text/html")
        return response.end(
          '<!doctype html><title>Controlled verification fixture</title><input name="cf-turnstile-response" type="hidden" value="controlled-captcha">',
        )
      }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const bytes = Buffer.concat(chunks)
      let thumbprint = "unsigned"
      try {
        if (request.headers.cookie) throw new Error("Ambient Cookie was sent")
        const proof = String(request.headers["x-panel-proof"] ?? "")
        if (!signed) {
          if (proof)
            throw new Error(
              "Unsigned local verification unexpectedly enabled signing",
            )
        } else {
          if (!proof) return reject("PANEL_PROOF_INVALID")
          const [head, payload, signature] = proof.split(".") as [
            string,
            string,
            string,
          ]
          const header = JSON.parse(Buffer.from(head, "base64url").toString())
          const claims = JSON.parse(
            Buffer.from(payload, "base64url").toString(),
          )
          const jwk = header.jwk
          thumbprint = hash(
            JSON.stringify({ crv: "P-256", kty: "EC", x: jwk.x, y: jwk.y }),
          )
          if (
            header.typ !== "sub2api-panel-pop+jwt" ||
            claims.htm !== request.method ||
            claims.htu !== request.url ||
            claims.ct !==
              String(request.headers["content-type"] ?? "").trim() ||
            claims.bht !== hash(bytes) ||
            claims.ath !==
              hash(
                String(request.headers.authorization ?? "").replace(
                  /^Bearer /,
                  "",
                ),
              )
          )
            throw new Error("Signed material differed from the actual request")
          if (
            !verify(
              "sha256",
              Buffer.from(`${head}.${payload}`),
              {
                key: createPublicKey({ key: jwk, format: "jwk" }),
                dsaEncoding: "ieee-p1363",
              },
              Buffer.from(signature, "base64url"),
            )
          )
            throw new Error("Invalid signature")
        }
      } catch (error) {
        failures.push(String(error))
        return reject("PANEL_PROOF_INVALID")
      }
      if (url.pathname === "/api/v1/auth/security-challenge") {
        if (!localPow) {
          response.statusCode = 404
          return response.end(JSON.stringify({ code: 404 }))
        }
        return send({
          provider: "local_pow",
          bits: 16,
          prefix: "e2e-sub2api-local:",
          ticket: "spow1_e2e",
          expires_in: 60,
        })
      }
      if (url.pathname === "/api/v1/auth/login") {
        const body = JSON.parse(bytes.toString())
        if (localPow) {
          const token = String(body.turnstile_token ?? "")
          const nonce = token.slice("spow1_e2e.".length)
          if (
            !/^spow1_e2e\.[0-9a-z]+$/.test(token) ||
            !createHash("sha256")
              .update(`e2e-sub2api-local:${nonce}`)
              .digest()
              .subarray(0, 2)
              .equals(Buffer.from([0, 0]))
          )
            return reject("INVALID_LOCAL_VERIFICATION")
        }
        if (attendedCaptcha && body.turnstile_token !== "controlled-captcha")
          return reject("CAPTCHA_REQUIRED")
        if (
          body.email !== "member@example.com" ||
          body.password !== "fixture-password"
        )
          return reject("INVALID_CREDENTIALS")
        logins++
        keyBinding = thumbprint
        accessToken = issueToken(keyBinding, 1)
        refreshToken = "issued-refresh"
        return send({
          user,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
        })
      }
      // The real deployment validates the empty discovery request before
      // looking up a refresh family; this never rotates a real session.
      if (
        url.pathname === "/api/v1/auth/refresh" &&
        !JSON.parse(bytes.toString()).refresh_token
      ) {
        response.statusCode = 400
        return response.end(
          JSON.stringify({ code: 400, message: "Refresh token is required" }),
        )
      }
      if (signed && thumbprint !== keyBinding)
        return reject("PANEL_PROOF_INVALID")
      if (url.pathname === "/api/v1/auth/refresh") {
        if (JSON.parse(bytes.toString()).refresh_token !== refreshToken)
          return reject("INVALID_REFRESH_TOKEN")
        rotations++
        accessToken = issueToken(keyBinding, 2)
        refreshToken = "rotated-refresh"
        expired = false
        return send({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
        })
      }
      if (request.headers.authorization !== `Bearer ${accessToken}` || expired)
        return reject("TOKEN_EXPIRED")
      if (url.pathname === "/api/v1/auth/me") return send(user)
      if (url.pathname === "/api/v1/usage/stats")
        return send({
          total_actual_cost: 0,
          total_requests: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
        })
      return send([])
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      await forceExtensionLanguage(page, "en")
      await stubLlmMetadataIndex(context)
      const worker = await getServiceWorker(context)
      await seedUserPreferences(worker, {
        accountAutoRefresh: {
          ...DEFAULT_PREFERENCES.accountAutoRefresh,
          enabled: false,
          refreshOnOpen: false,
        },
        autoCheckin: {
          ...DEFAULT_PREFERENCES.autoCheckin!,
          globalEnabled: false,
          pretriggerDailyOnUiOpen: false,
        },
      })
      await seedStoredAccounts(worker, [
        createStoredAccount({
          id: "proof-account",
          site_type: SITE_TYPES.SUB2API,
          site_url: origin,
          site_name: "Sub2API proof",
          authType: AuthTypeEnum.AccessToken,
          account_info: {
            id: "17",
            username: "member",
            access_token: firstLogin ? "" : accessToken,
          },
          login: {
            methodId: "password",
            credentials: {
              username: "member@example.com",
              password: "fixture-password",
            },
            automaticRecovery: true,
          },
          sub2apiAuth: undefined,
        }),
      ])
      await page.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
      )
      await waitForExtensionRoot(page)
      const refresh = async () => {
        const row = page.getByTestId(
          getAccountManagementListItemTestId("proof-account"),
        )
        await row.hover()
        await row
          .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton)
          .click()
        await page
          .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowRefreshMenuItem)
          .click()
      }
      if (attendedCaptcha || firstLogin) {
        await page.emulateMedia({ reducedMotion: "reduce" })
        const row = page.getByTestId(
          getAccountManagementListItemTestId("proof-account"),
        )
        await row.hover()
        await row.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton).click()
        const dialog = page.getByRole("dialog", {
          name: "Edit Account",
          exact: true,
        })
        await expect(dialog).toBeVisible()
        await dialog
          .getByTestId(
            ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiIndependentSessionOption,
          )
          .click()
        const acquire = dialog.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiLoginSessionButton,
        )
        const importSession = dialog.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiImportSessionButton,
        )
        await expect(importSession).toHaveCount(0)
        await expect(acquire).toHaveText("Get session")
        await expect(acquire).toHaveAccessibleDescription(
          "Use Account Login to create a renewable session.",
        )
        if (!firstLogin) {
          await acquire.evaluate((button) =>
            button.scrollIntoView({ block: "center" }),
          )
          await dialog.screenshot({
            path: testInfo.outputPath("configured-desktop.png"),
            animations: "disabled",
          })
        }
        await acquire.click()
        await expect(acquire).toHaveText("Re-sign in")
        await expect(
          dialog.getByText("Renewal session configured"),
        ).toBeVisible()
        await expect(
          dialog.getByTestId(
            ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiRefreshTokenInput,
          ),
        ).toHaveCount(0)
        if (!firstLogin) {
          await acquire.evaluate((button) =>
            button.scrollIntoView({ block: "center" }),
          )
          await dialog.screenshot({
            path: testInfo.outputPath("acquired-session.png"),
            animations: "disabled",
          })
        }
        const manual = dialog.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiManualDisclosure,
        )
        await manual.click()
        await expect(
          dialog.getByTestId(
            ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiRefreshTokenInput,
          ),
        ).toHaveValue("issued-refresh")
        await manual.click()
        await dialog
          .getByRole("button", { name: "Save Changes", exact: true })
          .click()
        await expect(dialog).not.toBeVisible()
        const keyPrompt = page.getByRole("dialog", {
          name: "Create API Key",
          exact: true,
        })
        if (await keyPrompt.isVisible())
          await keyPrompt
            .getByRole("button", { name: "Cancel", exact: true })
            .click()
      } else await refresh()
      await expect
        .poll(
          async () =>
            (await readStoredAccounts(worker))[0]?.sub2apiAuth?.refreshToken,
        )
        .toBe("issued-refresh")
      expect(logins).toBe(1)
      // The UI reload loses module-local state; the native key must remain usable.
      await page.reload()
      await waitForExtensionRoot(page)
      expired = true
      await refresh()
      await expect
        .poll(
          async () =>
            (await readStoredAccounts(worker))[0]?.sub2apiAuth?.refreshToken,
        )
        .toBe("rotated-refresh")
      expect(rotations).toBe(1)
      expect(logins).toBe(1)
      // A foreign browser token first tries its existing website session. The
      // independently issued replacement and its renewal stay in background.
      expect(pagesOpened).toEqual(
        attendedCaptcha ? ["/login"] : firstLogin ? [] : ["/"],
      )
      expect(
        context.pages().filter((page) => page.url().startsWith(origin)),
      ).toEqual([])
      expect(failures).toEqual([])
      const key = await worker.evaluate(
        async ({ databaseName, origin }) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(databaseName)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
          const pair = await new Promise<CryptoKeyPair>((resolve, reject) => {
            const request = database
              .transaction("keys")
              .objectStore("keys")
              .get(origin)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
          database.close()
          if (!pair) return null
          return {
            privateExportable: pair.privateKey.extractable,
            jwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
          }
        },
        { databaseName: SUB2API_PANEL_PROOF_DATABASE_NAME, origin },
      )
      if (!signed) expect(key).toBeNull()
      else {
        expect(key!.privateExportable).toBe(false)
        expect(
          hash(
            JSON.stringify({
              crv: "P-256",
              kty: "EC",
              x: key!.jwk.x,
              y: key!.jwk.y,
            }),
          ),
        ).toBe(keyBinding)
      }
      await testInfo.attach("background-proof-result", {
        body: JSON.stringify({
          logins,
          rotations,
          pagesOpened,
          keyPersistedAcrossReload: signed,
          privateExportable: key?.privateExportable ?? null,
        }),
        contentType: "application/json",
      })
      if (attendedCaptcha) {
        const popup = await context.newPage()
        try {
          await popup.setViewportSize({ width: 390, height: 720 })
          await popup.emulateMedia({ reducedMotion: "reduce" })
          await popup.goto(
            `chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`,
          )
          await waitForExtensionRoot(popup)
          const popupRow = popup.getByTestId(
            getAccountManagementListItemTestId("proof-account"),
          )
          await popupRow.hover()
          await popupRow
            .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
            .click()
          const popupEditor = popup.getByRole("dialog", {
            name: "Edit Account",
            exact: true,
          })
          const popupAcquire = popupEditor.getByTestId(
            ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiLoginSessionButton,
          )
          await expect(popupAcquire).toHaveText("Re-sign in")
          await popupEditor
            .getByTestId(
              ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiBrowserSessionOption,
            )
            .click()
          await popupEditor
            .getByTestId(
              ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiIndependentSessionOption,
            )
            .click()
          await expect(popupAcquire).toHaveText("Get session")
          await popupAcquire.evaluate((button) =>
            button.scrollIntoView({ block: "center" }),
          )
          await popupEditor.screenshot({
            path: testInfo.outputPath("configured-popup.png"),
            animations: "disabled",
          })
          await popupEditor
            .getByRole("button", { name: "Close", exact: true })
            .click()
          await popupRow.hover()
          await popupRow
            .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
            .click()
          await expect(popupAcquire).toBeEnabled()
          const supportsNativeSidePanel = await popup.evaluate(
            () =>
              typeof chrome.sidePanel?.open === "function" &&
              typeof navigator.locks?.request === "function",
          )
          await expect(popupAcquire).toHaveAccessibleDescription(
            supportsNativeSidePanel
              ? "Continues in the side panel."
              : "Continues on a full page.",
          )
          const editedNotes = "Retain this popup draft"
          const notesPlaceholder = "Optional, enter notes"
          const readiness = await popupAcquire.evaluateHandle((button) => {
            let changes = 0
            const observer = new MutationObserver((records) => {
              changes += records.length
            })
            observer.observe(button, {
              attributes: true,
              attributeFilter: ["disabled", "aria-busy"],
            })
            return {
              stop() {
                observer.disconnect()
                return changes
              },
            }
          })
          await popupEditor.getByPlaceholder(notesPlaceholder).fill(editedNotes)
          await expect(popupAcquire).toHaveText("Re-sign in")
          await expect(popupAcquire).toBeEnabled()
          expect(await readiness.evaluate((record) => record.stop())).toBe(0)
          await readiness.dispose()
          await expect(
            popupAcquire.locator("svg.lucide-arrow-up-right"),
          ).toBeVisible()
          await popupAcquire.evaluate((button) =>
            button.scrollIntoView({ block: "center" }),
          )
          await expect(
            popupEditor.getByTestId(
              ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiManualDisclosure,
            ),
          ).toHaveAttribute("aria-expanded", "false")
          await popupEditor.screenshot({
            path: testInfo.outputPath("acquired-session-popup.png"),
            animations: "disabled",
          })
          await popupAcquire.click()
          const receivingDraft = (openManual = false) =>
            page.evaluate(
              ({
                sidePanelPath,
                routeParam,
                notesPlaceholder,
                disclosureId,
                inputId,
                openManual,
              }) => {
                const target = chrome.extension
                  .getViews()
                  .find(
                    (view) =>
                      view.location.pathname === `/${sidePanelPath}` ||
                      new URL(view.location.href).searchParams.has(routeParam),
                  )
                const disclosure =
                  target?.document.querySelector<HTMLButtonElement>(
                    `[data-testid="${disclosureId}"]`,
                  )
                if (
                  openManual &&
                  disclosure?.getAttribute("aria-expanded") === "false"
                )
                  disclosure.click()
                return {
                  notes: target?.document.querySelector<HTMLTextAreaElement>(
                    `textarea[placeholder="${notesPlaceholder}"]`,
                  )?.value,
                  manualReady: Boolean(disclosure),
                  refreshToken:
                    target?.document.querySelector<HTMLInputElement>(
                      `[data-testid="${inputId}"]`,
                    )?.value,
                }
              },
              {
                sidePanelPath: SIDEPANEL_PAGE_PATH,
                routeParam:
                  ACCOUNT_MANAGEMENT_ROUTE_PARAMS.AccountDialogRecovery,
                notesPlaceholder,
                disclosureId:
                  ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiManualDisclosure,
                inputId: ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiRefreshTokenInput,
                openManual,
              },
            )
          await expect
            .poll(() => receivingDraft())
            .toMatchObject({ notes: editedNotes, manualReady: true })
          await receivingDraft(true)
          await expect
            .poll(() => receivingDraft())
            .toMatchObject({
              notes: editedNotes,
              refreshToken: "issued-refresh",
            })
          expect(logins).toBe(2)
          await expect.poll(() => popup.isClosed()).toBe(true)
        } finally {
          await popup.close()
        }
      }
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
}
