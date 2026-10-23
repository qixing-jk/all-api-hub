import { browser } from "wxt/browser"

import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { createPersistedSiteAccount } from "~/services/accounts/editing/accountDefaults"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import { fetchWithHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { AuthTypeEnum, type SiteAccount } from "~/types"

const reportRoot = "http://localhost:41672/safari1669native"
const fixtureOrigin = "http://127.0.0.1:41672"
const ownedKey = "safari_native_cookie_acceptance_owned_accounts"
const app = "io.github.qixingjk.allapihub"
interface Fixture {
  baseUrl: string
  id: string
  cookie: string
  siteType: string
}
async function config(): Promise<{ accounts: Fixture[] }> {
  const response = await fetch(reportRoot + "/real-config", {
    credentials: "omit",
    headers: { "x-native-trial-token": import.meta.env.WXT_SAFARI_TRIAL_NONCE },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error("Owned fixture unavailable")
  return response.json()
}
const acceptanceEvent = async (data: Record<string, unknown>) => {
  await fetch(reportRoot + "/event", {
    method: "POST",
    credentials: "omit",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  })
}
async function classify(response: Response, accounts: Fixture[]) {
  let success = false
  let identity = "none"
  try {
    const body = await response.json()
    success = body.success === true
    const i = accounts.findIndex((a) => String(body.data?.id) === a.id)
    identity =
      i >= 0 ? ["A", "B", "C"][i]! : body.data?.id == null ? "none" : "other"
  } catch {
    /* No upstream bodies or error messages in evidence. */
  }
  return { status: response.status, success, identity }
}
/** Differential diagnostics in this run's profile; never changes privacy settings. */
export async function ordinaryContext() {
  const { accounts } = await config()
  const fixture = accounts[2]!
  const target = new URL("/api/user/self", fixture.baseUrl)
  const ordinary = await classify(
    await fetch(target, { credentials: "include" }),
    accounts,
  )
  const withUserHeaders = await classify(
    await fetch(target, {
      credentials: "include",
      headers: {
        "User-Id": fixture.id,
        "New-Api-User": fixture.id,
        "Veloera-User": fixture.id,
      },
    }),
    accounts,
  )
  const cookies = await browser.cookies.getAll({ url: target.href })
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
  let explicitBrowserCookie = { status: 0, success: false, identity: "none" }
  if (cookieHeader) {
    explicitBrowserCookie = await classify(
      await fetchWithHeaderOverrides(target, {}, undefined, {
        cookieSession: { origin: target.origin, cookieHeader },
      }),
      accounts,
    )
  }
  const fixtureResponse = await fetch(
    fixtureOrigin + "/safari1669native/echo",
    { credentials: "include" },
  )
  const fixtureBody = await fixtureResponse.json()
  await acceptanceEvent({
    stage: "ordinary-context",
    ordinaryStatus: ordinary.status,
    ordinarySuccess: ordinary.success,
    ordinaryIdentity: ordinary.identity,
    withUserHeadersStatus: withUserHeaders.status,
    withUserHeadersSuccess: withUserHeaders.success,
    withUserHeadersIdentity: withUserHeaders.identity,
    browserCookieCount: cookies.length,
    browserCookieHttpOnly: cookies.some((c) => c.httpOnly),
    browserCookieSecure: cookies.some((c) => c.secure),
    browserCookieSameSiteLax: cookies.some((c) => c.sameSite === "lax"),
    browserCookieSameSiteStrict: cookies.some((c) => c.sameSite === "strict"),
    browserCookieSameSiteNone: cookies.some(
      (c) => c.sameSite === "no_restriction",
    ),
    explicitBrowserCookieStatus: explicitBrowserCookie.status,
    explicitBrowserCookieSuccess: explicitBrowserCookie.success,
    explicitBrowserCookieIdentity: explicitBrowserCookie.identity,
    syntheticAmbientTabMatched: fixtureBody.identity === "fixture-TAB",
  })
}
export async function cookieGrantRecovery() {
  let correct = false
  try {
    const response = await fetchWithHeaderOverrides(
      fixtureOrigin + "/safari1669native/echo",
      {},
      undefined,
      {
        cookieSession: {
          origin: fixtureOrigin,
          cookieHeader: "session=fixture-B",
        },
      },
    )
    correct = (await response.json()).identity === "fixture-B"
  } catch {
    /* Fixed classification only. */
  }
  await acceptanceEvent({ stage: "cookie-grant-native-recovery", correct })
}
async function ownedIds(): Promise<string[]> {
  const value = (await browser.storage.local.get(ownedKey))[ownedKey]
  return Array.isArray(value) && value.every((id) => typeof id === "string")
    ? value
    : []
}
export async function seedProductAccounts() {
  if ((await ownedIds()).length)
    throw new Error("Owned accounts already seeded")
  const { accounts } = await config()
  const ids: string[] = []
  for (const [index, fixture] of accounts.slice(0, 2).entries()) {
    const account = createPersistedSiteAccount({
      account: {
        site_name: "Safari acceptance " + ["A", "B"][index],
        site_url: fixture.baseUrl,
        site_type: fixture.siteType,
        authType: AuthTypeEnum.Cookie,
        account_info: {
          id: fixture.id,
          username: "acceptance",
          access_token: "",
          quota: 0,
        },
        cookieAuth: { sessionCookie: fixture.cookie },
        disabled: false,
      } as unknown as Omit<
        SiteAccount,
        "id" | "created_at" | "updated_at" | "user_updated_at"
      >,
      id: "unused-fixture-id",
      now: Date.now(),
    })
    ids.push(await accountMutations.addAccount(account))
    await browser.storage.local.set({ [ownedKey]: ids })
  }
  await acceptanceEvent({ stage: "product-seeded", accounts: ids.length })
}
export async function observeProductAccounts() {
  const ids = await ownedIds()
  const { accounts } = await config()
  const snapshots = await Promise.all(
    ids.map(async (id, index) => {
      const account = await accountQueries.getAccountById(id)
      if (!account) return { present: false }
      const { request } = createAccountApiRequestFromStoredAccount(account)
      const self = await fetchApiResponse<{
        success: boolean
        data: { id: number; quota: number }
      }>(request, { endpoint: "/api/user/self" })
      return {
        present: true,
        account: ["A", "B"][index],
        health: account.health?.status,
        synced: Number(account.last_sync_time) > 0,
        identityCorrect:
          self.ok && String(self.body.data?.id) === accounts[index]!.id,
        quotaCorrect: account.account_info.quota === self.body.data?.quota,
      }
    }),
  )
  await acceptanceEvent({
    stage: "product-observed",
    context: location.pathname.endsWith("options.html")
      ? "options"
      : location.pathname.endsWith("popup.html")
        ? "popup"
        : "background",
    accounts: snapshots.length,
    allPresent: snapshots.length === 2 && snapshots.every((s) => s.present),
    allIdentitiesCorrect:
      snapshots.length === 2 && snapshots.every((s) => s.identityCorrect),
    allQuotasCorrect:
      snapshots.length === 2 && snapshots.every((s) => s.quotaCorrect),
    allSynced: snapshots.length === 2 && snapshots.every((s) => s.synced),
    accountAHealth: snapshots[0]?.health ?? "missing",
    accountBHealth: snapshots[1]?.health ?? "missing",
  })
}
export async function productServiceRefresh() {
  const ids = await ownedIds()
  await acceptanceEvent({
    stage: "product-service-start",
    accounts: ids.length,
  })
  for (const id of ids) {
    await accountRefresh.refreshAccount(id, true, {
      includeTodayCashflow: true,
    })
  }
  await observeProductAccounts()
}
export async function cleanupProductAccounts() {
  const ids = await ownedIds()
  for (const id of ids) {
    const account = await accountQueries.getAccountById(id)
    if (account && !account.site_name.startsWith("Safari acceptance "))
      throw new Error("Owned cleanup scope mismatch")
    if (account) await accountMutations.deleteAccount(id)
  }
  await browser.storage.local.remove(ownedKey)
  await acceptanceEvent({ stage: "product-cleanup", removed: ids.length })
}
/** Raw native protocol tests use synthetic credentials only, never real sites. */
export async function nativeAdmission() {
  if (
    !(await browser.permissions.contains({
      permissions: ["cookies", "nativeMessaging"],
      origins: ["http://127.0.0.1/*"],
    }))
  )
    throw new Error("Fixture permission missing")
  await browser.cookies.remove({
    url: fixtureOrigin,
    name: "__aah_admission_" + crypto.randomUUID(),
  })
  let preCancelled = 0
  let lateRejected = 0
  for (let i = 0; i < 16; i++) {
    const id = crypto.randomUUID()
    await browser.runtime.sendNativeMessage(app, {
      version: 3,
      command: "cancel",
      id,
    })
    const response = await browser.runtime.sendNativeMessage(app, {
      version: 3,
      command: "request",
      id,
      deadline: Date.now() + 20000,
      url: fixtureOrigin + "/safari1669native/echo",
      origin: fixtureOrigin,
      method: "GET",
      headers: {
        cookie: "session=fixture-A",
        origin: fixtureOrigin,
        "x-fixture-source": "A",
      },
      body: null,
    })
    if (response?.ok === false && response.code === "admission-rejected")
      preCancelled++
    const late = await browser.runtime.sendNativeMessage(app, {
      version: 3,
      command: "request",
      id: crypto.randomUUID(),
      deadline: Date.now() - 1,
      url: fixtureOrigin + "/safari1669native/echo",
      origin: fixtureOrigin,
      method: "GET",
      headers: { cookie: "session=fixture-A", origin: fixtureOrigin },
      body: null,
    })
    if (late?.ok === false) lateRejected++
  }
  await acceptanceEvent({
    stage: "native-admission",
    attempted: 16,
    preCancelled,
    lateRejected,
  })
  await cookieGrantRecovery()
}
