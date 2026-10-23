import { browser } from "wxt/browser"

import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { createPersistedSiteAccount } from "~/services/accounts/editing/accountDefaults"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import { fetchWithHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { AuthTypeEnum, type SiteAccount } from "~/types"

import {
  cleanupProductAccounts,
  cookieGrantRecovery,
  nativeAdmission,
  observeProductAccounts,
  ordinaryContext,
  productServiceRefresh,
  seedProductAccounts,
} from "./acceptance"

const root = "http://127.0.0.1:41672/safari1669native"
const origin = "http://127.0.0.1:41672"
const reportRoot = "http://localhost:41672/safari1669native"
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
let claimed = false
let baselineSettled = false
let permissionRemovals = 0
browser.permissions.onRemoved.addListener(() => {
  permissionRemovals++
})
const event = async (d: Record<string, unknown>) =>
  fetch(reportRoot + "/event", {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  }).catch(() => {})
const native = async (
  account: string,
  path = "/echo",
  signal?: AbortSignal,
) => {
  const response = await fetchWithHeaderOverrides(
    root + path,
    { signal, headers: { "x-fixture-source": account } },
    undefined,
    { cookieSession: { origin, cookieHeader: "session=fixture-" + account } },
  )
  return response
}

function mountCookieGrant() {
  if (
    !location.pathname.endsWith("/options.html") ||
    !location.search.includes("nativeCookieTrial=1")
  )
    return
  const button = document.createElement("button")
  button.id = "native-cookie-grant"
  button.textContent = "Grant optional Cookie permission for validation"
  button.style.cssText =
    "position:fixed;right:16px;top:12px;z-index:2147483647;background:#fff;color:#111;padding:12px;border:2px solid #555"
  button.onclick = async () => {
    try {
      const granted = await browser.permissions.request({
        permissions: ["cookies"],
      })
      await event({ stage: "cookie-probe-grant", granted })
      if (granted) await cookieGrantRecovery()
      button.textContent = granted
        ? "Cookie validation permission granted"
        : "Cookie validation permission not granted"
    } catch {
      await event({ stage: "cookie-probe-grant", granted: false })
    }
  }
  document.body.append(button)
  const revoke = document.createElement("button")
  revoke.textContent = "Revoke optional Cookie permission for validation"
  revoke.style.cssText = button.style.cssText + ";top:68px"
  revoke.onclick = async () => {
    const removed = await browser.permissions.remove({
      permissions: ["cookies"],
    })
    let blocked = false
    try {
      await native("A")
    } catch {
      blocked = true
    }
    await event({
      stage: "cookie-probe-revoke",
      removed,
      blocked,
      cookieGranted: await browser.permissions.contains({
        permissions: ["cookies"],
      }),
    })
  }
  document.body.append(revoke)
}
mountCookieGrant()

if (
  !location.pathname.endsWith("/options.html") &&
  !location.pathname.endsWith("/popup.html")
) {
  browser.runtime.onMessage.addListener((message) => {
    if (message?.action !== "safariNativeCookieAcceptanceBackground") return
    return (async () => {
      await productServiceRefresh()
      await event({
        stage: "product-background-complete",
        nativeContext: location.protocol === "safari-web-extension:",
      })
      return { ok: true }
    })()
  })
}

async function observeUrlPermission() {
  const cookieGranted = await browser.permissions.contains({
    permissions: ["cookies"],
  })
  const patternGranted = await browser.permissions.contains({
    origins: ["http://127.0.0.1/*"],
  })
  const available = typeof browser.cookies?.get === "function"
  let cookieLookupAllowed = false
  let cookieRemoveAllowed = false
  const removeAvailable = typeof browser.cookies?.remove === "function"
  if (available && cookieGranted) {
    try {
      // Only a random nonexistent name. Never read or record a login cookie.
      await browser.cookies.get({
        url: root + "/echo",
        name: "__aah_access_probe_" + crypto.randomUUID(),
      })
      cookieLookupAllowed = true
    } catch {
      /* Classify permission failure without retaining the message. */
    }
  }
  if (removeAvailable && cookieGranted) {
    try {
      // Own loopback fixture only, random reserved name; no account cookies.
      await browser.cookies.remove({
        url: root + "/echo",
        name: "__aah_access_probe_" + crypto.randomUUID(),
      })
      cookieRemoveAllowed = true
    } catch {
      /* This may expose a different URL-permission check than get. */
    }
  }
  await event({
    stage: "permission-url-check",
    cookieGranted,
    patternGranted,
    available,
    cookieLookupAllowed,
    removeAvailable,
    cookieRemoveAllowed,
    permissionRemovals,
  })
}

async function observeOrdinaryRealRequest() {
  const response = await fetch(reportRoot + "/real-config", {
    credentials: "omit",
    headers: { "x-native-trial-token": import.meta.env.WXT_SAFARI_TRIAL_NONCE },
  })
  if (!response.ok) throw new Error("real fixture unavailable")
  const config = await response.json()
  const fixture = config.accounts[2]
  if (!fixture) throw new Error("normal fixture unavailable")
  const normal = await fetchWithHeaderOverrides(
    fixture.baseUrl + "/api/user/self",
    { credentials: "include" },
  )
  let json = false
  let success = false
  let identityKind = "none"
  try {
    const body = await normal.json()
    json = true
    success = body.success === true
    const index = config.accounts.findIndex(
      (account: { id: string }) => String(body.data?.id) === account.id,
    )
    identityKind =
      index >= 0
        ? ["A", "B", "C"][index]!
        : body.data?.id == null
          ? "none"
          : "other"
  } catch {
    /* Never retain an upstream body or error text. */
  }
  await event({
    stage: "real-ordinary-result",
    status: normal.status,
    json,
    success,
    identityKind,
  })
}
async function run() {
  if (
    !location.pathname.endsWith("/options.html") ||
    !location.search.includes("nativeCookieTrial=1")
  ) {
    if (
      !location.pathname.endsWith("/options.html") &&
      !location.pathname.endsWith("/popup.html")
    ) {
      // A resumed background must not steal focus from the native popup or
      // create another controller during a Safari restart. This is fixture
      // bookkeeping in the independent trial extension, not product state.
      const key = "safari_native_cookie_trial_bootstrap"
      const nonce = import.meta.env.WXT_SAFARI_TRIAL_NONCE || "synthetic"
      if ((await browser.storage.local.get(key))[key] !== nonce) {
        await browser.storage.local.set({ [key]: nonce })
        await browser.tabs.create({
          url: browser.runtime.getURL("/options.html?nativeCookieTrial=1"),
        })
        await event({ stage: "harness-background-bootstrap" })
      }
    }
    return
  }
  const claim = await fetch(
    reportRoot + "/claim?owner=" + crypto.randomUUID(),
    {
      credentials: "omit",
      headers: {
        "x-native-trial-token": import.meta.env.WXT_SAFARI_TRIAL_NONCE,
      },
    },
  )
  claimed = claim.ok && (await claim.json()).accepted
  if (!claimed) return
  if (!(await browser.permissions.contains({ permissions: ["cookies"] }))) {
    await event({ stage: "trial-awaiting-cookie-permission" })
    const until = Date.now() + 180000
    while (
      !(await browser.permissions.contains({ permissions: ["cookies"] }))
    ) {
      if (Date.now() > until)
        throw new Error("Trial Cookie permission not granted")
      await delay(350)
    }
  }
  await event({
    stage: "trial-start",
    protocol: 3,
    nativeContext: location.protocol === "safari-web-extension:",
    optionalCookies: await browser.permissions.contains({
      permissions: ["cookies"],
    }),
    optionalDnr: await browser.permissions.contains({
      permissions: ["declarativeNetRequestWithHostAccess"],
    }),
  })
  await event({
    stage: "trial-capabilities",
    uuid: typeof crypto.randomUUID === "function",
    permissionEvent: !!browser.permissions.onRemoved,
    nativeMessaging: await browser.permissions.contains({
      permissions: ["nativeMessaging"],
    }),
    hostGrant: await browser.permissions.contains({
      origins: ["http://127.0.0.1/*"],
    }),
  })
  await browser.tabs.create({
    url: root + "/browser",
    active: false,
  })
  await delay(800)
  const before = await (
    await fetch(reportRoot + "/status", { credentials: "omit" })
  ).json()
  const replies = await Promise.all(
    Array.from({ length: 20 }, async (_, i) =>
      (await native(i % 2 ? "B" : "A")).json(),
    ),
  )
  await delay(300)
  const state = await (
    await fetch(reportRoot + "/status", { credentials: "omit" })
  ).json()
  const checks = state.requests
    .slice(before.requests.length)
    .filter((r: any) => r.source === "tab")
  await event({
    stage: "trial-concurrency",
    requests: replies.length,
    accountCorrect: replies.every(
      (r: any, i) => r.identity === "fixture-" + (i % 2 ? "B" : "A"),
    ),
    cookieAndOriginApplied: replies.every(
      (r: any) => r.onlyFixtureCookie && r.originKind === "fixture",
    ),
    normalIsolated:
      checks.length > 0 &&
      checks.every((r: any) => r.identity === "fixture-TAB"),
    normalChecks: checks.length,
  })
  const setCookie = await native("A", "/set-cookie")
  const next = await (await native("B")).json()
  await delay(200)
  const after = await (
    await fetch(reportRoot + "/status", { credentials: "omit" })
  ).json()
  await event({
    stage: "trial-set-cookie",
    responseSucceeded: setCookie.ok,
    setCookieHidden: !setCookie.headers.has("set-cookie"),
    nextAccountCorrect: next.identity === "fixture-B",
    normalCookieUnchanged: after.requests
      .filter((r: any) => r.source === "tab")
      .every((r: any) => r.identity === "fixture-TAB"),
  })
  let redirectRejected = false
  try {
    await native("A", "/redirect")
  } catch {
    redirectRejected = true
  }
  const redirectState = await (
    await fetch(reportRoot + "/status", { credentials: "omit" })
  ).json()
  await event({
    stage: "trial-redirect",
    rejected: redirectRejected,
    targetNotRequested: !redirectState.requests.some(
      (r: any) => r.endpoint === "/redirect-target",
    ),
  })
  const abort = new AbortController()
  const hold = native("A", "/hold", abort.signal).then(
    () => false,
    (e) => e.name === "AbortError",
  )
  setTimeout(() => abort.abort(), 120)
  const cancelled = await hold
  const nextCancel = await (await native("B")).json()
  const cancelState = await (
    await fetch(reportRoot + "/status", { credentials: "omit" })
  ).json()
  await event({
    stage: "trial-cancel",
    cancelled,
    nextAccountCorrect: nextCancel.identity === "fixture-B",
    nativeCancelled: cancelState.events
      .slice(redirectState.events.length)
      .some((r: any) => r.stage === "hold-close" && r.beforeResponse),
  })
  let largeRejected = false
  try {
    await native("A", "/large")
  } catch {
    largeRejected = true
  }
  let scopeRejected = false
  try {
    await fetchWithHeaderOverrides("http://example.com/", {}, undefined, {
      cookieSession: {
        origin: "http://example.com",
        cookieHeader: "session=fixture-A",
      },
    })
  } catch {
    scopeRejected = true
  }
  await event({ stage: "trial-boundaries", largeRejected, scopeRejected })
  // Exercise the ordinary Safari browser-fetch branch with this same bundle.
  const ordinary = await fetchWithHeaderOverrides(root + "/echo", {
    credentials: "omit",
  })
  await event({
    stage: "trial-ordinary",
    succeeded: ordinary.ok,
    ambientExcluded: (await ordinary.json()).identity === "none",
  })
  await event({ stage: "trial-complete" })
}
void run()
  .finally(() => {
    baselineSettled = true
  })
  .catch(
    (e) =>
      void event({
        stage: "trial-error",
        errorName: ["TypeError", "Error", "ApiError", "SyntaxError"].includes(
          e.name,
        )
          ? e.name
          : "other",
        reason: [
          "COOKIE_PERMISSION_REQUIRED",
          "COOKIE_REQUEST_UNAVAILABLE",
        ].includes(e.code)
          ? e.code
          : "other",
      }),
  )

async function observePermissions(mode: string) {
  const tab = (await browser.tabs.query({})).find((t) =>
    t.url?.startsWith(root + "/browser"),
  )
  let injected = false
  let injectionAvailable = false
  const tabs = browser.tabs as unknown as {
    executeScript?: (
      id: number,
      details: { code: string },
    ) => Promise<unknown[]>
  }
  if (tab?.id && typeof tabs.executeScript === "function") {
    injectionAvailable = true
    try {
      const result = await tabs.executeScript(tab.id, {
        code: "location.origin",
      })
      injected = result[0] === origin
    } catch {
      // The unavailable capability remains a false observation.
    }
  }
  let contentReceiver = false
  if (tab?.id) {
    try {
      const reply = await browser.tabs.sendMessage(tab.id, {
        action: "getRenderedTitle",
      })
      contentReceiver = reply?.success === true
    } catch {
      // The unavailable capability remains a false observation.
    }
  }
  const hostGrant = await browser.permissions.contains({
    origins: ["http://127.0.0.1/*"],
  })
  let nativeSucceeded = false
  try {
    nativeSucceeded =
      (await (await native("A")).json()).identity === "fixture-A"
  } catch {
    // The unavailable capability remains a false observation.
  }
  await event({
    stage: "permission-observation",
    mode,
    hostGrant,
    injectionAvailable,
    injected,
    contentReceiver,
    nativeSucceeded,
  })
}

async function savedAccounts() {
  const ids: string[] = []
  try {
    for (const identity of ["A", "B"]) {
      const account = createPersistedSiteAccount({
        account: {
          site_name: "Safari native fixture " + identity,
          site_url: root,
          site_type: "new-api",
          authType: AuthTypeEnum.Cookie,
          account_info: {
            id: identity === "A" ? "101" : "102",
            username: "fixture-" + identity,
            access_token: "",
          },
          cookieAuth: { sessionCookie: "session=fixture-" + identity },
          disabled: true,
        } as unknown as Omit<
          SiteAccount,
          "id" | "created_at" | "updated_at" | "user_updated_at"
        >,
        id: "unused-fixture-id",
        now: Date.now(),
      })
      ids.push(await accountMutations.addAccount(account))
    }
    const accounts = await Promise.all(
      ids.map((id) => accountQueries.getAccountById(id)),
    )
    const result = await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const account = accounts[i % 2]
        if (!account) throw new Error("missing saved fixture")
        const { request } = createAccountApiRequestFromStoredAccount(account)
        const response = await fetchApiResponse<{ identity: string }>(request, {
          endpoint: "/echo",
          options: { headers: { "x-fixture-source": i % 2 ? "B" : "A" } },
        })
        return (
          response.ok &&
          response.body.identity === (i % 2 ? "fixture-B" : "fixture-A")
        )
      }),
    )
    await event({
      stage: "saved-account-transport",
      storageRoundTrip: accounts.every(Boolean),
      isolated: result.every(Boolean),
      requests: result.length,
    })
  } finally {
    for (const id of ids) await accountMutations.deleteAccount(id)
  }
}

