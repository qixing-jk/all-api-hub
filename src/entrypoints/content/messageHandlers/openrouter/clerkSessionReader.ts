import { injectScript } from "wxt/utils/inject-script"

import {
  isOpenRouterClerkSessionCorrelationId,
  isOpenRouterClerkSessionResponse,
  isOpenRouterManagementKeysLocation,
  OPENROUTER_CLERK_SESSION_BRIDGE_TIMEOUT_MS,
  OPENROUTER_CLERK_SESSION_CHANNEL,
  OPENROUTER_CLERK_SESSION_REQUEST_KIND,
  OPENROUTER_CLERK_SESSION_RESPONSE_KIND,
  type OpenRouterClerkSessionRequest,
} from "~/entrypoints/content/messageHandlers/openrouter/clerkSessionProtocol"
import {
  OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
  OPENROUTER_MANAGEMENT_KEYS_PATH,
} from "~/services/apiAdapters/openrouter/managementKeyPageContract"
import type { OpenRouterClerkSessionIdentity } from "~/services/apiAdapters/openrouter/types"

export const OPENROUTER_CLERK_SESSION_CROSS_WORLD_MARGIN_MS = 500
export const OPENROUTER_CLERK_SESSION_READER_TIMEOUT_MS =
  OPENROUTER_CLERK_SESSION_BRIDGE_TIMEOUT_MS +
  OPENROUTER_CLERK_SESSION_CROSS_WORLD_MARGIN_MS
const OPENROUTER_CLERK_SESSION_SCRIPT_PATH = "/openrouter-clerk-session.js"

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
    injectScript: () => injectScript(OPENROUTER_CLERK_SESSION_SCRIPT_PATH),
    createCorrelationId: createRandomCorrelationId,
  }
}

/** Matches the trusted envelope fields before validating the full payload. */
function isMatchingResponseEnvelope(value: unknown, correlationId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const response = value as Record<string, unknown>
  return (
    response.channel === OPENROUTER_CLERK_SESSION_CHANNEL &&
    response.kind === OPENROUTER_CLERK_SESSION_RESPONSE_KIND &&
    response.correlationId === correlationId &&
    isOpenRouterClerkSessionCorrelationId(response.correlationId)
  )
}

/**
 * Creates an isolated-world reader with a per-instance successful-injection cache.
 * The page response is an untrusted hint and must not be treated as proof of key
 * ownership until the later OpenRouter creator_user_id comparison succeeds.
 */
export function createOpenRouterClerkSessionReader(
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

  return function readOpenRouterClerkSessionIdentity(): Promise<
    OpenRouterClerkSessionIdentity | undefined
  > {
    const windowRef = environment.window
    if (!isOpenRouterManagementKeysLocation(windowRef.location)) {
      return Promise.resolve(undefined)
    }

    let correlationId: string
    try {
      correlationId = environment.createCorrelationId()
    } catch {
      return Promise.resolve(undefined)
    }
    if (!isOpenRouterClerkSessionCorrelationId(correlationId)) {
      return Promise.resolve(undefined)
    }

    return new Promise((resolve) => {
      let settled = false
      const finish = (identity?: OpenRouterClerkSessionIdentity) => {
        if (settled) return
        settled = true
        windowRef.removeEventListener("message", onMessage)
        cancelTimeout(timer)
        resolve(identity)
      }
      const onMessage = (event: MessageEvent) => {
        if (
          event.source !== windowRef ||
          event.origin !== OPENROUTER_MANAGEMENT_KEYS_ORIGIN ||
          windowRef.location.origin !== OPENROUTER_MANAGEMENT_KEYS_ORIGIN ||
          windowRef.location.pathname !== OPENROUTER_MANAGEMENT_KEYS_PATH ||
          !isMatchingResponseEnvelope(event.data, correlationId)
        ) {
          return
        }
        finish(
          isOpenRouterClerkSessionResponse(event.data)
            ? event.data.identity
            : undefined,
        )
      }

      windowRef.addEventListener("message", onMessage)
      const timer = scheduleTimeout(
        () => finish(),
        OPENROUTER_CLERK_SESSION_READER_TIMEOUT_MS,
      )

      void ensureInjected()
        .then(() => {
          if (settled) return
          const request: OpenRouterClerkSessionRequest = {
            channel: OPENROUTER_CLERK_SESSION_CHANNEL,
            kind: OPENROUTER_CLERK_SESSION_REQUEST_KIND,
            correlationId,
          }
          windowRef.postMessage(request, OPENROUTER_MANAGEMENT_KEYS_ORIGIN)
        })
        .catch(() => finish())
    })
  }
}

let defaultReader:
  | ReturnType<typeof createOpenRouterClerkSessionReader>
  | undefined

/** Reads the current OpenRouter Clerk session through the shared reader. */
export function readOpenRouterClerkSessionIdentity() {
  defaultReader ??= createOpenRouterClerkSessionReader()
  return defaultReader()
}
