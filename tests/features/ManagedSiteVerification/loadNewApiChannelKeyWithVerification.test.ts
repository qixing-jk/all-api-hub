import { describe, expect, it, vi } from "vitest"

import { loadNewApiChannelKeyWithVerification } from "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification"

const {
  ensureNewApiManagedSessionMock,
  fetchNewApiChannelKeyMock,
  isNewApiVerifiedSessionActiveMock,
} = vi.hoisted(() => ({
  ensureNewApiManagedSessionMock: vi.fn(),
  fetchNewApiChannelKeyMock: vi.fn(),
  isNewApiVerifiedSessionActiveMock: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/newApiSession", () => ({
  NEW_API_MANAGED_SESSION_STATUSES: {
    VERIFIED: "verified",
    CREDENTIALS_MISSING: "credentials-missing",
    LOGIN_2FA_REQUIRED: "login-2fa-required",
    SECURE_VERIFICATION_REQUIRED: "secure-verification-required",
    PASSKEY_MANUAL_REQUIRED: "passkey-manual-required",
  },
  NewApiChannelKeyRequirementError: class NewApiChannelKeyRequirementError extends Error {
    constructor(public kind: string) {
      super(kind)
      this.name = "NewApiChannelKeyRequirementError"
    }
  },
  ensureNewApiManagedSession: (...args: unknown[]) =>
    ensureNewApiManagedSessionMock(...args),
  fetchNewApiChannelKey: (...args: unknown[]) =>
    fetchNewApiChannelKeyMock(...args),
  isNewApiVerifiedSessionActive: (...args: unknown[]) =>
    isNewApiVerifiedSessionActiveMock(...args),
}))

const BASE_PARAMS = {
  channelId: 12,
  label: "Channel A",
  requestKind: "channel" as const,
  config: {
    baseUrl: "https://managed.example",
    userId: "1",
    username: "admin",
    password: "secret",
    totpSecret: "",
  },
}

describe("loadNewApiChannelKeyWithVerification", () => {
  it("opens verification from the prefetched session result before reading a concrete key", async () => {
    isNewApiVerifiedSessionActiveMock.mockReturnValue(false)
    ensureNewApiManagedSessionMock.mockResolvedValue({
      status: "login-2fa-required",
      automaticAttempted: false,
    })

    const setKey = vi.fn()
    const openVerification = vi.fn()

    const loaded = await loadNewApiChannelKeyWithVerification({
      ...BASE_PARAMS,
      setKey,
      openVerification,
    })

    expect(loaded).toBe(false)
    expect(ensureNewApiManagedSessionMock).toHaveBeenCalledWith(
      BASE_PARAMS.config,
    )
    expect(fetchNewApiChannelKeyMock).not.toHaveBeenCalled()
    expect(openVerification).toHaveBeenCalledWith({
      kind: "channel",
      label: "Channel A",
      config: BASE_PARAMS.config,
      initialSessionResult: {
        status: "login-2fa-required",
        automaticAttempted: false,
      },
      onVerified: expect.any(Function),
    })
    expect(setKey).not.toHaveBeenCalled()
  })

  it("skips the session preflight when the verified window is already active", async () => {
    isNewApiVerifiedSessionActiveMock.mockReturnValue(true)
    fetchNewApiChannelKeyMock.mockResolvedValue("hidden-channel-key")

    const setKey = vi.fn()
    const openVerification = vi.fn()

    const loaded = await loadNewApiChannelKeyWithVerification({
      ...BASE_PARAMS,
      setKey,
      openVerification,
    })

    expect(loaded).toBe(true)
    expect(ensureNewApiManagedSessionMock).not.toHaveBeenCalled()
    expect(fetchNewApiChannelKeyMock).toHaveBeenCalledWith({
      baseUrl: BASE_PARAMS.config.baseUrl,
      userId: BASE_PARAMS.config.userId,
      channelId: BASE_PARAMS.channelId,
    })
    expect(setKey).toHaveBeenCalledWith("hidden-channel-key")
    expect(openVerification).not.toHaveBeenCalled()
  })
})