async function realSiteAccounts() {
  const configResponse = await fetch(reportRoot + "/real-config", {
    credentials: "omit",
    headers: {
      "x-native-trial-token": import.meta.env.WXT_SAFARI_TRIAL_NONCE,
    },
  })
  if (!configResponse.ok) throw new Error("real fixture unavailable")
  const config = (await configResponse.json()) as {
    accounts: {
      id: string
      cookie: string
      baseUrl: string
      siteType: string
    }[]
  }
  const origins = config.accounts.map((a) => new URL(a.baseUrl).origin)
  const granted = (
    await Promise.all(
      origins.map((origin) =>
        browser.permissions.contains({ origins: [origin + "/*"] }),
      ),
    )
  ).every(Boolean)
  await event({
    stage: "real-site-start",
    nativeContext: location.protocol === "safari-web-extension:",
    https: origins.every((origin) => origin.startsWith("https:")),
    sameOrigin: origins[0] === origins[1],
    distinctIdentities:
      origins[0] !== origins[1] ||
      config.accounts[0]!.id !== config.accounts[1]!.id,
    hostGrant: granted,
  })
  if (!granted) return
  const ids: string[] = []
  try {
    for (const [i, fixture] of config.accounts.entries()) {
      const account = createPersistedSiteAccount({
        account: {
          site_name: "Safari real-site trial " + i,
          site_url: fixture.baseUrl,
          site_type: fixture.siteType,
          authType: AuthTypeEnum.Cookie,
          account_info: {
            id: fixture.id,
            username: "native-trial",
            access_token: "",
          },
          cookieAuth: { sessionCookie: fixture.cookie },
          disabled: true,
        } as unknown as Omit<
          SiteAccount,
          "id" | "created_at" | "updated_at" | "user_updated_at"
        >,
        id: "unused-fixture-id",
        now: Date.now(),
      })
      ids.push(await accountMutations.addAccount(account))
    }
    const stored = await Promise.all(
      ids.map((id) => accountQueries.getAccountById(id)),
    )
    const replies = await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const index = i % 2
        const account = stored[index]!
        if (!account) throw new Error("missing real fixture")
        const { request } = createAccountApiRequestFromStoredAccount(account)
        const response = await fetchApiResponse<{
          success: boolean
          data: { id: number }
        }>(request, {
          endpoint: "/api/user/self",
        })
        return (
          response.ok &&
          response.body.success &&
          String(response.body.data?.id) === config.accounts[index]!.id
        )
      }),
    )
    let ambientBrowserCorrect: boolean | null = null
    if (config.accounts.length === 3) {
      const normal = await fetchWithHeaderOverrides(
        config.accounts[2]!.baseUrl + "/api/user/self",
        { credentials: "include" },
      )
      const body = await normal.json()
      ambientBrowserCorrect =
        normal.ok &&
        body.success &&
        String(body.data?.id) === config.accounts[2]!.id
    }
    await event({
      stage: "real-site-result",
      ...(ambientBrowserCorrect === null ? {} : { ambientBrowserCorrect }),
      requests: replies.length,
      allIdentitiesCorrect: replies.every(Boolean),
      storageRoundTrip: stored.every(Boolean),
    })
  } finally {
    for (const id of ids) await accountMutations.deleteAccount(id)
    await event({ stage: "real-site-cleanup", ownAccountsRemoved: true })
  }
}

