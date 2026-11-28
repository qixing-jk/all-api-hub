import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import { SITE_TYPES } from "~/constants/siteType"
import { AuthTypeEnum } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
} from "~~/e2e/utils/commonUserFlows"
import {
  getServiceWorker,
  requestAndExpectOptionalPermissions,
} from "~~/e2e/utils/extensionState"
import {
  sendRedemptionContextMenuTrigger,
  waitForRedemptionAssistReady,
} from "~~/e2e/utils/redemptionAssist"

const resetCode = "PMRC-ABCD-EFGH-JKMN-PQRS"
const genericCode = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"

const CLAIM_OUTCOMES = {
  Success: "success",
  Uncertain: "uncertain",
  Rejected: "rejected",
} as const

// Real HTTP captures headers after DNR. Responses are pinned native-contract
// fixtures; this does not claim a real upstream card or exercise its inventory.
test("PM-Plan redemption filters targets, confirms claims and preserves uncertain outcomes", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  const writes: Array<{
    host: string
    path: string
    cookie: string | undefined
    csrf: string | undefined
    authorization: string | undefined
    body: string
  }> = []
  let outcome: (typeof CLAIM_OUTCOMES)[keyof typeof CLAIM_OUTCOMES] =
    CLAIM_OUTCOMES.Success
  const server = createServer((request, response) => {
    const pathname = new URL(request.url!, `http://${request.headers.host}`)
      .pathname
    const json = (body: unknown, status = 200) => {
      response.writeHead(status, { "content-type": "application/json" })
      response.end(JSON.stringify(body))
    }
    if (request.method === "POST") {
      let body = ""
      request.on("data", (chunk) => {
        body += chunk
      })
      request.on("end", () => {
        writes.push({
          host: request.headers.host!,
          path: pathname,
          cookie: request.headers.cookie,
          csrf: request.headers["x-pmplan-csrf"] as string | undefined,
          authorization: request.headers.authorization,
          body,
        })
        if (pathname === "/api/reset-cards/redeem")
          return outcome === CLAIM_OUTCOMES.Uncertain
            ? json({}, 503)
            : outcome === CLAIM_OUTCOMES.Rejected
              ? json({ error: "Card already claimed" }, 409)
              : json({ ok: true, id: 42 })
        json({ error: "Unexpected mutation" }, 400)
      })
      return
    }
    if (pathname === "/api/me")
      return json({
        user: { id: 661, username: "fixture-user" },
        plan: { name: "Lite" },
        usage: {
          h5_limit: 1000000,
          h5_used: 0,
          weekly_limit: 2000000,
          weekly_used: 0,
          monthly_limit: 5000000,
          monthly_used: 0,
        },
        checkin: { checked_in_today: true },
      })
    response.writeHead(200, { "content-type": "text/html" })
    response.end(
      `<html><title>Reset card fixture</title><body><h1>Card announcement</h1><p id="code">${resetCode}</p></body></html>`,
    )
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const port = (server.address() as AddressInfo).port
  const origin = `http://127.0.0.1:${port}`
  const otherOrigin = `http://localhost:${port}`
  try {
    await forceExtensionLanguage(page, "en")
    await page.setViewportSize({ width: 1100, height: 850 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await requestAndExpectOptionalPermissions(page, ["cookies"])
    const worker = await getServiceWorker(context)
    const plan = createStoredAccount({
      id: "plan-a",
      site_name: "Plan A",
      site_type: SITE_TYPES.PMPLAN,
      site_url: origin,
      authType: AuthTypeEnum.Cookie,
      cookieAuth: { sessionCookie: "pmplan_session=account-a" },
      account_info: { id: "661", username: "fixture-user", access_token: "" },
    })
    const other = createStoredAccount({
      ...plan,
      id: "plan-b",
      site_name: "Plan B",
      site_url: otherOrigin,
      cookieAuth: { sessionCookie: "pmplan_session=account-b" },
    })
    const generic = createStoredAccount({
      id: "generic",
      site_name: "Generic account",
      site_url: origin,
    })
    const disabled = createStoredAccount({
      ...plan,
      id: "disabled",
      site_name: "Disabled plan",
      disabled: true,
    })
    const unsupported = createStoredAccount({
      id: "unsupported",
      site_name: "Unsupported",
      site_type: SITE_TYPES.REQUESTY,
      site_url: origin,
    })
    await seedStoredAccounts(worker, [
      plan,
      other,
      generic,
      disabled,
      unsupported,
    ])
    await seedUserPreferences(worker, {
      language: "en",
      redemptionAssist: {
        enabled: true,
        relaxedCodeValidation: false,
        urlWhitelist: {
          enabled: false,
          patterns: [],
          includeAccountSiteUrls: false,
          includeCheckInAndRedeemUrls: false,
        },
      },
    })
    const host = page.locator("all-api-hub-redemption-toast")
    const picker = host.getByRole("region", {
      name: "Select a PM-Plan account to claim the card",
    })
    const trigger = async (code = resetCode) => {
      await page.goto(origin)
      await sendRedemptionContextMenuTrigger(worker, {
        pageUrl: page.url(),
        selectionText: code,
      })
    }
    const capture = async (name: string) => {
      await host
        .locator("section")
        .last()
        .screenshot({
          path: testInfo.outputPath(`${name}.png`),
          animations: "disabled",
        })
    }

    // Native-page automatic detection still requires explicit target confirmation.
    await page.goto(origin)
    await waitForRedemptionAssistReady(worker, page.url(), true)
    await page.locator("#code").evaluate((target) => {
      const range = document.createRange()
      range.selectNodeContents(target)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      const clipboardData = new DataTransfer()
      clipboardData.setData("text", target.textContent!)
      target.dispatchEvent(
        new ClipboardEvent("copy", { bubbles: true, clipboardData }),
      )
    })
    await expect(host.getByText(/This will not use the card/)).toBeVisible()
    await capture("detected-card")
    await host.getByRole("button", { name: "Auto redeem", exact: true }).click()
    await expect(picker).toBeVisible()
    await expect(picker.getByRole("radio")).toHaveCount(2)
    await expect(picker.getByText("Generic account")).toHaveCount(0)
    await expect(picker.getByText("Disabled plan")).toHaveCount(0)
    await expect(picker.getByText(origin, { exact: true })).toBeVisible()
    expect(writes).toEqual([])
    await capture("compatible-accounts")
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(
      picker.getByRole("button", { name: "Confirm redemption", exact: true }),
    ).toBeInViewport()
    await capture("compatible-accounts-narrow")
    await page.setViewportSize({ width: 1100, height: 850 })
    await picker.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(host.getByText("Cancelled", { exact: true })).toBeVisible()
    await capture("cancelled")
    expect(writes).toEqual([])

    // A single compatible account must still be confirmed.
    await seedStoredAccounts(worker, [plan, generic])
    await trigger()
    await expect(picker.getByRole("radio")).toHaveCount(1)
    expect(writes).toEqual([])
    await picker
      .getByRole("button", { name: "Confirm redemption", exact: true })
      .click()
    await expect(
      host.getByText("Reset card claimed. It has not been used.", {
        exact: true,
      }),
    ).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath("claimed.png"),
      animations: "disabled",
    })
    expect(writes).toEqual([
      {
        host: `127.0.0.1:${port}`,
        path: "/api/reset-cards/redeem",
        cookie: "pmplan_session=account-a",
        csrf: "1",
        authorization: undefined,
        body: JSON.stringify({ code: resetCode }),
      },
    ])

    outcome = CLAIM_OUTCOMES.Uncertain
    await trigger()
    await picker
      .getByRole("button", { name: "Confirm redemption", exact: true })
      .click()
    await expect(host.getByText(/The claim result is uncertain/)).toBeVisible()
    await expect(host.getByText("Unconfirmed", { exact: true })).toBeVisible()
    await expect(
      host.getByText("Total 1. Succeeded 0. Failed 0. Unconfirmed 1.", {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      host.getByRole("button", { name: "Retry", exact: true }),
    ).toHaveCount(0)
    expect(writes).toHaveLength(2)
    await capture("uncertain-claim")

    outcome = CLAIM_OUTCOMES.Rejected
    await trigger()
    await picker
      .getByRole("button", { name: "Confirm redemption", exact: true })
      .click()
    await expect(host.getByText(/Card already claimed/)).toBeVisible()
    await expect(
      host.getByRole("button", { name: "Retry", exact: true }),
    ).toBeVisible()
    await capture("rejected-claim")
    outcome = CLAIM_OUTCOMES.Success
    await host.getByRole("button", { name: "Retry", exact: true }).click()
    await expect(
      host.getByText("Reset card claimed. It has not been used.", {
        exact: true,
      }),
    ).toBeVisible()
    expect(writes).toHaveLength(4)

    // Generic selection never offers a PM-Plan target.
    await trigger(genericCode)
    await expect(host.getByRole("radio")).toHaveCount(1)
    await expect(
      host.getByText("Generic account", { exact: true }),
    ).toBeVisible()
    await expect(host.getByText("Plan A", { exact: true })).toHaveCount(0)
    await capture("generic-accounts")
    await host.getByRole("button", { name: "Cancel", exact: true }).click()

    await trigger(`${resetCode}\n${genericCode}`)
    await host.getByRole("button", { name: "Auto redeem", exact: true }).click()
    await expect(picker.getByRole("radio")).toHaveCount(1)
    await picker
      .getByRole("button", { name: "Confirm redemption", exact: true })
      .click()
    await expect(
      host.getByText("Generic account", { exact: true }),
    ).toBeVisible()
    await expect(host.getByRole("radio")).toHaveCount(1)
    await host.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(
      host.getByText("Reset card claimed. It has not been used.", {
        exact: true,
      }),
    ).toBeVisible()
    await expect(host.getByText("Cancelled", { exact: true })).toBeVisible()
    await capture("mixed-batch")

    await seedStoredAccounts(worker, [generic, disabled, unsupported])
    await trigger()
    await expect(
      host.getByText(/No enabled account matches this code type/),
    ).toBeVisible()
    await expect(host.getByRole("radio")).toHaveCount(0)
    await capture("no-compatible-account")
    expect(writes).toHaveLength(5)
    expect(
      writes.every((write) => write.path === "/api/reset-cards/redeem"),
    ).toBe(true)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
