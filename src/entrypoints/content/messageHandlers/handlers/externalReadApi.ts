import { EXTERNAL_READ_API_EVENT_NAME } from "~/services/integrations/externalReadApi/constants"

type ExternalReadApiNotifyPayload = {
  topics?: string[]
  changedAt?: number
  eventName?: string
  events?: unknown[]
}

/**
 * Bridge background notifications into the page context for webpage/userscript
 * consumers. The payload is emitted both as a CustomEvent and a window message.
 */
export function handleExternalReadApiNotify(
  request: { payload?: ExternalReadApiNotifyPayload },
  sendResponse: (res: any) => void,
) {
  try {
    const payload = request?.payload ?? {}
    const eventName = payload.eventName || EXTERNAL_READ_API_EVENT_NAME
    const detail = {
      topics: Array.isArray(payload.topics)
        ? payload.topics.filter(
            (topic): topic is string => typeof topic === "string",
          )
        : [],
      changedAt:
        typeof payload.changedAt === "number" ? payload.changedAt : Date.now(),
      events: Array.isArray(payload.events) ? payload.events : [],
    }

    window.dispatchEvent(new CustomEvent(eventName, { detail }))
    window.postMessage(
      {
        source: "all-api-hub-extension",
        type: eventName,
        detail,
      },
      window.location.origin,
    )

    sendResponse({ success: true })
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return true
}