async function controlLoop() {
  let last = "run"
  while (true) {
    await delay(350)
    if (!claimed || !baselineSettled) continue
    let command: string
    try {
      command = (
        await (
          await fetch(reportRoot + "/control", { credentials: "omit" })
        ).json()
      ).command
    } catch {
      continue
    }
    if (command === last) continue
    last = command
    try {
      if (command.startsWith("permissions-")) await observePermissions(command)
      if (command === "permission-url-check") await observeUrlPermission()
      if (command === "real-ordinary") await observeOrdinaryRealRequest()
      if (command === "ordinary-context") await ordinaryContext()
      if (command === "product-seed") await seedProductAccounts()
      if (command === "product-observe") await observeProductAccounts()
      if (command === "product-service") await productServiceRefresh()
      if (command === "product-background") {
        const reply = await browser.runtime.sendMessage({
          action: "safariNativeCookieAcceptanceBackground",
        })
        await event({
          stage: "product-background-reply",
          ok: reply?.ok === true,
        })
      }
      if (command === "product-cleanup") await cleanupProductAccounts()
      if (command === "native-admission") await nativeAdmission()
      if (command === "real-site") await realSiteAccounts()
      if (command === "saved-accounts") await savedAccounts()
      if (command === "timeout") {
        const started = performance.now()
        let failed = false
        try {
          await native("A", "/stall")
        } catch {
          failed = true
        }
        const next = await (await native("B")).json()
        await event({
          stage: "native-timeout",
          failed,
          elapsedMs: Math.round(performance.now() - started),
          nextAccountCorrect: next.identity === "fixture-B",
        })
      }
      if (command === "revoke-in-flight") {
        await event({ stage: "native-revoke-start" })
        let rejected = false
        let permissionRevoked = false
        try {
          await native("A", "/stall")
        } catch (error) {
          rejected = true
          permissionRevoked =
            error instanceof Error &&
            "code" in error &&
            error.code === "COOKIE_PERMISSION_REQUIRED"
        }
        await event({
          stage: "native-revoke-result",
          rejected,
          permissionRevoked,
        })
      }
      if (command === "hold-for-crash") {
        await event({ stage: "native-crash-start" })
        let failed = false
        try {
          await native("A", "/stall")
        } catch {
          failed = true
        }
        await event({ stage: "native-crash-result", failed })
      }
      if (command === "after-crash") {
        const next = await (await native("B")).json()
        await event({
          stage: "native-crash-recovery",
          nextAccountCorrect: next.identity === "fixture-B",
        })
      }
    } catch {
      await event({ stage: "formal-probe-error" })
    }
  }
}
if (
  location.pathname.endsWith("/options.html") &&
  location.search.includes("nativeCookieTrial=1")
)
  void controlLoop()
