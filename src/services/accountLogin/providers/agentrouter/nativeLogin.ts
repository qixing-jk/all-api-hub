import { TURNSTILE_MANUAL_WAIT_MS } from "~/constants/turnstile"
import type { NativeLoginObservation } from "~/services/accountLogin/browserPassword"
import type { AccountLoginResult } from "~/services/apiAdapters/contracts/accountLogin"
import { ALIYUN_WAF_CHALLENGE_SELECTOR } from "~/services/protectionBypass/aliyunWaf"
import { executeMainWorldFunction } from "~/utils/browser/scripting"

import { isAgentRouterLoginUrl } from "./config"

/**
 * Self-contained page-world observer. It watches one native POST, never issues
 * a request, and exports only the server's identity/check-in projection.
 */
function nativeLoginPageObservation(
  action: "arm" | "read" | "dispose",
  key: string,
  origin: string,
  timeoutMs: number,
  challengeSelector: string,
) {
  if (location.origin !== origin) return null
  type State = { result: Promise<AccountLoginResult | null>; dispose(): void }
  const page = window as unknown as Record<string, State | undefined>
  if (action === "read") return page[key]?.result ?? null
  if (action === "dispose") {
    page[key]?.dispose()
    delete page[key]
    return null
  }
  if (page[key]) return null
  let resolve!: (result: AccountLoginResult | null) => void
  const result = new Promise<AccountLoginResult | null>((done) => {
    resolve = done
  })
  const originalFetch = window.fetch
  const originalOpen = XMLHttpRequest.prototype.open
  const xhrTerminalEvents = ["load", "error", "abort", "timeout"] as const
  const xhrListeners = new Map<XMLHttpRequest, EventListener>()
  let settled = false
  let selected = false
  const finish = (value: AccountLoginResult | null) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    if (window.fetch === observedFetch) window.fetch = originalFetch
    if (XMLHttpRequest.prototype.open === observedOpen)
      XMLHttpRequest.prototype.open = originalOpen
    for (const [xhr, listener] of xhrListeners)
      for (const event of xhrTerminalEvents)
        xhr.removeEventListener(event, listener)
    xhrListeners.clear()
    window.removeEventListener("pagehide", onPageHide)
    resolve(value)
  }
  const onPageHide = () => finish(null)
  const matches = (url: string | URL) => {
    try {
      const parsed = new URL(url, location.href)
      return parsed.origin === origin && parsed.pathname === "/api/user/login"
    } catch {
      return false
    }
  }
  const project = (payload: any): AccountLoginResult | null => {
    if (payload?.success !== true || payload.data?.require_2fa === true)
      return null
    const identity = String(payload.data?.id ?? "")
    if (!/^[1-9]\d*$/.test(identity)) return null
    return {
      status: "authenticated",
      identity,
      evidence:
        typeof payload.data.checked_in === "boolean"
          ? { checkedIn: payload.data.checked_in }
          : {},
    }
  }
  const projectText = (
    text: string,
    ok: boolean,
  ): AccountLoginResult | null => {
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      const document = new DOMParser().parseFromString(text, "text/html")
      return document.querySelector(challengeSelector)
        ? { status: "uncertain", reason: "verification_required" }
        : null
    }
    return ok ? project(payload) : null
  }
  const observedFetch: typeof fetch = async function (this: unknown, ...args) {
    const [input, init] = args
    const request = input instanceof Request ? input : null
    const selectedRequest =
      !selected &&
      (init?.method ?? request?.method ?? "GET").toUpperCase() === "POST" &&
      matches(request?.url ?? String(input))
    if (selectedRequest) selected = true
    try {
      const response = await Reflect.apply(originalFetch, this, args)
      if (selectedRequest) {
        let value: AccountLoginResult | null = null
        try {
          if (matches(response.url))
            value = projectText(await response.clone().text(), response.ok)
        } catch {
          /* Keep the native response untouched on HTML/malformed JSON. */
        }
        finish(value)
      }
      return response
    } catch (error) {
      if (selectedRequest) finish(null)
      throw error
    }
  }
  const observedOpen: typeof XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null,
  ) {
    originalOpen.call(this, method, url, async, username, password)
    if (selected || method.toUpperCase() !== "POST" || !matches(url)) return
    selected = true
    const listener = () => {
      let value: AccountLoginResult | null = null
      try {
        if (matches(this.responseURL)) {
          const ok = this.status >= 200 && this.status < 300
          value =
            this.responseType === "json"
              ? ok
                ? project(this.response)
                : null
              : projectText(this.responseText, ok)
        }
      } catch {
        /* A WAF document is not login evidence. */
      }
      finish(value)
    }
    xhrListeners.set(this, listener)
    for (const event of xhrTerminalEvents)
      this.addEventListener(event, listener, { once: true })
  }
  page[key] = { result, dispose: () => finish(null) }
  window.fetch = observedFetch
  XMLHttpRequest.prototype.open = observedOpen
  window.addEventListener("pagehide", onPageHide, { once: true })
  const timer = setTimeout(() => finish(null), timeoutMs)
  return true
}

/** Arm before clicking; collect before a full-page navigation can discard the document. */
export async function observeAgentRouterNativeLogin(
  tabId: number,
  origin: string,
  requestId: string,
): Promise<NativeLoginObservation | null> {
  if (!isAgentRouterLoginUrl(origin) || !requestId) return null
  const key = `__allApiHubNativeLogin:${requestId}`
  const invoke = async (action: "arm" | "read" | "dispose") =>
    await executeMainWorldFunction(tabId, nativeLoginPageObservation, [
      action,
      key,
      origin,
      3 * TURNSTILE_MANUAL_WAIT_MS,
      ALIYUN_WAF_CHALLENGE_SELECTOR,
    ])
  if ((await invoke("arm")) !== true) return null
  return {
    result: invoke("read").then((result) =>
      typeof result === "object" ? result : null,
    ),
    async dispose() {
      await invoke("dispose")
    },
  }
}
