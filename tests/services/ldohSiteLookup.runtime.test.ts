import { beforeEach, describe, expect, it, vi } from "vitest"

const { sendLdohSiteLookupMessageMock, isReceiverUnavailableMock } = vi.hoisted(
  () => ({
    isReceiverUnavailableMock: vi.fn(() => false),
    sendLdohSiteLookupMessageMock: vi.fn(),
  }),
)

vi.mock("@webext-core/messaging", () => ({
  defineExtensionMessaging: () => ({
    sendMessage: sendLdohSiteLookupMessageMock,
    onMessage: vi.fn(),
  }),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  isMessageReceiverUnavailableError: isReceiverUnavailableMock,
}))

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

    await expect(requestLdohSiteLookupRefreshSites()).resolves.toEqual({
      success: true,
      cachedCount: 3,
    })
    expect(sendLdohSiteLookupMessageMock).toHaveBeenCalledWith(
      LdohSiteLookupMessageTypes.RefreshSites,
      {},
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

    await expect(requestLdohSiteLookupRefreshSites()).resolves.toEqual({
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
    await expect(requestLdohSiteLookupRefreshSites()).resolves.toEqual({
      success: false,
      error: "No response from background.",
    })

    sendLdohSiteLookupMessageMock.mockResolvedValueOnce({
      success: true,
      cachedCount: -1,
    })
    await expect(requestLdohSiteLookupRefreshSites()).resolves.toEqual({
      success: false,
      error: "Invalid response from background.",
    })

    sendLdohSiteLookupMessageMock.mockResolvedValueOnce({
      success: false,
      error: "",
    })
    await expect(requestLdohSiteLookupRefreshSites()).resolves.toEqual({
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
      requestLdohSiteLookupRefreshSites({ maxAttempts: 1 }),
    ).resolves.toEqual({
      success: false,
      error: "background failed",
    })
    await expect(
      requestLdohSiteLookupRefreshSites({ maxAttempts: 1 }),
    ).resolves.toEqual({
      success: false,
      error: "Background request failed.",
    })
  })
})
