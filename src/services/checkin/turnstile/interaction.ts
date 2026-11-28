import {
  TURNSTILE_CONTAINER_SELECTOR,
  TURNSTILE_IFRAME_SELECTOR,
  TURNSTILE_MESSAGE_EVENTS,
  TURNSTILE_MESSAGE_ORIGIN,
  TURNSTILE_MESSAGE_SOURCE,
} from "~/constants/turnstile"

export const VERIFICATION_INTERACTION_STATES = {
  Unknown: "unknown",
  Verifying: "verifying",
  Required: "required",
} as const

export type VerificationInteractionState =
  (typeof VERIFICATION_INTERACTION_STATES)[keyof typeof VERIFICATION_INTERACTION_STATES]

type TurnstileInteractionMessage = {
  source?: unknown
  widgetId?: unknown
  event?: unknown
}

/** Resolve a widget only when the sender is its frame or a child browsing context. */
function resolveMessageWidget(
  widgetId: string,
  source: MessageEventSource,
): Element | undefined {
  const sourceFrame = Array.from(
    document.querySelectorAll<HTMLIFrameElement>(TURNSTILE_IFRAME_SELECTOR),
  ).find((candidate) => candidate.contentWindow === source)
  const widgetElementId = `cf-chl-widget-${widgetId}`
  const frame = sourceFrame?.id === widgetElementId ? sourceFrame : undefined
  // Current widgets keep their frame in a closed shadow root, while the
  // generated response field remains in the page. Verify the sender is a
  // child browsing context before using its widget ID to find that field.
  const field = document.getElementById(`${widgetElementId}_response`)
  const pageWindow = document.defaultView ?? window
  let isChildFrame = !!sourceFrame
  try {
    // Closed-shadow frames are not in window.frames. Window.parent remains
    // readable across origins; Firefox may instead provide a null source.
    isChildFrame ||= (source as Window).parent === pageWindow
  } catch {
    // Unreadable sources must not establish interaction state.
  }
  return (
    frame ??
    (isChildFrame &&
    field instanceof HTMLInputElement &&
    field.type === "hidden"
      ? field
      : undefined)
  )
}

/** Interpret known events while leaving the last state intact for unknown events. */
function interactionStateFromEvent(
  event: unknown,
): VerificationInteractionState | undefined {
  switch (event) {
    case TURNSTILE_MESSAGE_EVENTS.InteractiveBegin:
      return VERIFICATION_INTERACTION_STATES.Required
    case TURNSTILE_MESSAGE_EVENTS.Init:
    case TURNSTILE_MESSAGE_EVENTS.RequestExtraParams:
    case TURNSTILE_MESSAGE_EVENTS.InteractiveEnd:
    case TURNSTILE_MESSAGE_EVENTS.Complete:
    case TURNSTILE_MESSAGE_EVENTS.RefreshRequest:
    case TURNSTILE_MESSAGE_EVENTS.ReloadRequest:
      // Completion still needs the site's response field/API or status readback.
      return VERIFICATION_INTERACTION_STATES.Verifying
    case TURNSTILE_MESSAGE_EVENTS.Fail:
    case TURNSTILE_MESSAGE_EVENTS.Reject:
    case TURNSTILE_MESSAGE_EVENTS.TokenExpired:
    case TURNSTILE_MESSAGE_EVENTS.InteractiveTimeout:
      // The widget may retry automatically; failure alone does not require a human.
      return VERIFICATION_INTERACTION_STATES.Unknown
    default:
      return undefined
  }
}

/** Match a container/frame to its observed frame or generated response field. */
function coversWidget(widget: Element, element: Element): boolean {
  return (
    widget === element ||
    widget.contains(element) ||
    (widget instanceof HTMLIFrameElement &&
      element.id === `${widget.id}_response`)
  )
}

/** Ask immediately for interaction, or after the grace period if state is unknown. */
export function shouldRequestVerificationAssist(
  state: VerificationInteractionState,
  fallbackDeadline: number,
): boolean {
  return (
    state === VERIFICATION_INTERACTION_STATES.Required ||
    (state === VERIFICATION_INTERACTION_STATES.Unknown &&
      Date.now() >= fallbackDeadline)
  )
}

/**
 * Observe the widget's interaction messages without changing site callbacks.
 * These messages are an optional signal from Cloudflare's current api.js, not
 * a public API contract. Missing or unrecognized signals remain unknown.
 * https://challenges.cloudflare.com/turnstile/v0/api.js (verified 2026-11-28)
 */
export function observeTurnstileInteraction() {
  const states = new Map<
    string,
    { element: Element; state: VerificationInteractionState }
  >()
  const onMessage = (
    event: MessageEvent<TurnstileInteractionMessage | null | undefined>,
  ) => {
    if (
      event.origin !== TURNSTILE_MESSAGE_ORIGIN ||
      event.data?.source !== TURNSTILE_MESSAGE_SOURCE ||
      typeof event.data.widgetId !== "string" ||
      !event.source
    )
      return

    const widget = resolveMessageWidget(event.data.widgetId, event.source)
    if (!widget) return
    const state = interactionStateFromEvent(event.data.event)
    // A widget can resolve to its response field before its frame is queryable.
    // Keep only its latest state when the resolved element changes.
    if (state !== undefined)
      states.set(event.data.widgetId, { element: widget, state })
  }
  window.addEventListener("message", onMessage)
  return {
    read: (
      widgets: readonly Element[] = Array.from(
        document.querySelectorAll(
          `${TURNSTILE_CONTAINER_SELECTOR}, ${TURNSTILE_IFRAME_SELECTOR}`,
        ),
      ),
    ): VerificationInteractionState => {
      const relevant: VerificationInteractionState[] = []
      const observed: Element[] = []
      for (const { element, state } of states.values()) {
        if (
          element.isConnected &&
          (!widgets.length ||
            widgets.some((widget) => coversWidget(widget, element)))
        ) {
          relevant.push(state)
          observed.push(element)
        }
      }
      if (relevant.includes(VERIFICATION_INTERACTION_STATES.Required))
        return VERIFICATION_INTERACTION_STATES.Required
      if (
        widgets.some(
          (widget) =>
            !observed.some((element) => coversWidget(widget, element)),
        )
      )
        return VERIFICATION_INTERACTION_STATES.Unknown
      return relevant.length &&
        relevant.every(
          (state) => state === VERIFICATION_INTERACTION_STATES.Verifying,
        )
        ? VERIFICATION_INTERACTION_STATES.Verifying
        : VERIFICATION_INTERACTION_STATES.Unknown
    },
    dispose: () => window.removeEventListener("message", onMessage),
  }
}
