import { injectScript } from "wxt/utils/inject-script"

import {
  REQUESTY_MANAGEMENT_KEY_CHANNEL,
  REQUESTY_MANAGEMENT_KEY_REQUEST_KIND,
  REQUESTY_MANAGEMENT_KEY_RESPONSE_KIND,
  type RequestyManagementKeyBridgeRequest,
  type RequestyManagementKeyBridgeResponse,
} from "~/entrypoints/content/messageHandlers/requesty/managementKeyBridge"
import {
  REQUESTY_API_KEYS_ORIGIN,
  REQUESTY_API_KEYS_PATH,
} from "~/services/apiAdapters/requesty/keys/managementKeyPageContract"

const REQUESTY_MANAGEMENT_KEY_SCRIPT_PATH = "/requesty-management-key.js"

export const REQUESTY_MANAGEMENT_KEY_READ_KINDS = {
  Response: "response",
  WrongPage: "wrong-page",
  NoResponse: "no-response",
} as const

/** Why a read produced no bridge response; distinguishes a wrong page from a stall. */
export type RequestyManagementKeyReadOutcome =
  | {
      kind: typeof REQUESTY_MANAGEMENT_KEY_READ_KINDS.Response
      response: RequestyManagementKeyBridgeResponse
    }
  | { kind: typeof REQUESTY_MANAGEMENT_KEY_READ_KINDS.WrongPage }
  | { kind: typeof REQUESTY_MANAGEMENT_KEY_READ_KINDS.NoResponse }

/** Upper bound for one create round trip (page action + provider write). */
const REQUESTY_MANAGEMENT_KEY_BRIDGE_TIMEOUT_MS = 20_000

type ReaderEnvironment = {
  window: Window
  injectScript: () => Promise<unknown>
  createCorrelationId: () => string
  setTimeout?: (callback: () => void, delayMs: number) => unknown
  clearTimeout?: (timer: unknown) => void
}

/** Generates an isolated random correlation identifier. */
function createRandomCorrelationId() {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  )
}

/** Provides live isolated-world primitives for the production reader. */
function defaultReaderEnvironment(): ReaderEnvironment {
  return {
    window,
    injectScript: () => injectScript(REQUESTY_MANAGEMENT_KEY_SCRIPT_PATH),
    createCorrelationId: createRandomCorrelationId,
  }
}

/** Matches the trusted envelope fields before validating the payload. */
function isMatchingResponse(
  value: unknown,
  correlationId: string,
): value is RequestyManagementKeyBridgeResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const response = value as Record<string, unknown>
  if (
    response.channel !== REQUESTY_MANAGEMENT_KEY_CHANNEL ||
    response.kind !== REQUESTY_MANAGEMENT_KEY_RESPONSE_KIND ||
    response.correlationId !== correlationId
  ) {
    return false
  }
  if (response.ok === true) {
    return (
      typeof response.keyId === "string" &&
      response.keyId !== "" &&
      typeof response.accessToken === "string" &&
      response.accessToken !== ""
    )
  }
  return response.ok === false && typeof response.reason === "string"
}

/**
 * Creates an isolated-world reader with a per-instance successful-injection
 * cache. The page response is an untrusted hint: the caller still validates the
 * credential against the management API before storing it.
 */
export function createRequestyManagementKeyReader(
  environment: ReaderEnvironment = defaultReaderEnvironment(),
) {
  let injectionPromise: Promise<void> | undefined
  const scheduleTimeout =
    environment.setTimeout ??
    ((callback: () => void, delayMs: number) =>
      globalThis.setTimeout(callback, delayMs))
  const cancelTimeout =
    environment.clearTimeout ??
    ((timer: unknown) =>
      globalThis.clearTimeout(
        timer as ReturnType<typeof globalThis.setTimeout>,
      ))

  const ensureInjected = () => {
    if (injectionPromise) return injectionPromise
    const attempt = Promise.resolve()
      .then(environment.injectScript)
      .then(() => undefined)
    injectionPromise = attempt
    void attempt.catch(() => {
      if (injectionPromise === attempt) injectionPromise = undefined
    })
    return attempt
  }

  return function readRequestyManagementKey(
    name: string,
  ): Promise<RequestyManagementKeyReadOutcome> {
    const windowRef = environment.window
    if (
      windowRef.location.origin !== REQUESTY_API_KEYS_ORIGIN ||
      windowRef.location.pathname !== REQUESTY_API_KEYS_PATH
    ) {
      // A signed-out console redirects away from the keys page; nothing was
      // dispatched, so the caller must not report an unconfirmed create.
      return Promise.resolve({
        kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.WrongPage,
      })
    }

    let correlationId: string
    try {
      correlationId = environment.createCorrelationId()
    } catch {
      return Promise.resolve({
        kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.NoResponse,
      })
    }
    if (!correlationId || correlationId.length > 128) {
      return Promise.resolve({
        kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.NoResponse,
      })
    }

    return new Promise((resolve) => {
      let settled = false
      const finish = (response?: RequestyManagementKeyBridgeResponse) => {
        if (settled) return
        settled = true
        windowRef.removeEventListener("message", onMessage)
        cancelTimeout(timer)
        resolve(
          response
            ? { kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.Response, response }
            : { kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.NoResponse },
        )
      }
      const onMessage = (event: MessageEvent) => {
        if (
          event.source !== windowRef ||
          event.origin !== REQUESTY_API_KEYS_ORIGIN ||
          !isMatchingResponse(event.data, correlationId)
        ) {
          return
        }
        finish(event.data)
      }

      windowRef.addEventListener("message", onMessage)
      const timer = scheduleTimeout(
        () => finish(),
        REQUESTY_MANAGEMENT_KEY_BRIDGE_TIMEOUT_MS,
      )

      void ensureInjected()
        .then(() => {
          if (settled) return
          const request: RequestyManagementKeyBridgeRequest = {
            channel: REQUESTY_MANAGEMENT_KEY_CHANNEL,
            kind: REQUESTY_MANAGEMENT_KEY_REQUEST_KIND,
            correlationId,
            name,
          }
          windowRef.postMessage(request, REQUESTY_API_KEYS_ORIGIN)
        })
        .catch(() => finish())
    })
  }
}

let defaultReader:
  | ReturnType<typeof createRequestyManagementKeyReader>
  | undefined

/** Reads a freshly created Requesty manage key through the shared reader. */
export function readRequestyManagementKey(name: string) {
  defaultReader ??= createRequestyManagementKeyReader()
  return defaultReader(name)
}
