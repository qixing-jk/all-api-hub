import {
  API_OPERATION_SEMANTICS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { assertSiteTabOrigin } from "~/services/browsingContext/siteTabRecovery"
import { onRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { executeIsolatedFunction } from "~/utils/browser/scripting"
import {
  createTab,
  onTabRemoved,
  removeTab,
  updateTab,
} from "~/utils/browser/tabs"
import { sleep } from "~/utils/core/async"
import { isRecord } from "~/utils/core/object"

import {
  NEW_API_TOKEN_OAUTH_CALLBACK,
  NEW_API_TOKEN_OAUTH_MARKER,
  type NewApiTokenOAuthMarker,
} from "./callback"
import type { NewApiTokenInteraction, NewApiTokenProof } from "./creation"
import {
  buildTokenVerificationAuthorizationUrl,
  newApiTokenOAuthCallbackPath,
  type NewApiTokenOAuthCallback,
} from "./oauth"
import {
  NEW_API_TOKEN_ENDPOINTS as ENDPOINTS,
  NEW_API_TOKEN_VERIFICATION_ERRORS as VERIFICATION_ERRORS,
} from "./protocol"
import { tokenSessionRequest } from "./sessionRequest"

const MARKER_INSTALL_TIMEOUT_MS = 20_000
const MARKER_INSTALL_RETRY_MS = 100
const OAUTH_VERIFICATION_TIMEOUT_MS = 300_000

/** Own the verification callback without letting the site's login UI consume its code. */
export async function verifyNewApiTokenOAuth(
  tabId: number,
  origin: string,
  provider: string,
  operation: Parameters<NewApiTokenInteraction["verify"]>[1],
  request: ApiServiceRequest,
): Promise<NewApiTokenProof> {
  const source = await assertSiteTabOrigin(tabId, origin)
  const status = await tokenSessionRequest<Record<string, unknown>>(request, {
    endpoint: ENDPOINTS.STATUS,
    operationSemantics: API_OPERATION_SEMANTICS.Read,
    options: { method: "GET" },
  })
  const state = await tokenSessionRequest<{
    flow_token: string
    expires_at: number
    authorization_url?: string
  }>(request, {
    endpoint: ENDPOINTS.OAUTH_STATE,
    operationSemantics: API_OPERATION_SEMANTICS.Mutation,
    options: {
      method: "POST",
      body: JSON.stringify({ provider, intent: "verify", ...operation }),
    },
  })
  if (
    !state.flow_token ||
    !Number.isFinite(state.expires_at) ||
    state.expires_at <= Date.now() / 1000
  )
    throw new Error(VERIFICATION_ERRORS.OAUTH_STATE_INVALID)
  const authorizationUrl = buildTokenVerificationAuthorizationUrl(
    provider,
    state.flow_token,
    origin,
    status,
    state.authorization_url,
  )
  const tab = await createTab(origin, true, {
    windowId: source.windowId,
    ...(source.cookieStoreId ? { cookieStoreId: source.cookieStoreId } : {}),
  })
  if (tab?.id == null) throw new Error("OAUTH_TAB_UNAVAILABLE")
  const ownedTabId = tab.id
  const requestId = crypto.randomUUID()
  try {
    // Only same-origin sessionStorage is needed here. Waiting for every image
    // or third-party resource can prevent a custom frontend from ever verifying.
    let installed = false
    const deadline = Date.now() + MARKER_INSTALL_TIMEOUT_MS
    while (!installed && Date.now() < deadline) {
      request.abortSignal?.throwIfAborted()
      installed = await executeIsolatedFunction(
        ownedTabId,
        (key: string, marker: NewApiTokenOAuthMarker) => {
          if (location.origin !== marker.origin) return false
          sessionStorage.setItem(key, JSON.stringify(marker))
          return true
        },
        [
          NEW_API_TOKEN_OAUTH_MARKER,
          {
            requestId,
            origin,
            provider,
            state: state.flow_token,
            expiresAt: state.expires_at * 1000,
          },
        ],
        true,
      ).catch(() => false)
      if (!installed) await sleep(MARKER_INSTALL_RETRY_MS)
    }
    if (installed !== true) throw new Error("OAUTH_CALLBACK_UNAVAILABLE")
    const callback = await new Promise<NewApiTokenOAuthCallback>(
      (resolve, reject) => {
        let settled = false
        const finish = (result: Error | NewApiTokenOAuthCallback) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          removeMessageListener()
          removeTabListener()
          request.abortSignal?.removeEventListener("abort", onAbort)
          if (result instanceof Error) reject(result)
          else resolve(result)
        }
        const onAbort = () =>
          finish(new Error(VERIFICATION_ERRORS.OAUTH_CANCELLED))
        const onRemoved = (removedId: number) => {
          if (removedId === ownedTabId) onAbort()
        }
        const onMessage = (
          message: unknown,
          sender: browser.runtime.MessageSender,
          acknowledge: (accepted: boolean) => void,
        ) => {
          if (
            !isRecord(message) ||
            message.action !== NEW_API_TOKEN_OAUTH_CALLBACK ||
            message.requestId !== requestId ||
            sender.tab?.id !== ownedTabId ||
            sender.frameId !== 0 ||
            !sender.url
          )
            return
          const url = new URL(sender.url)
          if (
            url.origin !== origin ||
            url.pathname !== newApiTokenOAuthCallbackPath(provider)
          )
            return
          acknowledge(true)
          if (message.error === VERIFICATION_ERRORS.OAUTH_CANCELLED) {
            finish(new Error(VERIFICATION_ERRORS.OAUTH_CANCELLED))
            return
          }
          const value = message.callback
          if (
            message.error ||
            !isRecord(value) ||
            value.state !== state.flow_token ||
            typeof value.code !== "string" ||
            !value.code
          )
            finish(new Error("OAUTH_CALLBACK_INVALID"))
          else finish({ state: value.state, code: value.code })
        }
        const timer = setTimeout(
          () => finish(new Error(VERIFICATION_ERRORS.OAUTH_TIMEOUT)),
          Math.min(
            OAUTH_VERIFICATION_TIMEOUT_MS,
            state.expires_at * 1000 - Date.now(),
          ),
        )
        const removeMessageListener = onRuntimeMessage(onMessage)
        const removeTabListener = onTabRemoved(onRemoved)
        request.abortSignal?.addEventListener("abort", onAbort, { once: true })
        if (request.abortSignal?.aborted) onAbort()
        else
          void updateTab(ownedTabId, { url: authorizationUrl }).catch(() =>
            finish(new Error("OAUTH_NAVIGATION_FAILED")),
          )
      },
    )
    await assertSiteTabOrigin(tabId, origin)
    if (Date.now() >= state.expires_at * 1000)
      throw new Error(VERIFICATION_ERRORS.OAUTH_TIMEOUT)
    // This GET consumes a single-use code, so transport recovery must not replay it.
    return await tokenSessionRequest<NewApiTokenProof>(request, {
      endpoint: `/api/oauth/${encodeURIComponent(provider)}?${new URLSearchParams(callback)}`,
      operationSemantics: API_OPERATION_SEMANTICS.Mutation,
    })
  } finally {
    await removeTab(ownedTabId).catch(() => undefined)
  }
}
