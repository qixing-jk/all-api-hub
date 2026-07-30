import { beforeEach, describe, expect, it, vi } from "vitest"

const { sendLdohSiteLookupMessageMock, isReceiverUnavailableMock } = vi.hoisted(
  () => ({
    isReceiverUnavailableMock: vi.fn(() => false),
    sendLdohSiteLookupMessageMock: vi.fn(),
  }),
)

vi.mock("~/services/runtimeMessaging/extensionMessaging", () => ({
  defineExtensionMessaging: () => ({
    sendMessage: sendLdohSiteLookupMessageMock,
    onMessage: vi.fn(),
  }),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  isMessageReceiverUnavailableError: isReceiverUnavailableMock,
}))

const UI_LIFECYCLE_EXECUTION = {
  version: 1,
  kind: "automatic",
  feature: "site_detection",
  trigger: "ui_lifecycle",
  surface: "options",
} as const

describe("ldohSiteLookup runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    isReceiverUnavailableMock.mockReturnValue(false)
  })

  it("returns a validated success response from background", async () => {
    const { LdohSiteLookupMessageTypes } = await import(
      "~/services/integrations/ldohSiteLookup/runtime"
    )
    sendLdohSiteLookupMessageMock.mockResolvedValueOnce({
      success: true,
      cachedCount: 3,
    })

    const { requestLdohSiteLookupRefreshSites } = await import(
      "~/services/integrations/ldohSiteLookup/runtime"
    )

    await expect(
      requestLdohSiteLookupRefreshSites({
        protectionBypassExecution: UI_LIFECYCLE_EXECUTION,
      }),
    ).resolves.toEqual({ success: true, cachedCount: 3 })
    expect(sendLdohSiteLookupMessageMock).toHaveBeenCalledWith(
      LdohSiteLookupMessageTypes.RefreshSites,
      { protectionBypassExecution: UI_LIFECYCLE_EXECUTION },
    )
  })

  it("includes explicit site-detection execution in the typed refresh request", async () => {
    const protectionBypassExecution = {
      version: 1,
      kind: "automatic",
      feature: "site_detection",
      trigger: "ui_lifecycle",
      surface: "options",
    } as const
    sendLdohSiteLookupMessageMock.mockResolvedValueOnce({
      success: true,
      cachedCount: 1,
    })
    const { LdohSiteLookupMessageTypes, requestLdohSiteLookupRefreshSites } =
      await import("~/services/integrations/ldohSiteLookup/runtime")

    await requestLdohSiteLookupRefreshSites({ protectionBypassExecution })

    expect(sendLdohSiteLookupMessageMock).toHaveBeenCalledWith(
      LdohSiteLookupMessageTypes.RefreshSites,
      { protectionBypassExecution },
    )
  })

  it("preserves authenticated failure details from background", async () => {
    sendLdohSiteLookupMessageMock.mockResolvedValueOnce({
      success: false,
      unauthenticated: true,
      error: "Sign in required",
    })

    const { requestLdohSiteLookupRefreshSites } = await import(
      "~/services/integrations/ldohSiteLookup/runtime"
    )

    await expect(
      requestLdohSiteLookupRefreshSites({
        protectionBypassExecution: UI_LIFECYCLE_EXECUTION,
      }),
    ).resolves.toEqual({
      success: false,
      unauthenticated: true,
      error: "Sign in required",
    })
  })

  it("rejects missing or malformed background responses", async () => {
    const { requestLdohSiteLookupRefreshSites } = await import(
      "~/services/integrations/ldohSiteLookup/runtime"
    )

    sendLdohSiteLookupMessageMock.mockResolvedValueOnce(undefined)
    await expect(
      requestLdohSiteLookupRefreshSites({
        protectionBypassExecution: UI_LIFECYCLE_EXECUTION,
      }),
    ).resolves.toEqual({
      success: false,
      error: "No response from background.",
    })

    sendLdohSiteLookupMessageMock.mockResolvedValueOnce({
      success: true,
      cachedCount: -1,
    })
    await expect(
      requestLdohSiteLookupRefreshSites({
        protectionBypassExecution: UI_LIFECYCLE_EXECUTION,
      }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid response from background.",
    })

    sendLdohSiteLookupMessageMock.mockResolvedValueOnce({
      success: false,
      error: "",
    })
    await expect(
      requestLdohSiteLookupRefreshSites({
        protectionBypassExecution: UI_LIFECYCLE_EXECUTION,
      }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid response from background.",
    })
  })

  it("retries transient receiver failures before returning success", async () => {
    vi.useFakeTimers()
    isReceiverUnavailableMock.mockReturnValue(true)
    sendLdohSiteLookupMessageMock
      .mockRejectedValueOnce(new Error("receiver unavailable"))
      .mockResolvedValueOnce({
        success: true,
        cachedCount: 2,
      })

    const { requestLdohSiteLookupRefreshSites } = await import(
      "~/services/integrations/ldohSiteLookup/runtime"
    )

    const request = requestLdohSiteLookupRefreshSites({
      protectionBypassExecution: UI_LIFECYCLE_EXECUTION,
      maxAttempts: 2,
      delayMs: 10,
    })
    await vi.advanceTimersByTimeAsync(10)

    await expect(request).resolves.toEqual({
      success: true,
      cachedCount: 2,
    })
    expect(sendLdohSiteLookupMessageMock).toHaveBeenCalledTimes(2)
  })

  it("normalizes runtime send failures into failure responses", async () => {
    sendLdohSiteLookupMessageMock
      .mockRejectedValueOnce(new Error("background failed"))
      .mockRejectedValueOnce("unknown failure")

    const { requestLdohSiteLookupRefreshSites } = await import(
      "~/services/integrations/ldohSiteLookup/runtime"
    )

    await expect(
      requestLdohSiteLookupRefreshSites({
        protectionBypassExecution: UI_LIFECYCLE_EXECUTION,
        maxAttempts: 1,
      }),
    ).resolves.toEqual({
      success: false,
      error: "background failed",
    })
    await expect(
      requestLdohSiteLookupRefreshSites({
        protectionBypassExecution: UI_LIFECYCLE_EXECUTION,
        maxAttempts: 1,
      }),
    ).resolves.toEqual({
      success: false,
      error: "Background request failed.",
    })
  })
})
