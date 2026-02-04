/**
 * Shared utilities for All-API-Hub content-script UIs.
 *
 * Multiple features mount UI inside a WXT ShadowRoot host element (a custom tag).
 * DOM events fired inside that ShadowRoot are retargeted to the host element, so
 * detectors in content scripts can safely ignore events that originate from our
 * own UI.
 */

/**
 * Shadow-root host tag used by `ensureRedemptionToastUi()`.
 *
 * Even though the name historically comes from "redemption assist", the element
 * is the shared UI host for multiple content-script features (toasts, modals, etc.).
 */
export const CONTENT_UI_HOST_TAG = "all-api-hub-redemption-toast"

/**
 * Guards against handling events triggered from inside our own content-script UI.
 * @param target Event origin node.
 * @returns True when the event originated from our ShadowRoot UI host.
 */
export function isEventFromAllApiHubContentUi(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLElement)) return false
  // Events from inside the Shadow DOM toaster are retargeted to the shadow host
  // <all-api-hub-redemption-toast data-wxt-shadow-root="">
  // so we only need to check whether the event target is inside this host element.
  return !!target.closest(CONTENT_UI_HOST_TAG)
}
