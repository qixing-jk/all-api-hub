import type { ProductAnnouncementButtonSurface } from "./ProductAnnouncementButton"

export const PRODUCT_ANNOUNCEMENT_OPEN_EVENT =
  "all-api-hub:product-announcements:open"

export const PRODUCT_ANNOUNCEMENT_RELOAD_EVENT =
  "all-api-hub:product-announcements:reload"

interface ProductAnnouncementOpenEventDetail {
  surface: ProductAnnouncementButtonSurface
}

/**
 * Requests a specific announcement button surface to open its popover.
 */
export function requestProductAnnouncementPopoverOpen(
  surface: ProductAnnouncementButtonSurface,
) {
  window.dispatchEvent(
    new CustomEvent<ProductAnnouncementOpenEventDetail>(
      PRODUCT_ANNOUNCEMENT_OPEN_EVENT,
      {
        detail: { surface },
      },
    ),
  )
}

/**
 * Requests mounted announcement consumers to reload their local view state.
 */
export function requestProductAnnouncementsReload() {
  window.dispatchEvent(new Event(PRODUCT_ANNOUNCEMENT_RELOAD_EVENT))
}

/**
 * Narrows a browser Event to the feature-owned announcement open request.
 */
export function isProductAnnouncementOpenEvent(
  event: Event,
): event is CustomEvent<ProductAnnouncementOpenEventDetail> {
  return (
    event.type === PRODUCT_ANNOUNCEMENT_OPEN_EVENT &&
    typeof (event as CustomEvent<ProductAnnouncementOpenEventDetail>).detail
      ?.surface === "string"
  )
}
