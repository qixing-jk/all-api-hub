import { beforeEach, describe, expect, it, vi } from "vitest"

const { sendLdohSiteLookupMessageMock } = vi.hoisted(() => ({
  sendLdohSiteLookupMessageMock: vi.fn(),
}))

vi.mock("@webext-core/messaging", () => ({
  defineExtensionMessaging: () => ({
    sendMessage: sendLdohSiteLookupMessageMock,
    onMessage: vi.fn(),
  }),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  isMessageReceiverUnavailableError: vi.fn(() => false),
}))

describe("ldohSiteLookup runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
