import { describe, expect, it, vi } from "vitest"

import { loadNewApiChannelKeyWithVerification } from "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"

const { fetchNewApiChannelKeyMock } = vi.hoisted(() => ({
  fetchNewApiChannelKeyMock: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/newApiSession", () => ({
  NewApiChannelKeyRequirementError: class NewApiChannelKeyRequirementError extends Error {
    constructor(
      public kind: string,
      public sessionResult?: Record<string, unknown>,
    ) {
      super(kind)
      this.name = "NewApiChannelKeyRequirementError"
    }
  },
  fetchNewApiChannelKey: (...args: unknown[]) =>
    fetchNewApiChannelKeyMock(...args),
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
  it("opens verification from the requirement result returned by the provider layer", async () => {
    const { NewApiChannelKeyRequirementError } = await import(
      "~/services/managedSites/providers/newApiSession"
    )
    fetchNewApiChannelKeyMock.mockRejectedValue(
      new NewApiChannelKeyRequirementError("login-required", {
        status: "login-2fa-required",
        automaticAttempted: false,
      }),
    )

    const setKey = vi.fn()
    const openVerification = vi.fn()

    const loaded = await loadNewApiChannelKeyWithVerification({
      ...BASE_PARAMS,
      setKey,
      openVerification,
    })

    expect(loaded).toBe(false)
    expect(fetchNewApiChannelKeyMock).toHaveBeenCalledWith({
      baseUrl: BASE_PARAMS.config.baseUrl,
      userId: BASE_PARAMS.config.userId,
      username: BASE_PARAMS.config.username,
      password: BASE_PARAMS.config.password,
      totpSecret: BASE_PARAMS.config.totpSecret,
      channelId: BASE_PARAMS.channelId,
    })
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

  it("passes session credentials through to the provider-layer key loader", async () => {
    fetchNewApiChannelKeyMock.mockResolvedValue("hidden-channel-key")

    const setKey = vi.fn()
    const openVerification = vi.fn()

    const loaded = await loadNewApiChannelKeyWithVerification({
      ...BASE_PARAMS,
      setKey,
      openVerification,
    })

    expect(loaded).toBe(true)
    expect(fetchNewApiChannelKeyMock).toHaveBeenCalledWith({
      baseUrl: BASE_PARAMS.config.baseUrl,
      userId: BASE_PARAMS.config.userId,
      username: BASE_PARAMS.config.username,
      password: BASE_PARAMS.config.password,
      totpSecret: BASE_PARAMS.config.totpSecret,
      channelId: BASE_PARAMS.channelId,
    })
    expect(setKey).toHaveBeenCalledWith("hidden-channel-key")
    expect(openVerification).not.toHaveBeenCalled()
  })

  it("opens the verification dialog with localized guidance when temp-window rollback is impossible", async () => {
    fetchNewApiChannelKeyMock.mockRejectedValue(
      new ApiError(
        "raw browser window error",
        undefined,
        undefined,
        API_ERROR_CODES.TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE,
      ),
    )

    const setKey = vi.fn()
    const openVerification = vi.fn()

    const loaded = await loadNewApiChannelKeyWithVerification({
      ...BASE_PARAMS,
      setKey,
      openVerification,
    })

    expect(loaded).toBe(false)
    expect(openVerification).toHaveBeenCalledWith({
      kind: "channel",
      label: "Channel A",
      config: BASE_PARAMS.config,
      initialSessionResult: undefined,
      initialFailureMessage: "messages:background.windowCreationUnavailable",
      onVerified: expect.any(Function),
    })
    expect(setKey).not.toHaveBeenCalled()
  })
})
