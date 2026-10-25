import { beforeEach, describe, expect, it, vi } from "vitest"

import { handleRequestyManagementKeyAction } from "~/entrypoints/content/messageHandlers/handlers/requestyManagementKey"
import {
  REQUESTY_MANAGEMENT_KEY_CHANNEL,
  REQUESTY_MANAGEMENT_KEY_RESPONSE_KIND,
} from "~/entrypoints/content/messageHandlers/requesty/managementKeyBridge"
import {
  readRequestyManagementKey,
  REQUESTY_MANAGEMENT_KEY_READ_KINDS,
} from "~/entrypoints/content/messageHandlers/requesty/managementKeyReader"

vi.mock(
  "~/entrypoints/content/messageHandlers/requesty/managementKeyReader",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/entrypoints/content/messageHandlers/requesty/managementKeyReader")
    >()),
    readRequestyManagementKey: vi.fn(),
  }),
)

beforeEach(() => vi.clearAllMocks())

describe("Requesty management key action handler", () => {
  it("rejects invalid requests with a machine-readable reason and no create", () => {
    const sendResponse = vi.fn()

    expect(handleRequestyManagementKeyAction(null, sendResponse)).toBe(false)
    expect(sendResponse).toHaveBeenCalledExactlyOnceWith({
      requestId: "",
      operation: "create",
      state: "not_dispatched",
      reason: "create_rejected",
      name: "",
    })
    expect(readRequestyManagementKey).not.toHaveBeenCalled()
  })

  it.each([
    [
      { kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.WrongPage },
      "not_dispatched",
      "session_unavailable",
    ],
    [
      { kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.NoResponse },
      "dispatched_unconfirmed",
      "plaintext_missing",
    ],
    [
      {
        kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.Response,
        response: {
          channel: REQUESTY_MANAGEMENT_KEY_CHANNEL,
          kind: REQUESTY_MANAGEMENT_KEY_RESPONSE_KIND,
          correlationId: "correlation-1",
          ok: false,
          reason: "organization_unavailable",
        },
      },
      "not_dispatched",
      "organization_unavailable",
    ],
    [
      {
        kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.Response,
        response: {
          channel: REQUESTY_MANAGEMENT_KEY_CHANNEL,
          kind: REQUESTY_MANAGEMENT_KEY_RESPONSE_KIND,
          correlationId: "correlation-1",
          ok: false,
          reason: "plaintext_missing",
        },
      },
      // The create POST was already sent, so the account may hold a key.
      "dispatched_unconfirmed",
      "plaintext_missing",
    ],
  ] as const)(
    "preserves the failure envelope for %j",
    async (outcome, state, reason) => {
      vi.mocked(readRequestyManagementKey).mockResolvedValue(outcome)
      const sendResponse = vi.fn()

      expect(
        handleRequestyManagementKeyAction(
          {
            requestId: "request-1",
            operation: { kind: "create", name: "  Connection  key " },
          },
          sendResponse,
        ),
      ).toBe(true)
      await vi.waitFor(() =>
        expect(sendResponse).toHaveBeenCalledExactlyOnceWith({
          requestId: "request-1",
          operation: "create",
          state,
          reason,
          name: "Connection key",
        }),
      )
      expect(readRequestyManagementKey).toHaveBeenCalledExactlyOnceWith(
        "Connection key",
      )
    },
  )
})
