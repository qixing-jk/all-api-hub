/**
 * Reads the official Cloudflare Turnstile client API in the page world.
 *
 * New API renders the widget explicitly and receives the token in `callback`
 * (`web/src/components/turnstile.tsx`). The default response field is still
 * `cf-turnstile-response`, but forks can disable it. `getResponse()` observes
 * the token the site's own widget already created. `execute()` is the
 * documented client API for widgets rendered with `execution: "execute"` and
 * is attempted once when a rendered widget still has no token, including quiet background checks. This does not send
 * the site key or challenge to a solver.
 *
 * The function is injected via `scripting.executeScript`, so it must not close
 * over module bindings. Everything it needs lives in this function body.
 */
export type TurnstilePageApiProbe = {
  hasApi: boolean
  token: string | null
  executed: boolean
}

/**
 * Observes the page's Turnstile client. Safe to inject into the page world.
 */
export function probeTurnstilePageApi(
  allowExecute: boolean,
): TurnstilePageApiProbe {
  const maxTokenLength = 4096
  const target = window as Window & {
    turnstile?: {
      getResponse?: (widgetId?: string) => unknown
      execute?: (container?: unknown) => unknown
    }
    __aahTurnstileExecuteAttempted?: boolean
  }
  const api = target.turnstile
  if (!api || typeof api.getResponse !== "function") {
    return { hasApi: false, token: null, executed: false }
  }

  let token: string | null = null
  try {
    const value = api.getResponse()
    token =
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= maxTokenLength
        ? value.trim()
        : null
  } catch {
    token = null
  }

  if (token) {
    return { hasApi: true, token, executed: false }
  }

  const alreadyAttempted = target.__aahTurnstileExecuteAttempted === true
  if (!allowExecute || alreadyAttempted || typeof api.execute !== "function") {
    return { hasApi: true, token: null, executed: alreadyAttempted }
  }

  target.__aahTurnstileExecuteAttempted = true
  try {
    api.execute()
  } catch {
    // The widget decides whether execute applies to its current mode.
  }

  return { hasApi: true, token: null, executed: true }
}
