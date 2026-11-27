import assert from "node:assert/strict"
import { expect } from "@playwright/test"

/** Read the native page's fresh server identity and check-in state without clicking. */
export async function readNewApiNativeCheckin(page, expectedUserId) {
  const origin = new URL(page.url()).origin
  const identity = page.waitForResponse(
    (response) =>
      response.url().startsWith(origin + "/api/user/auth/refresh") &&
      response.request().method() === "POST",
  )
  const checkin = page.waitForResponse(
    (response) =>
      new URL(response.url()).origin === origin &&
      new URL(response.url()).pathname === "/api/user/checkin" &&
      response.request().method() === "GET",
  )
  await page.reload({ waitUntil: "domcontentloaded" })
  const [identityResponse, checkinResponse] = await Promise.all([
    identity,
    checkin,
  ])
  const identityBody = await identityResponse.json()
  assert.equal(identityBody.success, true, "Native identity refresh failed")
  assert.equal(
    String(identityBody.data?.user?.id),
    String(expectedUserId),
    "Native login differs from the target account",
  )
  const body = await checkinResponse.json()
  assert.equal(body.success, true, "Native check-in readback failed")
  assert.equal(body.data?.enabled, true, "Native check-in is disabled")
  return body.data.stats
}

/**
 * Execute one eligible check-in through the ordinary account menu. Observe all
 * same-origin pages, count proof submissions, and independently reload the
 * native console. Callers own login, onboarding, evidence and resource cleanup.
 * This flow targets modern official New API; fork/legacy contracts need their
 * own native identity reader. Never repeat it after a lost mutation response.
 */
export async function runNewApiNativeCheckin({
  optionsPage,
  accountRow,
  nativePage,
  expectedUserId,
  timeoutMs = 120_000,
}) {
  const before = await readNewApiNativeCheckin(nativePage, expectedUserId)
  if (before?.checked_in_today === true)
    return { skipped: true, reason: "Account already checked in today", before }
  assert.equal(before?.checked_in_today, false, "Eligibility is unconfirmed")
  const origin = new URL(nativePage.url()).origin
  const submissions = []
  const identityReads = []
  const pending = []
  const requests = new Map()
  const watched = new Set()
  const observedResponses = new Set()
  const observeRequest = (request) => {
    const url = new URL(request.url())
    if (
      url.origin !== origin ||
      url.pathname !== "/api/user/checkin" ||
      request.method() !== "POST" ||
      requests.has(request)
    )
      return
    const entry = { hasProof: Boolean(url.searchParams.get("turnstile")) }
    requests.set(request, entry)
    submissions.push(entry)
  }
  const observe = (response) => {
    if (observedResponses.has(response)) return
    observedResponses.add(response)
    const url = new URL(response.url())
    if (url.origin !== origin) return
    if (url.pathname === "/api/user/auth/refresh") {
      pending.push(
        response.json().then((body) => {
          identityReads.push({
            status: response.status(),
            userId: body.success ? String(body.data?.user?.id) : null,
          })
        }),
      )
    }
    if (
      url.pathname !== "/api/user/checkin" ||
      response.request().method() !== "POST"
    )
      return
    observeRequest(response.request())
    const entry = requests.get(response.request())
    entry.status = response.status()
    pending.push(
      response.json().then((body) => {
        entry.success = body.success === true
      }),
    )
  }
  const context = optionsPage.context()
  const watch = (page) => {
    if (watched.has(page)) return
    watched.add(page)
    page.on("request", observeRequest)
    page.on("response", observe)
  }
  context.pages().forEach(watch)
  context.on("page", watch)
  context.on("request", observeRequest)
  context.on("response", observe)
  try {
    await optionsPage.bringToFront()
    await accountRow.hover()
    await accountRow
      .getByTestId("account-management-row-more-actions-button")
      .click()
    await optionsPage
      .getByTestId("account-management-row-quick-checkin-menu-item")
      .click()
    await expect(
      accountRow.getByTestId("account-management-site-check-in-status-button"),
    ).toHaveAttribute("aria-label", /Checked in|已签到/u, {
      timeout: timeoutMs,
    })
    const after = await readNewApiNativeCheckin(nativePage, expectedUserId)
    await Promise.all(pending)
    assert.equal(
      after?.checked_in_today,
      true,
      "Native console did not confirm the grant",
    )
    assert.equal(
      submissions.filter((entry) => entry.hasProof).length,
      1,
      "Expected one proof-bearing submission",
    )
    // Temporary-page teardown may lose its response event after the grant.
    // The independent native records establish the accepted mutation.
    assert.equal(
      after.records.length - before.records.length,
      1,
      "Expected one new native check-in record",
    )
    return { before, after, submissions, identityReads }
  } finally {
    context.off("response", observe)
    context.off("request", observeRequest)
    context.off("page", watch)
    for (const page of watched) {
      page.off("request", observeRequest)
      page.off("response", observe)
    }
    await Promise.allSettled(pending)
  }
}
