import {
  TURNSTILE_MESSAGE_ORIGIN,
  TURNSTILE_MESSAGE_SOURCE,
} from "~/constants/turnstile"

/** Deliver an interaction event from the selected widget's browsing context. */
export function emitTurnstileEvent(
  frame: HTMLIFrameElement,
  event: string,
  widgetId = "active",
) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: TURNSTILE_MESSAGE_ORIGIN,
      source: frame.contentWindow,
      data: { source: TURNSTILE_MESSAGE_SOURCE, widgetId, event },
    }),
  )
}
