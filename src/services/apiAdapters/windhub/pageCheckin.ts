import { SITE_TYPES } from "~/constants/siteType"
import { WINDHUB_ORIGIN } from "~/constants/windhub"
import { verifyAccountBrowserIdentity } from "~/services/accountBrowserSession/identityVerification"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { buildCompatUserIdHeaders } from "~/services/apiTransport/compatHeaders"
import { isRecord } from "~/utils/core/object"

export type WindhubPageResult =
  | { kind: "status"; enabled: boolean; checked: boolean }
  | { kind: "checked" | "already" }
  | { kind: "unconfirmed" | "unavailable" | "identity_mismatch" }

type WindhubPageRequest = {
  mode?: "status" | "execute"
  expectedUserId?: unknown
}

/** A strict page-context read; the endpoint is never used for mutation here. */
async function readStatus(userId: string): Promise<{
  enabled: boolean
  checked: boolean
} | null> {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const response = await fetch(
    `${WINDHUB_ORIGIN}/api/user/checkin?month=${month}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: buildCompatUserIdHeaders(userId),
    },
  )
  if (!response.ok || response.redirected) return null
  const body: unknown = await response.json()
  if (!isRecord(body) || body.success !== true || !isRecord(body.data))
    return null
  const stats = body.data.stats
  return typeof body.data.enabled === "boolean" &&
    isRecord(stats) &&
    typeof stats.checked_in_today === "boolean"
    ? { enabled: body.data.enabled, checked: stats.checked_in_today }
    : null
}

/** Only the account's verified page may click the unique free check-in control. */
export async function runWindhubPageCheckin(
  request: WindhubPageRequest,
): Promise<WindhubPageResult> {
  if (
    location.origin !== WINDHUB_ORIGIN ||
    location.pathname !== "/console/personal"
  )
    return { kind: "unavailable" }
  const expected = normalizeAccountIdentity(request.expectedUserId)
  if (!expected) return { kind: "identity_mismatch" }
  const actual = await verifyAccountBrowserIdentity({
    siteType: SITE_TYPES.WINDHUB,
    url: WINDHUB_ORIGIN,
    candidateUserIds: [expected],
  })
  if (actual !== expected) return { kind: "identity_mismatch" }
  let clicked = false
  try {
    const status = await readStatus(expected)
    if (!status) return { kind: "unavailable" }
    if (request.mode !== "execute") return { kind: "status", ...status }
    if (status.checked) return { kind: "already" }
    if (!status.enabled) return { kind: "unavailable" }
    let buttons: HTMLButtonElement[] = []
    for (let attempt = 0; attempt < 10; attempt++) {
      buttons = [...document.querySelectorAll("button")].filter(
        (button) =>
          !button.disabled && button.textContent?.trim() === "立即签到",
      )
      if (buttons.length > 0) break
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    if (buttons.length !== 1) return { kind: "unavailable" }
    const beforeClick = await readStatus(expected)
    if (beforeClick?.checked) return { kind: "already" }
    if (!beforeClick?.enabled) return { kind: "unavailable" }
    // The site owns its mutation request. Never submit a second click when
    // readback is delayed or unavailable.
    buttons[0]?.click()
    clicked = true
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1_000))
      const after = await readStatus(expected)
      if (after?.checked) return { kind: "checked" }
    }
    return { kind: "unconfirmed" }
  } catch {
    return { kind: clicked ? "unconfirmed" : "unavailable" }
  }
}

/** Bridges the page protocol into the content-script message listener. */
export function handleWindhubCheckin(
  request: WindhubPageRequest,
  sendResponse: (response: WindhubPageResult) => void,
): true {
  void runWindhubPageCheckin(request).then(sendResponse)
  return true
}
