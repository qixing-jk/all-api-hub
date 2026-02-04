/**
 * Custom events used to control the in-page Web AI API Check modal.
 *
 * We use DOM CustomEvents instead of React context so non-React content logic
 * (context menu triggers, copy-event auto-detect) can open/close the modal
 * without importing UI components (avoids circular deps).
 */

export const API_CHECK_OPEN_MODAL_EVENT = "all-api-hub:api-check:open-modal"
export const API_CHECK_MODAL_CLOSED_EVENT = "all-api-hub:api-check:closed-modal"
export const API_CHECK_MODAL_HOST_READY_EVENT =
  "all-api-hub:api-check:modal-host-ready"

let isModalHostReady = false

export type ApiCheckOpenModalDetail = {
  sourceText: string
  pageUrl: string
  trigger: "contextMenu" | "autoDetect"
}

export type ApiCheckModalClosedDetail = {
  pageUrl: string
  trigger: ApiCheckOpenModalDetail["trigger"]
  reason: "dismissed" | "completed" | "closed"
}

/**
 * Open the API Check modal in the current page.
 */
export function dispatchOpenApiCheckModal(detail: ApiCheckOpenModalDetail) {
  window.dispatchEvent(
    new CustomEvent<ApiCheckOpenModalDetail>(API_CHECK_OPEN_MODAL_EVENT, {
      detail,
    }),
  )
}

/**
 * Mark the React modal host as ready to receive open events.
 *
 * This is used by non-React content logic to avoid racing an "open" event
 * against the initial ShadowRoot UI mount.
 */
export function dispatchApiCheckModalHostReady() {
  isModalHostReady = true
  window.dispatchEvent(new CustomEvent(API_CHECK_MODAL_HOST_READY_EVENT))
}

/**
 *
 */
export function waitForApiCheckModalHostReady(options?: {
  timeoutMs?: number
}) {
  const timeoutMs = Math.max(0, options?.timeoutMs ?? 1500)
  if (isModalHostReady) return Promise.resolve()

  return new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.removeEventListener(
        API_CHECK_MODAL_HOST_READY_EVENT,
        onReady as any,
      )
      resolve()
    }

    const onReady = () => finish()

    window.addEventListener(API_CHECK_MODAL_HOST_READY_EVENT, onReady as any)

    window.setTimeout(() => {
      // Avoid hanging forever if something goes wrong; callers can still
      // dispatch the open event and rely on a manual retry.
      finish()
    }, timeoutMs)
  })
}

/**
 * Notify listeners that the API Check modal has been closed.
 */
export function dispatchApiCheckModalClosed(detail: ApiCheckModalClosedDetail) {
  window.dispatchEvent(
    new CustomEvent<ApiCheckModalClosedDetail>(API_CHECK_MODAL_CLOSED_EVENT, {
      detail,
    }),
  )
}
