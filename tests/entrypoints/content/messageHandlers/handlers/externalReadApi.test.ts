// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"

import { handleExternalReadApiNotify } from "~/entrypoints/content/messageHandlers/handlers/externalReadApi"
import { EXTERNAL_READ_API_EVENT_NAME } from "~/services/integrations/externalReadApi/constants"

describe("handleExternalReadApiNotify", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("bridges the notification into the page context", () => {
    const sendResponse = vi.fn()
    const eventListener = vi.fn()
    const postMessageSpy = vi.spyOn(window, "postMessage")

    window.addEventListener(EXTERNAL_READ_API_EVENT_NAME, eventListener)

    try {
      const result = handleExternalReadApiNotify(
        {
          payload: {
            topics: ["accounts", "apiCredentialProfiles"],
            changedAt: 3456,
            events: [
              {
                type: "account.updated",
                topic: "accounts",
              },
            ],
          },
        },
        sendResponse,
      )

      expect(result).toBe(true)
      expect(eventListener).toHaveBeenCalledTimes(1)
      expect((eventListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
        topics: ["accounts", "apiCredentialProfiles"],
        changedAt: 3456,
        events: [
          {
            type: "account.updated",
            topic: "accounts",
          },
        ],
      })
      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: "all-api-hub-extension",
          type: EXTERNAL_READ_API_EVENT_NAME,
          detail: {
            topics: ["accounts", "apiCredentialProfiles"],
            changedAt: 3456,
            events: [
              {
                type: "account.updated",
                topic: "accounts",
              },
            ],
          },
        },
        window.location.origin,
      )
      expect(sendResponse).toHaveBeenCalledWith({ success: true })
    } finally {
      window.removeEventListener(EXTERNAL_READ_API_EVENT_NAME, eventListener)
    }
  })
})
