import { beforeEach, describe, expect, it, vi } from "vitest"

import { loadNewApiChannelKeyWithVerification } from "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"

const { fetchNewApiChannelKeyMock, withProtectionBypassUserCommandMock } =
  vi.hoisted(() => ({
    fetchNewApiChannelKeyMock: vi.fn(),
    withProtectionBypassUserCommandMock: vi.fn(
      async (command, surface, work) =>
        await work({
          version: 2,
          kind: "user_command",
          command,
          surface,
        }),
    ),
  }))

vi.mock("~/services/protectionBypass/client", () => ({
  withProtectionBypassUserCommand: withProtectionBypassUserCommandMock,
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
  command: PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
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
  beforeEach(() => {
    fetchNewApiChannelKeyMock.mockReset()
    withProtectionBypassUserCommandMock.mockClear()
  })

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
      protectionBypassExecution: expect.any(Object),
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
      protectionBypassExecution: expect.objectContaining({
        kind: "user_command",
        command: "manage_site_channels",
        surface: "options",
      }),
    })
    expect(setKey).toHaveBeenCalledWith("hidden-channel-key")
    expect(openVerification).not.toHaveBeenCalled()
  })

  it("creates fresh verification intent when delayed onVerified work resumes", async () => {
    const { NewApiChannelKeyRequirementError } = await import(
      "~/services/managedSites/providers/newApiSession"
    )
    fetchNewApiChannelKeyMock
      .mockRejectedValueOnce(
        new NewApiChannelKeyRequirementError("secure-verification-required"),
      )
      .mockResolvedValueOnce("hidden-channel-key")
    const openVerification = vi.fn()

    await loadNewApiChannelKeyWithVerification({
      ...BASE_PARAMS,
      setKey: vi.fn(),
      openVerification,
    })
    const onVerified = openVerification.mock.calls[0]?.[0]?.onVerified
    await onVerified()

    expect(withProtectionBypassUserCommandMock).toHaveBeenCalledTimes(2)
    expect(withProtectionBypassUserCommandMock).toHaveBeenNthCalledWith(
      1,
      "manage_site_channels",
      "options",
      expect.any(Function),
    )
    expect(withProtectionBypassUserCommandMock).toHaveBeenNthCalledWith(
      2,
      "manage_site_channels",
      "options",
      expect.any(Function),
    )
    const executions = fetchNewApiChannelKeyMock.mock.calls.map(
      ([params]) => params.protectionBypassExecution,
    )
    expect(executions[0]).not.toBe(executions[1])
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
