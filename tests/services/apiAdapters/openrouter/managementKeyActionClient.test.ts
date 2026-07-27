import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  cancelTempWindowOpenRouterManagementKeyAction,
  tempWindowOpenRouterManagementKeyAction,
} from "~/services/apiAdapters/openrouter/managementKeyActionClient"
import { OPENROUTER_MANAGEMENT_KEY_SECRET_MAX_LENGTH } from "~/services/apiAdapters/openrouter/managementKeySecret"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"

const { sendRuntimeMessageMock } = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return { ...actual, sendRuntimeMessage: sendRuntimeMessageMock }
})

describe("OpenRouter Management Key action client", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("routes create through the runtime message boundary", async () => {
    sendRuntimeMessageMock.mockResolvedValueOnce({
      requestId: "request-example",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-example-placeholder",
      label: "extension-request-example",
    })

    const response = await tempWindowOpenRouterManagementKeyAction({
      requestId: "request-example",
      operation: { kind: "create", label: "extension-request-example" },
    })

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      action: RuntimeActionIds.TempWindowOpenRouterManagementKeyAction,
      requestId: "request-example",
      operation: { kind: "create", label: "extension-request-example" },
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      suppressMinimize: false,
    })
    expect(response).toMatchObject({ mutationState: "created" })
  })

  it("routes cancellation through the runtime message boundary by opaque request ID only", async () => {
    sendRuntimeMessageMock.mockResolvedValueOnce({
      requestId: "request-cancel",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: "dispatched_unconfirmed",
      label: "recognizable-label",
    })

    await expect(
      cancelTempWindowOpenRouterManagementKeyAction("request-cancel"),
    ).resolves.toEqual({
      requestId: "request-cancel",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: "dispatched_unconfirmed",
      label: "recognizable-label",
    })
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      action: RuntimeActionIds.TempWindowCancelOpenRouterManagementKeyAction,
      requestId: "request-cancel",
    })
  })

  it("uses the shared runtime action namespace", async () => {
    sendRuntimeMessageMock
      .mockResolvedValueOnce({
        requestId: "request-runtime",
        operation: "create",
        mutationState: "not_dispatched",
        attemptOutcome: "logged_out",
        label: "extension-request-runtime",
      })
      .mockResolvedValueOnce({
        requestId: "request-runtime",
        certainty: "unknown",
        cancellationAccepted: true,
      })

    await tempWindowOpenRouterManagementKeyAction({
      requestId: "request-runtime",
      operation: { kind: "create", label: "extension-request-runtime" },
    })
    await cancelTempWindowOpenRouterManagementKeyAction("request-runtime")

    expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(1, {
      action: RuntimeActionIds.TempWindowOpenRouterManagementKeyAction,
      requestId: "request-runtime",
      operation: { kind: "create", label: "extension-request-runtime" },
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      suppressMinimize: false,
    })
    expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(2, {
      action: RuntimeActionIds.TempWindowCancelOpenRouterManagementKeyAction,
      requestId: "request-runtime",
    })
  })

  it("does not treat a malformed runtime create response as created", async () => {
    sendRuntimeMessageMock.mockResolvedValueOnce({
      requestId: "request-malformed-create",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "",
      label: "extension-request-malformed-create",
    })

    await expect(
      tempWindowOpenRouterManagementKeyAction({
        requestId: "request-malformed-create",
        operation: {
          kind: "create",
          label: "extension-request-malformed-create",
        },
      }),
    ).resolves.toEqual({
      requestId: "request-malformed-create",
      operation: "create",
      mutationState: "dispatched_unconfirmed",
      attemptOutcome: "failed",
      label: "extension-request-malformed-create",
    })
  })

  it.each([
    ["whitespace-only", "   "],
    ["wrong prefix", "example-placeholder"],
    ["invalid character", "sk-or-invalid.placeholder"],
    [
      "oversized",
      `sk-or-${"a".repeat(
        OPENROUTER_MANAGEMENT_KEY_SECRET_MAX_LENGTH - "sk-or-".length + 1,
      )}`,
    ],
  ])(
    "does not forward a %s runtime secret as created evidence",
    async (_case, accessToken) => {
      sendRuntimeMessageMock.mockResolvedValueOnce({
        requestId: "request-invalid-secret",
        operation: "create",
        mutationState: "created",
        attemptOutcome: "success",
        accessToken,
        label: "extension-request-invalid-secret",
      })

      const result = await tempWindowOpenRouterManagementKeyAction({
        requestId: "request-invalid-secret",
        operation: {
          kind: "create",
          label: "extension-request-invalid-secret",
        },
      })

      expect(result).toEqual({
        requestId: "request-invalid-secret",
        operation: "create",
        mutationState: "dispatched_unconfirmed",
        attemptOutcome: "failed",
        label: "extension-request-invalid-secret",
      })
      expect(result).not.toHaveProperty("accessToken")
      expect(JSON.stringify(result)).not.toContain(accessToken)
    },
  )

  it.each([
    [
      "trimmed",
      "  sk-or-normalized-placeholder  ",
      "sk-or-normalized-placeholder",
    ],
    [
      "maximum length",
      `sk-or-${"a".repeat(
        OPENROUTER_MANAGEMENT_KEY_SECRET_MAX_LENGTH - "sk-or-".length,
      )}`,
      `sk-or-${"a".repeat(
        OPENROUTER_MANAGEMENT_KEY_SECRET_MAX_LENGTH - "sk-or-".length,
      )}`,
    ],
  ])(
    "normalizes a valid %s runtime secret",
    async (_case, accessToken, expected) => {
      sendRuntimeMessageMock.mockResolvedValueOnce({
        requestId: "request-valid-secret",
        operation: "create",
        mutationState: "created",
        attemptOutcome: "success",
        accessToken,
        label: "extension-request-valid-secret",
      })

      await expect(
        tempWindowOpenRouterManagementKeyAction({
          requestId: "request-valid-secret",
          operation: {
            kind: "create",
            label: "extension-request-valid-secret",
          },
        }),
      ).resolves.toMatchObject({
        mutationState: "created",
        accessToken: expected,
      })
    },
  )

  it.each([
    undefined,
    null,
    { requestId: "other-request", certainty: "unknown" },
    {
      requestId: "request-malformed",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: "not_dispatched",
      label: "not-allowed",
    },
    {
      requestId: "request-malformed",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: "created",
      label: "",
    },
    {
      requestId: "request-malformed",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: "dispatched_unconfirmed",
      label: "x".repeat(97),
    },
  ])(
    "normalizes malformed cancellation response %# to unknown",
    async (response) => {
      sendRuntimeMessageMock.mockResolvedValueOnce(response)

      await expect(
        cancelTempWindowOpenRouterManagementKeyAction("request-malformed"),
      ).resolves.toEqual({
        requestId: "request-malformed",
        certainty: "unknown",
      })
    },
  )

  it("reconstructs an allowlisted unknown response without leaked evidence", async () => {
    sendRuntimeMessageMock.mockResolvedValueOnce({
      requestId: "request-unknown",
      certainty: "unknown",
      cancellationAccepted: true,
      mutationState: "created",
      label: "private-label",
      accessToken: "sk-or-private",
    })

    await expect(
      cancelTempWindowOpenRouterManagementKeyAction("request-unknown"),
    ).resolves.toEqual({
      requestId: "request-unknown",
      certainty: "unknown",
      cancellationAccepted: true,
    })
  })

  it("normalizes runtime rejection without adding guessed mutation evidence", async () => {
    sendRuntimeMessageMock.mockRejectedValueOnce(new Error("transport timeout"))

    await expect(
      cancelTempWindowOpenRouterManagementKeyAction("request-timeout"),
    ).resolves.toEqual({
      requestId: "request-timeout",
      certainty: "unknown",
    })
  })

  it("does not statically depend on the background entrypoint", () => {
    const source = readFileSync(
      new URL(
        "../../../../src/services/apiAdapters/openrouter/managementKeyActionClient.ts",
        import.meta.url,
      ),
      "utf8",
    )

    expect(source).not.toContain(
      "entrypoints/background/openrouter/managementKeyAction",
    )
  })
})
