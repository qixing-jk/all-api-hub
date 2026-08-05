import type { FormEvent } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CHANNEL_DIALOG_MUTATION_RESULTS } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import {
  useChannelForm,
  type ChannelResourceEditContext,
} from "~/components/dialogs/ChannelDialog/hooks/useChannelForm"
import { DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS } from "~/constants/claudeCodeHub"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import type {
  ChannelFormData,
  CreateChannelPayload,
  ManagedSiteChannel,
} from "~/types/managedSite"
import type { ManagedUpstreamResourceDetail } from "~/types/managedUpstreamResource"
import { testI18n } from "~~/tests/test-utils/i18n"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => loggerMocks,
}))

const buildManagedSiteChannel = (
  overrides: Partial<ManagedSiteChannel> = {},
): ManagedSiteChannel =>
  ({
    id: 1,
    type: ChannelType.OpenAI,
    key: "channel-key",
    name: "Alpha",
    base_url: "https://source.example.com",
    models: "gpt-4o",
    status: 1,
    weight: 0,
    priority: 0,
    openai_organization: null,
    test_model: null,
    created_time: 0,
    test_time: 0,
    response_time: 0,
    other: "",
    balance: 0,
    balance_updated_time: 0,
    group: "default",
    used_quota: 0,
    model_mapping: "",
    status_code_mapping: "",
    auto_ban: 0,
    other_info: "",
    tag: null,
    param_override: null,
    header_override: null,
    remark: null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: 0,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    setting: "",
    settings: "",
    ...overrides,
  }) satisfies ManagedSiteChannel

describe("useChannelForm", () => {
  const mockCheckValidConfig = vi.fn()
  const mockGetConfig = vi.fn()
  const mockBuildChannelPayload = vi.fn()
  const mockCreateChannel = vi.fn()
  const mockUpdateChannel = vi.fn()
  const mockFetchSiteUserGroups = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.NEW_API,
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(false),
      getConfig: mockGetConfig,
      fetchSiteUserGroups: mockFetchSiteUserGroups.mockResolvedValue([
        "default",
      ]),
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
      listChannels: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        type_counts: {},
      }),
    } as any)
  })

  it("requires at least one model before an add form becomes submittable", async () => {
    const onClose = vi.fn()
    const preventDefault = vi.fn()

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("")
    })

    await act(async () => {
      result.current.updateField("name", "Alpha")
      result.current.updateField("key", "sk-test")
    })

    expect(result.current.isFormValid).toBe(false)

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(mockBuildChannelPayload).not.toHaveBeenCalled()
    expect(mockCreateChannel).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "channelDialog:validation.modelsRequired",
    )

    await act(async () => {
      result.current.updateField("models", ["gpt-4o"])
    })

    expect(result.current.isFormValid).toBe(true)
  })

  it("falls back to cloned default groups when an existing channel group is empty", async () => {
    const channel = buildManagedSiteChannel({
      group: "",
    })
    const onClose = vi.fn()

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.VIEW,
        channel,
        isOpen: true,
        onClose,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("Alpha")
    })

    expect(result.current.formData.groups).toEqual(
      DEFAULT_CHANNEL_FIELDS.groups,
    )
    expect(result.current.formData.groups).not.toBe(
      DEFAULT_CHANNEL_FIELDS.groups,
    )
  })

  it("loads groups with access-token managed-site auth", async () => {
    mockCheckValidConfig.mockResolvedValue(true)
    mockGetConfig.mockResolvedValue({
      baseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      userId: "42",
    })
    mockFetchSiteUserGroups.mockResolvedValue(["vip"])

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.availableGroups).toEqual([
        { label: "vip", value: "vip" },
        { label: "default", value: "default" },
      ])
    })

    expect(mockFetchSiteUserGroups).toHaveBeenCalledWith({
      baseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      userId: "42",
    })
  })

  it("loads groups through Octopus service config", async () => {
    const octopusConfig = {
      baseUrl: "https://octopus.example.com",
      username: "admin",
      password: "password",
    }
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.OCTOPUS,
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(true),
      getConfig: mockGetConfig.mockResolvedValue(octopusConfig),
      fetchSiteUserGroups: mockFetchSiteUserGroups.mockResolvedValue([
        "shared",
      ]),
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.availableGroups).toEqual([
        { label: "shared", value: "shared" },
        { label: "default", value: "default" },
      ])
    })

    expect(mockFetchSiteUserGroups).toHaveBeenCalledWith(octopusConfig)
  })

  it("treats handleSubmit as a no-op in view mode", async () => {
    const channel = buildManagedSiteChannel()
    const onClose = vi.fn()
    const preventDefault = vi.fn()

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.VIEW,
        channel,
        isOpen: true,
        onClose,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("Alpha")
    })

    vi.mocked(getManagedSiteService).mockClear()
    mockGetConfig.mockClear()
    mockBuildChannelPayload.mockClear()
    mockCreateChannel.mockClear()
    mockUpdateChannel.mockClear()

    await result.current.handleSubmit({
      preventDefault,
    } as unknown as FormEvent)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(getManagedSiteService).not.toHaveBeenCalled()
    expect(mockGetConfig).not.toHaveBeenCalled()
    expect(mockBuildChannelPayload).not.toHaveBeenCalled()
    expect(mockCreateChannel).not.toHaveBeenCalled()
    expect(mockUpdateChannel).not.toHaveBeenCalled()
  })

  it("preserves AxonHub string channel types and skips New API group loading", async () => {
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.AXON_HUB,
      messagesKey: "axonhub",
      checkValidConfig: mockCheckValidConfig,
      getConfig: mockGetConfig,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)

    const channel = buildManagedSiteChannel({
      type: "anthropic_aws",
      group: "",
    })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.type).toBe("anthropic_aws")
    })

    expect(result.current.isBaseUrlRequired).toBe(true)
    expect(result.current.availableGroups).toEqual([])
    expect(mockCheckValidConfig).not.toHaveBeenCalled()
    expect(mockGetConfig).not.toHaveBeenCalled()

    await act(async () => {
      result.current.handleTypeChange("custom-provider")
    })

    expect(result.current.formData.type).toBe("custom-provider")
  })

  it("does not require base_url for incidental string types outside AxonHub", async () => {
    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("")
    })

    await act(async () => {
      result.current.handleTypeChange("custom-provider")
    })

    expect(result.current.formData.type).toBe("custom-provider")
    expect(result.current.isBaseUrlRequired).toBe(false)
  })

  it("adds a fallback success message when channel creation succeeds with an empty message", async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const preventDefault = vi.fn()

    mockGetConfig.mockResolvedValue({
      baseUrl: "https://managed.example.com",
      token: "admin-token",
      userId: "1",
    })
    mockBuildChannelPayload.mockReturnValue({
      mode: "single",
      channel: {
        name: "Alpha",
        type: ChannelType.OpenAI,
        key: "sk-test",
        base_url: "https://source.example.com",
        models: "gpt-4o",
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      },
    } satisfies CreateChannelPayload)
    mockCreateChannel.mockResolvedValue({
      outcome: "succeeded",
      data: null,
      confirmedEffects: [
        { kind: "resource-created", resourceKind: "channel", resourceId: 7 },
      ],
    })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("")
    })

    await act(async () => {
      result.current.updateField("name", "Alpha")
      result.current.updateField("key", "sk-test")
      result.current.updateField("models", ["gpt-4o"])
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(mockBuildChannelPayload).toHaveBeenCalled()
    expect(mockCreateChannel).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "managedSiteChannels:toasts.channelSaved",
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("reports an opt-in channel creation outcome after the create request succeeds", async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const onMutationOutcome = vi.fn()
    const preventDefault = vi.fn()

    mockGetConfig.mockResolvedValue({
      baseUrl: "https://managed.example.com",
      token: "admin-token",
      userId: "1",
    })
    mockBuildChannelPayload.mockReturnValue({
      mode: "single",
      channel: {
        name: "Alpha",
        type: ChannelType.OpenAI,
        key: "sk-test",
        base_url: "https://source.example.com",
        models: "gpt-4o",
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      },
    } satisfies CreateChannelPayload)
    mockCreateChannel.mockResolvedValue({
      outcome: "succeeded",
      data: null,
      confirmedEffects: [
        { kind: "resource-created", resourceKind: "channel", resourceId: 7 },
      ],
    })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
        onSuccess,
        onMutationOutcome,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("")
    })

    await act(async () => {
      result.current.updateField("name", "Alpha")
      result.current.updateField("key", "sk-test")
      result.current.updateField("models", ["gpt-4o"])
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(onMutationOutcome).toHaveBeenCalledWith({
      mode: DIALOG_MODES.ADD,
      result: CHANNEL_DIALOG_MUTATION_RESULTS.Success,
      siteType: SITE_TYPES.NEW_API,
    })
  })

  it("reports an opt-in channel update failure when the update request is rejected", async () => {
    const onMutationOutcome = vi.fn()
    const preventDefault = vi.fn()
    const channel = buildManagedSiteChannel()

    mockGetConfig.mockResolvedValue({
      baseUrl: "https://managed.example.com",
      token: "admin-token",
      userId: "1",
    })
    mockUpdateChannel.mockResolvedValue({
      outcome: "rejected",
      diagnostic: { message: "Update failed" },
    })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
        onMutationOutcome,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("Alpha")
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(onMutationOutcome).toHaveBeenCalledWith({
      mode: DIALOG_MODES.EDIT,
      result: CHANNEL_DIALOG_MUTATION_RESULTS.Failure,
      siteType: SITE_TYPES.NEW_API,
    })
  })

  it("keeps an ordinary create form reusable and redacts config and payload secrets after rejection", async () => {
    const adminToken = "admin-token-placeholder"
    const password = "password-placeholder"
    const totpSecret = "totp-secret-placeholder"
    const payloadSecret = "payload-secret-placeholder"
    const config = {
      baseUrl: "https://managed.example.invalid",
      adminToken,
      password,
      totpSecret,
      userId: "1",
    }
    const payload = {
      mode: "single" as const,
      channel: {
        name: "Alpha",
        key: payloadSecret,
        models: "model-example",
        groups: ["default"],
        group: "default",
        status: 1 as const,
      },
    }
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const translationSpy = vi.spyOn(testI18n, "t")
    mockGetConfig.mockResolvedValue(config)
    mockBuildChannelPayload.mockReturnValue(payload)
    mockCreateChannel
      .mockImplementationOnce(async () => {
        config.adminToken = "mutated-admin-token"
        config.password = "mutated-password"
        config.totpSecret = "mutated-totp-secret"
        payload.channel.key = "mutated-payload-secret"
        return {
          outcome: "rejected",
          diagnostic: {
            code: "UPSTREAM_REJECTED",
            message: `Provider rejected ${adminToken} ${password} ${totpSecret} ${payloadSecret}`,
          },
        }
      })
      .mockResolvedValueOnce({
        outcome: "succeeded",
        data: null,
        confirmedEffects: [
          {
            kind: "resource-created",
            resourceKind: "channel",
            resourceId: 7,
          },
        ],
      })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )
    await waitFor(() => expect(result.current.formData.name).toBe(""))
    await act(async () => {
      result.current.updateField("name", "Alpha")
      result.current.updateField("key", payloadSecret)
      result.current.updateField("models", ["model-example"])
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(result.current.formData.name).toBe("Alpha")
    const translationCalls = JSON.stringify(translationSpy.mock.calls)
    expect(translationCalls).toContain("Provider rejected")
    expect(translationCalls).not.toContain(adminToken)
    expect(translationCalls).not.toContain(password)
    expect(translationCalls).not.toContain(totpSecret)
    expect(translationCalls).not.toContain(payloadSecret)
    expect(loggerMocks.error).not.toHaveBeenCalledWith(
      "Save failed",
      expect.anything(),
    )

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })

    expect(mockCreateChannel).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("reconciles and closes before propagating a malformed ordinary mutation", async () => {
    const onClose = vi.fn()
    const onMutationOutcome = vi.fn()
    const listChannels = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    })
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
      checkValidConfig: mockCheckValidConfig,
      getConfig: mockGetConfig,
      fetchSiteUserGroups: mockFetchSiteUserGroups,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
      listChannels,
    } as any)
    mockGetConfig.mockResolvedValue({
      baseUrl: "https://managed.example.invalid",
      token: "admin-token-placeholder",
      userId: "1",
    })
    mockBuildChannelPayload.mockReturnValue({
      mode: "single",
      channel: {
        name: "Alpha",
        key: "payload-secret-placeholder",
        models: "model-example",
        groups: ["default"],
        group: "default",
        status: 1,
      },
    })
    mockCreateChannel.mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
        onMutationOutcome,
      }),
    )
    await waitFor(() => expect(result.current.formData.name).toBe(""))
    await act(async () => {
      result.current.updateField("name", "Alpha")
      result.current.updateField("key", "payload-secret-placeholder")
      result.current.updateField("models", ["model-example"])
    })

    let caught: unknown
    await act(async () => {
      try {
        await result.current.handleSubmit({
          preventDefault: vi.fn(),
        } as unknown as FormEvent)
      } catch (error) {
        caught = error
      }
    })
    expect(caught).toMatchObject({
      message: "Invalid managed site mutation result",
    })

    expect(mockCreateChannel).toHaveBeenCalledOnce()
    expect(listChannels).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    expect(result.current.formData.name).toBe("")
    expect(onMutationOutcome).not.toHaveBeenCalled()
  })

  it("sanitizes a pre-dispatch payload builder failure and keeps the form reusable", async () => {
    const adminToken = "builder-admin-token-placeholder"
    const password = "builder-password-placeholder"
    const totpSecret = "builder-totp-placeholder"
    const draftSecret = "builder-draft-secret-placeholder"
    const providerText = "Provider payload builder failed"
    const config = {
      baseUrl: "https://managed.example.invalid",
      adminToken,
      password,
      totpSecret,
      userId: "1",
    }
    mockGetConfig.mockResolvedValue(config)
    mockBuildChannelPayload.mockImplementation(() => {
      config.adminToken = "mutated-after-snapshot"
      throw new Error(
        `${providerText} ${adminToken} ${password} ${totpSecret} ${draftSecret}`,
        { cause: new Error(`cause ${draftSecret}`) },
      )
    })
    const translationSpy = vi.spyOn(testI18n, "t")
    const onClose = vi.fn()
    const onMutationOutcome = vi.fn()
    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
        onMutationOutcome,
      }),
    )
    await waitFor(() => expect(result.current.formData.name).toBe(""))
    await act(async () => {
      result.current.updateField("name", "Builder failure")
      result.current.updateField("key", draftSecret)
      result.current.updateField("models", ["model-example"])
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })

    expect(mockCreateChannel).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(result.current.formData.name).toBe("Builder failure")
    expect(result.current.isFormValid).toBe(true)
    expect(onMutationOutcome).toHaveBeenCalledWith({
      mode: DIALOG_MODES.ADD,
      result: CHANNEL_DIALOG_MUTATION_RESULTS.Failure,
      siteType: SITE_TYPES.NEW_API,
    })
    const disclosed = JSON.stringify([
      translationSpy.mock.calls,
      vi.mocked(toast.error).mock.calls,
      loggerMocks.error.mock.calls.map(([message, error]) => [
        message,
        error instanceof Error ? error.message : error,
      ]),
    ])
    expect(disclosed).toContain(providerText)
    expect(disclosed).not.toContain(adminToken)
    expect(disclosed).not.toContain(password)
    expect(disclosed).not.toContain(totpSecret)
    expect(disclosed).not.toContain(draftSecret)
    expect(disclosed).not.toContain("cause")
  })

  it("reconciles and closes before propagating a thrown ordinary mutation unchanged", async () => {
    const adminToken = "thrown-admin-token-placeholder"
    const password = "thrown-password-placeholder"
    const totpSecret = "thrown-totp-placeholder"
    const payloadSecret = "thrown-payload-secret-placeholder"
    const providerText = "Provider write exploded"
    const config = {
      baseUrl: "https://managed.example.invalid",
      adminToken,
      password,
      totpSecret,
      userId: "1",
    }
    const payload = {
      mode: "single" as const,
      channel: {
        name: "Alpha",
        key: payloadSecret,
        models: "model-example",
        groups: ["default"],
        group: "default",
        status: 1 as const,
      },
    }
    const listChannels = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    })
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
      checkValidConfig: mockCheckValidConfig,
      getConfig: mockGetConfig,
      fetchSiteUserGroups: mockFetchSiteUserGroups,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
      listChannels,
    } as any)
    mockGetConfig.mockResolvedValue(config)
    mockBuildChannelPayload.mockReturnValue(payload)
    const thrown = new Error(
      `${providerText} ${adminToken} ${password} ${totpSecret} ${payloadSecret}`,
      { cause: new Error(`cause ${payloadSecret}`) },
    )
    mockCreateChannel.mockImplementation(async () => {
      config.adminToken = "mutated-admin-token"
      config.password = "mutated-password"
      config.totpSecret = "mutated-totp"
      payload.channel.key = "mutated-payload-secret"
      throw thrown
    })
    const translationSpy = vi.spyOn(testI18n, "t")
    const onClose = vi.fn()
    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
      }),
    )
    await waitFor(() => expect(result.current.formData.name).toBe(""))
    await act(async () => {
      result.current.updateField("name", "Alpha")
      result.current.updateField("key", payloadSecret)
      result.current.updateField("models", ["model-example"])
    })

    let caught: unknown
    await act(async () => {
      try {
        await result.current.handleSubmit({
          preventDefault: vi.fn(),
        } as unknown as FormEvent)
      } catch (error) {
        caught = error
      }
    })
    expect(caught).toBe(thrown)

    expect(mockCreateChannel).toHaveBeenCalledOnce()
    expect(listChannels).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    expect(result.current.formData.name).toBe("")
    const disclosed = JSON.stringify([
      translationSpy.mock.calls,
      vi.mocked(toast.error).mock.calls,
      loggerMocks.error.mock.calls,
    ])
    expect(disclosed).not.toContain(providerText)
    expect(disclosed).not.toContain(adminToken)
    expect(disclosed).not.toContain(password)
    expect(disclosed).not.toContain(totpSecret)
    expect(disclosed).not.toContain(payloadSecret)
  })

  it("reconciles before propagating a thrown mutation unchanged when inspection is incomplete", async () => {
    const hiddenSecret = "thrown-incomplete-config-secret-placeholder"
    const providerText = `Provider private throw ${hiddenSecret}`
    const config = new Proxy(
      {
        baseUrl: "https://managed.example.invalid",
        adminToken: "admin-token-placeholder",
        totpSecret: hiddenSecret,
        userId: "1",
      },
      {
        ownKeys() {
          throw new Error("config inspection unavailable")
        },
      },
    )
    const listChannels = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    })
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
      checkValidConfig: mockCheckValidConfig,
      getConfig: mockGetConfig,
      fetchSiteUserGroups: mockFetchSiteUserGroups,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
      listChannels,
    } as any)
    mockGetConfig.mockResolvedValue(config)
    mockBuildChannelPayload.mockReturnValue({
      mode: "single",
      channel: {
        name: "Alpha",
        key: "payload-secret-placeholder",
        models: "model-example",
        groups: ["default"],
        group: "default",
        status: 1,
      },
    })
    const thrown = new Error(providerText)
    mockCreateChannel.mockRejectedValue(thrown)
    const translationSpy = vi.spyOn(testI18n, "t")
    const onClose = vi.fn()
    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
      }),
    )
    await waitFor(() => expect(result.current.formData.name).toBe(""))
    await act(async () => {
      result.current.updateField("name", "Alpha")
      result.current.updateField("key", "payload-secret-placeholder")
      result.current.updateField("models", ["model-example"])
    })

    let caught: unknown
    await act(async () => {
      try {
        await result.current.handleSubmit({
          preventDefault: vi.fn(),
        } as unknown as FormEvent)
      } catch (error) {
        caught = error
      }
    })
    expect(caught).toBe(thrown)

    expect(mockCreateChannel).toHaveBeenCalledOnce()
    expect(listChannels).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    const disclosed = JSON.stringify([
      translationSpy.mock.calls,
      vi.mocked(toast.error).mock.calls,
      loggerMocks.error.mock.calls,
    ])
    expect(disclosed).not.toContain(providerText)
    expect(disclosed).not.toContain(hiddenSecret)
  })

  it("uses only fallback feedback when ordinary payload secrets cannot be collected completely", async () => {
    const hiddenSecret = "ordinary-hidden-secret-placeholder"
    const providerText = `Provider rejected ${hiddenSecret}`
    const onClose = vi.fn()
    mockGetConfig.mockResolvedValue({
      baseUrl: "https://managed.example.invalid",
      token: "admin-token-placeholder",
      userId: "1",
    })
    mockBuildChannelPayload.mockReturnValue(
      new Proxy(
        {
          mode: "single",
          channel: {
            name: "Alpha",
            key: hiddenSecret,
            models: "model-example",
            groups: ["default"],
            group: "default",
            status: 1,
          },
        },
        {
          ownKeys() {
            throw new Error("payload inspection unavailable")
          },
        },
      ),
    )
    mockCreateChannel.mockResolvedValue({
      outcome: "rejected",
      diagnostic: { message: providerText },
    })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
      }),
    )
    await waitFor(() => expect(result.current.formData.name).toBe(""))
    await act(async () => {
      result.current.updateField("name", "Alpha")
      result.current.updateField("key", hiddenSecret)
      result.current.updateField("models", ["model-example"])
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(toast.error).mock.calls)).not.toContain(
      providerText,
    )
    expect(JSON.stringify(loggerMocks.error.mock.calls)).not.toContain(
      hiddenSecret,
    )
    expect(loggerMocks.error).not.toHaveBeenCalledWith(
      "Save failed",
      expect.anything(),
    )
  })

  it("suppresses ordinary provider feedback when config secret inspection is incomplete", async () => {
    const hiddenSecret = "incomplete-config-totp-placeholder"
    const providerText = `Provider diagnostic ${hiddenSecret}`
    const translationSpy = vi.spyOn(testI18n, "t")
    const config = new Proxy(
      {
        baseUrl: "https://managed.example.invalid",
        adminToken: "admin-token-placeholder",
        password: "password-placeholder",
        totpSecret: hiddenSecret,
        userId: "1",
      },
      {
        ownKeys() {
          throw new Error("config inspection unavailable")
        },
      },
    )
    const onClose = vi.fn()
    mockGetConfig.mockResolvedValue(config)
    mockBuildChannelPayload.mockReturnValue({
      mode: "single",
      channel: {
        name: "Alpha",
        key: "payload-secret-placeholder",
        models: "model-example",
        groups: ["default"],
        group: "default",
        status: 1,
      },
    })
    mockCreateChannel.mockResolvedValue({
      outcome: "rejected",
      diagnostic: { message: providerText },
    })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
      }),
    )
    await waitFor(() => expect(result.current.formData.name).toBe(""))
    await act(async () => {
      result.current.updateField("name", "Alpha")
      result.current.updateField("key", "payload-secret-placeholder")
      result.current.updateField("models", ["model-example"])
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(JSON.stringify(translationSpy.mock.calls)).not.toContain(
      providerText,
    )
    expect(loggerMocks.error).not.toHaveBeenCalledWith(
      "Save failed",
      expect.anything(),
    )
  })

  it.each(["partial", "uncertain"] as const)(
    "reconciles and closes an ordinary form after a %s create without replaying it",
    async (outcome) => {
      const listChannels = vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        type_counts: {},
      })
      vi.mocked(getManagedSiteService).mockResolvedValue({
        siteType: SITE_TYPES.NEW_API,
        messagesKey: "newapi",
        checkValidConfig: mockCheckValidConfig,
        getConfig: mockGetConfig,
        fetchSiteUserGroups: mockFetchSiteUserGroups,
        buildChannelPayload: mockBuildChannelPayload,
        createChannel: mockCreateChannel,
        updateChannel: mockUpdateChannel,
        listChannels,
      } as any)
      mockGetConfig.mockResolvedValue({
        baseUrl: "https://managed.example.invalid",
        token: "admin-token-placeholder",
        userId: "1",
      })
      mockBuildChannelPayload.mockReturnValue({
        mode: "single",
        channel: {
          name: "Alpha",
          key: "payload-secret-placeholder",
          models: "model-example",
          groups: ["default"],
          group: "default",
          status: 1,
        },
      })
      mockCreateChannel.mockResolvedValue(
        outcome === "partial"
          ? {
              outcome,
              confirmedEffects: [
                {
                  kind: "resource-created",
                  resourceKind: "channel",
                  resourceId: 7,
                },
              ],
              completion: "uncertain",
              diagnostic: { message: "Creation state is ambiguous" },
            }
          : {
              outcome,
              diagnostic: { message: "Creation state is ambiguous" },
            },
      )
      const onClose = vi.fn()
      const onSuccess = vi.fn()
      const onMutationOutcome = vi.fn()
      const { result } = renderHook(() =>
        useChannelForm({
          mode: DIALOG_MODES.ADD,
          channel: null,
          isOpen: true,
          onClose,
          onSuccess,
          onMutationOutcome,
        }),
      )
      await waitFor(() => expect(result.current.formData.name).toBe(""))
      await act(async () => {
        result.current.updateField("name", "Alpha")
        result.current.updateField("key", "payload-secret-placeholder")
        result.current.updateField("models", ["model-example"])
      })

      await act(async () => {
        await result.current.handleSubmit({
          preventDefault: vi.fn(),
        } as unknown as FormEvent)
      })

      expect(mockCreateChannel).toHaveBeenCalledOnce()
      expect(listChannels).toHaveBeenCalledOnce()
      expect(onSuccess).not.toHaveBeenCalled()
      expect(onClose).toHaveBeenCalledOnce()
      expect(onMutationOutcome).toHaveBeenCalledWith({
        mode: DIALOG_MODES.ADD,
        result: CHANNEL_DIALOG_MUTATION_RESULTS.Failure,
        siteType: SITE_TYPES.NEW_API,
      })
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "channelDialog:messages.saveFailed",
      )
      expect(loggerMocks.error).not.toHaveBeenCalledWith(
        "Save failed",
        expect.anything(),
      )

      await act(async () => {
        await result.current.handleSubmit({
          preventDefault: vi.fn(),
        } as unknown as FormEvent)
      })
      expect(mockCreateChannel).toHaveBeenCalledOnce()
    },
  )

  it("waits for resource detail before allowing a resource-backed update", async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const preventDefault = vi.fn()
    const channel = buildManagedSiteChannel({
      id: 32,
      name: "List Name",
      key: "sk-********",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.com",
          resourceId: "32",
        },
        displayName: "Detail Name",
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: buildManagedSiteChannel({
        id: 32,
        name: "Detail Name",
        key: "sk-********",
        model_mapping: '{"gpt-4o":"mapped-gpt-4o"}',
      }),
    } as const
    let resolveDetail: (value: typeof detail) => void = () => {}
    const getDetail = vi.fn(
      () =>
        new Promise<typeof detail>((resolve) => {
          resolveDetail = resolve
        }),
    )
    const update = vi.fn().mockResolvedValue({
      outcome: "succeeded",
      message: "",
      data: null,
      confirmedEffects: [
        { kind: "resource-updated", resourceKind: "channel", resourceId: 32 },
      ],
    })
    const prepareEditDraft = vi.fn(
      (): ChannelFormData => ({
        name: "Detail Name",
        type: ChannelType.OpenAI,
        key: "sk-********",
        base_url: "https://source.example.com",
        models: ["gpt-4o"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      }),
    )
    const describeFields = vi.fn(() => [
      { name: "name", label: "Name", type: "text" as const, required: true },
    ])
    const config = {
      baseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      userId: "1",
    }
    const resourceEdit = {
      config,
      ref: detail.summary.ref,
      capabilities: {
        items: {
          getDetail,
          update,
        },
        drafts: {
          prepareEditDraft,
          describeFields,
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    }

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose,
        onSuccess,
        resourceEdit,
      }),
    )

    await waitFor(() => {
      expect(getDetail).toHaveBeenCalledWith(config, detail.summary.ref)
    })
    expect(result.current.isFormValid).toBe(false)

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(update).not.toHaveBeenCalled()
    expect(mockUpdateChannel).not.toHaveBeenCalled()

    await act(async () => {
      resolveDetail(detail)
    })

    await waitFor(() => {
      expect(result.current.formData.name).toBe("Detail Name")
      expect(result.current.isFormValid).toBe(true)
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(update).toHaveBeenCalledWith(
      config,
      detail,
      expect.objectContaining({
        name: "Detail Name",
        key: "sk-********",
      }),
    )
    expect(mockUpdateChannel).not.toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "managedSiteChannels:toasts.channelUpdated",
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it.each(["rejected", "partial", "uncertain"] as const)(
    "does not replay a %s resource-backed update and reconciles ambiguous outcomes",
    async (outcome) => {
      const onClose = vi.fn()
      const onSuccess = vi.fn()
      const channel = buildManagedSiteChannel({ id: 36 })
      const detail: ManagedUpstreamResourceDetail<ManagedSiteChannel> = {
        summary: {
          ref: {
            managedSiteType: SITE_TYPES.NEW_API,
            scopeKey: "https://managed.example.com",
            resourceId: "36",
          },
          displayName: "Example Channel",
          nativeKind: "channel",
          status: "enabled",
          secretState: "masked",
          capabilities: { canUpdate: true },
        },
        native: channel,
      }
      const getDetail = vi.fn().mockResolvedValue(detail)
      const mutationResult =
        outcome === "rejected"
          ? {
              outcome,
              diagnostic: { message: `${outcome} resource write` },
            }
          : outcome === "partial"
            ? {
                outcome,
                confirmedEffects: [
                  {
                    kind: "resource-updated" as const,
                    resourceKind: "channel" as const,
                    resourceId: 36,
                  },
                ],
                completion: "uncertain" as const,
                diagnostic: { message: `${outcome} resource write` },
              }
            : {
                outcome,
                diagnostic: { message: `${outcome} resource write` },
              }
      const update = vi.fn().mockResolvedValue(mutationResult)
      const resourceEdit: ChannelResourceEditContext = {
        config: {
          baseUrl: "https://managed.example.com",
          adminToken: "admin-token",
          userId: "1",
        },
        ref: detail.summary.ref,
        capabilities: {
          items: { getDetail, update },
          drafts: {
            prepareEditDraft: vi.fn(() => ({
              name: "Example Channel",
              type: ChannelType.OpenAI,
              key: "sk-********",
              base_url: "https://source.example.com",
              models: ["gpt-4o"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              status: 1 as const,
            })),
            describeFields: vi.fn(() => []),
            validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
          },
        },
      }

      const { result } = renderHook(() =>
        useChannelForm({
          mode: DIALOG_MODES.EDIT,
          channel,
          isOpen: true,
          onClose,
          onSuccess,
          resourceEdit,
        }),
      )

      await waitFor(() => expect(result.current.isFormValid).toBe(true))
      await act(async () => {
        await result.current.handleSubmit({
          preventDefault: vi.fn(),
        } as unknown as FormEvent)
      })

      expect(update).toHaveBeenCalledOnce()
      expect(getDetail).toHaveBeenCalledTimes(outcome === "rejected" ? 1 : 2)
      expect(onSuccess).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
      expect(vi.mocked(toast.error)).toHaveBeenCalled()
    },
  )

  it("blocks a second resource update when ambiguous-write reconciliation fails", async () => {
    const configSecret = "reconcile-config-secret-placeholder"
    const draftSecret = "reconcile-draft-secret-placeholder"
    const providerText = "Fresh resource read failed"
    const channel = buildManagedSiteChannel({
      id: 37,
      name: "Stale channel",
      key: draftSecret,
    })
    const detail: ManagedUpstreamResourceDetail<ManagedSiteChannel> = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.com",
          resourceId: "37",
        },
        displayName: "Stale channel",
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: channel,
    }
    const reconcileError = new Error(
      `${providerText} ${configSecret} ${draftSecret}`,
      { cause: new Error(`cause ${draftSecret}`) },
    )
    const getDetail = vi
      .fn()
      .mockResolvedValueOnce(detail)
      .mockRejectedValueOnce(reconcileError)
    const update = vi.fn().mockResolvedValue({
      outcome: "partial",
      confirmedEffects: [
        { kind: "resource-updated", resourceKind: "channel", resourceId: 37 },
      ],
      completion: "uncertain",
      diagnostic: { message: "update state unknown" },
    })
    const resourceEdit: ChannelResourceEditContext = {
      config: {
        baseUrl: "https://managed.example.com",
        adminToken: configSecret,
        userId: "1",
      },
      ref: detail.summary.ref,
      capabilities: {
        items: { getDetail, update },
        drafts: {
          prepareEditDraft: vi.fn(() => ({
            name: "Stale channel",
            type: ChannelType.OpenAI,
            key: draftSecret,
            base_url: "https://source.example.com",
            models: ["gpt-4o"],
            groups: ["default"],
            priority: 0,
            weight: 0,
            status: DEFAULT_CHANNEL_FIELDS.status,
          })),
          describeFields: vi.fn(() => []),
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    }
    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
        resourceEdit,
      }),
    )

    await waitFor(() => expect(result.current.isFormValid).toBe(true))
    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })

    expect(update).toHaveBeenCalledOnce()
    expect(result.current.isResourceEditReady).toBe(false)
    expect(result.current.isFormValid).toBe(false)
    expect(result.current.resourceEditLoadError?.message).toContain(
      providerText,
    )
    expect(result.current.resourceEditLoadError?.message).not.toContain(
      configSecret,
    )
    expect(result.current.resourceEditLoadError?.message).not.toContain(
      draftSecret,
    )
    expect(result.current.resourceEditLoadError?.message).not.toContain("cause")
    const reconciliationLog = loggerMocks.error.mock.calls.find(
      ([message]) => message === "Failed to reconcile ambiguous channel update",
    )
    expect((reconciliationLog?.[1] as Error).message).toContain(providerText)
    expect((reconciliationLog?.[1] as Error).message).not.toContain(
      configSecret,
    )
    expect((reconciliationLog?.[1] as Error).message).not.toContain(draftSecret)

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })
    expect(update).toHaveBeenCalledOnce()
  })

  it("uses only local fallback state when reconciliation secret collection is incomplete", async () => {
    const hiddenSecret = "reconcile-incomplete-secret-placeholder"
    const providerText = `Private reconciliation failure ${hiddenSecret}`
    const channel = buildManagedSiteChannel({ id: 42 })
    const detail: ManagedUpstreamResourceDetail<unknown> = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.invalid",
          resourceId: "42",
        },
        displayName: "Incomplete reconciliation channel",
        nativeKind: "channel",
        status: "enabled",
        secretState: "available",
        capabilities: { canUpdate: true },
      },
      native: new Proxy(
        { token: hiddenSecret },
        {
          ownKeys() {
            throw new Error("resource inspection unavailable")
          },
        },
      ),
    }
    const getDetail = vi
      .fn()
      .mockResolvedValueOnce(detail)
      .mockRejectedValueOnce(new Error(providerText))
    const update = vi.fn().mockResolvedValue({
      outcome: "uncertain",
      diagnostic: { message: providerText },
    })
    const resourceEdit: ChannelResourceEditContext = {
      config: {
        baseUrl: "https://managed.example.invalid",
        adminToken: "admin-token-placeholder",
        userId: "1",
      },
      ref: detail.summary.ref,
      capabilities: {
        items: { getDetail, update },
        drafts: {
          prepareEditDraft: vi.fn(() => ({
            name: "Incomplete reconciliation channel",
            type: ChannelType.OpenAI,
            key: "draft-key-placeholder",
            base_url: "https://source.example.invalid",
            models: ["gpt-4o"],
            groups: ["default"],
            priority: 0,
            weight: 0,
            status: DEFAULT_CHANNEL_FIELDS.status,
          })),
          describeFields: vi.fn(() => []),
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    }
    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
        resourceEdit,
      }),
    )

    await waitFor(() => expect(result.current.isFormValid).toBe(true))
    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })

    expect(result.current.resourceEditLoadError?.message).toBe(
      "channelDialog:messages.saveFailed",
    )
    expect(result.current.isResourceEditReady).toBe(false)
    const disclosed = JSON.stringify(
      loggerMocks.error.mock.calls.map(([message, error]) => [
        message,
        error instanceof Error ? error.message : error,
      ]),
    )
    expect(disclosed).not.toContain(providerText)
    expect(disclosed).not.toContain(hiddenSecret)
  })

  it("replaces stale resource detail and draft after ambiguous-write reconciliation", async () => {
    const staleChannel = buildManagedSiteChannel({
      id: 38,
      name: "Stale channel",
      key: "stale-key",
    })
    const freshChannel = buildManagedSiteChannel({
      id: 38,
      name: "Fresh channel",
      key: "fresh-key",
    })
    const staleDetail: ManagedUpstreamResourceDetail<ManagedSiteChannel> = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.com",
          resourceId: "38",
        },
        displayName: "Stale channel",
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: staleChannel,
    }
    const freshDetail: ManagedUpstreamResourceDetail<ManagedSiteChannel> = {
      summary: { ...staleDetail.summary, displayName: "Fresh channel" },
      native: freshChannel,
    }
    const getDetail = vi
      .fn()
      .mockResolvedValueOnce(staleDetail)
      .mockResolvedValueOnce(freshDetail)
    const update = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: "uncertain",
        diagnostic: { message: "update state unknown" },
      })
      .mockResolvedValueOnce({
        outcome: "rejected",
        diagnostic: { message: "second update rejected" },
      })
    const prepareEditDraft = vi.fn(
      (current: ManagedUpstreamResourceDetail<unknown>): ChannelFormData => {
        const native = current.native as ManagedSiteChannel
        return {
          name: native.name,
          type: native.type,
          key: native.key,
          base_url: native.base_url ?? "",
          models: native.models.split(","),
          groups: ["default"],
          priority: native.priority,
          weight: native.weight,
          status: native.status,
        }
      },
    )
    const describeFields = vi.fn(() => [])
    const resourceEdit: ChannelResourceEditContext = {
      config: {
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        userId: "1",
      },
      ref: staleDetail.summary.ref,
      capabilities: {
        items: { getDetail, update },
        drafts: {
          prepareEditDraft,
          describeFields,
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    }
    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel: staleChannel,
        isOpen: true,
        onClose: vi.fn(),
        resourceEdit,
      }),
    )

    await waitFor(() =>
      expect(result.current.formData.name).toBe("Stale channel"),
    )
    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })

    await waitFor(() =>
      expect(result.current.formData.name).toBe("Fresh channel"),
    )
    expect(result.current.formData.key).toBe("fresh-key")
    expect(prepareEditDraft).toHaveBeenLastCalledWith(freshDetail)
    expect(describeFields).toHaveBeenLastCalledWith({
      mode: "edit",
      detail: freshDetail,
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })
    expect(update).toHaveBeenNthCalledWith(
      2,
      resourceEdit.config,
      freshDetail,
      expect.objectContaining({ name: "Fresh channel", key: "fresh-key" }),
    )
  })

  it("redacts draft and preserved native secrets from resource update feedback", async () => {
    const draftSecret = "MarbleCobaltFjord927"
    const headerValue = "WillowAmberQuartz418"
    const channelProxy = "http://proxy-user:Quartz418@example.invalid:8080"
    const paramOverride = '{"api_key":"IndigoSummit563"}'
    const configSecret = "CedarIndigoSummit563"
    const diagnosticPrefix = "Provider rejected mutable resource update"
    const channel = buildManagedSiteChannel({
      id: 39,
      key: draftSecret,
      base_url: "https://source.example.invalid",
    })
    const detail: ManagedUpstreamResourceDetail<unknown> = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.OCTOPUS,
          scopeKey: "https://managed.example.invalid",
          resourceId: "39",
        },
        displayName: "Secret channel",
        nativeKind: "channel",
        status: "enabled",
        secretState: "available",
        capabilities: { canUpdate: true },
      },
      native: {
        custom_header: [
          { header_key: "X-Example-Key", header_value: headerValue },
        ],
        channel_proxy: channelProxy,
        param_override: paramOverride,
      },
    }
    const getDetail = vi
      .fn()
      .mockResolvedValueOnce(detail)
      .mockRejectedValueOnce(new Error("reconciliation unavailable"))
    const update = vi
      .fn()
      .mockImplementation(
        async (_config, mutableDetail, mutableDraft: ChannelFormData) => {
          const mutableNative = mutableDetail.native as {
            custom_header: Array<{ header_value: string }>
            channel_proxy: string
            param_override: string
          }
          mutableDraft.key = ""
          mutableNative.custom_header[0].header_value = ""
          mutableNative.channel_proxy = ""
          mutableNative.param_override = ""
          return {
            outcome: "uncertain",
            diagnostic: {
              message: `${diagnosticPrefix} ${configSecret} ${draftSecret} ${headerValue} ${channelProxy} ${paramOverride}`,
            },
          }
        },
      )
    const resourceEdit: ChannelResourceEditContext = {
      config: {
        baseUrl: "https://managed.example.invalid",
        username: "admin-placeholder",
        password: configSecret,
      },
      ref: detail.summary.ref,
      capabilities: {
        items: { getDetail, update },
        drafts: {
          prepareEditDraft: vi.fn(() => ({
            name: "Secret channel",
            type: ChannelType.OpenAI,
            key: draftSecret,
            base_url: "https://source.example.invalid",
            models: ["gpt-4o"],
            groups: ["default"],
            priority: 0,
            weight: 0,
            status: DEFAULT_CHANNEL_FIELDS.status,
          })),
          describeFields: vi.fn(() => [
            { name: "key", label: "Key", type: "secret" as const },
          ]),
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    }
    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
        resourceEdit,
      }),
    )

    await waitFor(() => expect(result.current.isFormValid).toBe(true))
    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })

    const toastPayload = JSON.stringify(vi.mocked(toast.error).mock.calls)
    const loggedError = loggerMocks.error.mock.calls.at(-1)?.[1] as Error
    expect(loggedError.message).toContain(diagnosticPrefix)
    expect(toastPayload).not.toContain(configSecret)
    expect(toastPayload).not.toContain(draftSecret)
    expect(toastPayload).not.toContain(headerValue)
    expect(toastPayload).not.toContain(channelProxy)
    expect(toastPayload).not.toContain(paramOverride)
    expect(loggedError.message).not.toContain(configSecret)
    expect(loggedError.message).not.toContain(draftSecret)
    expect(loggedError.message).not.toContain(headerValue)
    expect(loggedError.message).not.toContain(channelProxy)
    expect(loggedError.message).not.toContain(paramOverride)
  })

  it("refreshes a resource edit before propagating a thrown update unchanged", async () => {
    const configSecret = "resource-config-secret"
    const draftSecret = "resource-draft-secret"
    const diagnosticPrefix = "Provider resource transport failed"
    const config = {
      baseUrl: "https://managed.example.invalid",
      adminToken: configSecret,
      userId: "1",
    }
    const channel = buildManagedSiteChannel({ id: 41, key: draftSecret })
    const detail: ManagedUpstreamResourceDetail<ManagedSiteChannel> = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.invalid",
          resourceId: "41",
        },
        displayName: "Thrown resource channel",
        nativeKind: "channel",
        status: "enabled",
        secretState: "available",
        capabilities: { canUpdate: true },
      },
      native: channel,
    }
    const reconciledDetail: ManagedUpstreamResourceDetail<ManagedSiteChannel> =
      {
        ...detail,
        summary: {
          ...detail.summary,
          displayName: "Fresh resource channel",
        },
        native: { ...channel, name: "Fresh resource channel" },
      }
    let detailReadCount = 0
    const getDetail = vi.fn(async () => {
      detailReadCount += 1
      return detailReadCount === 1 ? detail : reconciledDetail
    })
    const thrown = new Error(
      `${diagnosticPrefix} ${configSecret} ${draftSecret}`,
      { cause: new Error(`cause ${draftSecret}`) },
    )
    const update = vi
      .fn()
      .mockImplementation(async (_config, _detail, draft) => {
        config.adminToken = "mutated-after-snapshot"
        draft.key = "mutated-draft"
        throw thrown
      })
    const resourceEdit: ChannelResourceEditContext = {
      config,
      ref: detail.summary.ref,
      capabilities: {
        items: { getDetail, update },
        drafts: {
          prepareEditDraft: vi.fn((loadedDetail) => ({
            name: (loadedDetail.native as ManagedSiteChannel).name,
            type: ChannelType.OpenAI,
            key: draftSecret,
            base_url: "https://source.example.invalid",
            models: ["gpt-4o"],
            groups: ["default"],
            priority: 0,
            weight: 0,
            status: DEFAULT_CHANNEL_FIELDS.status,
          })),
          describeFields: vi.fn(() => []),
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    }
    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
        resourceEdit,
      }),
    )

    await waitFor(() => expect(result.current.isFormValid).toBe(true))
    let caught: unknown
    await act(async () => {
      try {
        await result.current.handleSubmit({
          preventDefault: vi.fn(),
        } as unknown as FormEvent)
      } catch (error) {
        caught = error
      }
    })

    expect(caught).toBe(thrown)
    expect(update).toHaveBeenCalledOnce()
    expect(detailReadCount).toBe(2)
    const disclosed = JSON.stringify(vi.mocked(toast.error).mock.calls)
    expect(disclosed).not.toContain(diagnosticPrefix)
    expect(disclosed).not.toContain(configSecret)
    expect(disclosed).not.toContain(draftSecret)
    expect(disclosed).not.toContain("cause")
  })

  it("uses only translated fallback feedback when resource secret collection is incomplete", async () => {
    const hiddenSecret = "ui-proxy-hidden-secret-placeholder"
    const providerText = "Provider UI diagnostic must stay private"
    const channel = buildManagedSiteChannel({ id: 40 })
    const native = new Proxy(
      { token: hiddenSecret },
      {
        ownKeys() {
          throw new Error("resource inspection unavailable")
        },
      },
    )
    const detail: ManagedUpstreamResourceDetail<unknown> = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.invalid",
          resourceId: "40",
        },
        displayName: "Incomplete secret channel",
        nativeKind: "channel",
        status: "enabled",
        secretState: "available",
        capabilities: { canUpdate: true },
      },
      native,
    }
    const getDetail = vi.fn().mockResolvedValue(detail)
    const update = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: "rejected",
        diagnostic: { message: `${providerText} ${hiddenSecret}` },
      })
      .mockResolvedValueOnce({
        outcome: "succeeded",
        data: null,
        confirmedEffects: [
          { kind: "resource-updated", resourceKind: "channel", resourceId: 40 },
        ],
        message: `${providerText} ${hiddenSecret}`,
      })
    const resourceEdit: ChannelResourceEditContext = {
      config: {
        baseUrl: "https://managed.example.invalid",
        adminToken: "admin-token-placeholder",
        userId: "1",
      },
      ref: detail.summary.ref,
      capabilities: {
        items: { getDetail, update },
        drafts: {
          prepareEditDraft: vi.fn(() => ({
            name: "Incomplete secret channel",
            type: ChannelType.OpenAI,
            key: "draft-key-placeholder",
            base_url: "https://source.example.invalid",
            models: ["gpt-4o"],
            groups: ["default"],
            priority: 0,
            weight: 0,
            status: DEFAULT_CHANNEL_FIELDS.status,
          })),
          describeFields: vi.fn(() => []),
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    }
    const onSuccess = vi.fn()
    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess,
        resourceEdit,
      }),
    )

    await waitFor(() => expect(result.current.isFormValid).toBe(true))
    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })

    const toastPayload = JSON.stringify(vi.mocked(toast.error).mock.calls)
    const loggedError = loggerMocks.error.mock.calls.at(-1)?.[1] as Error
    expect(vi.mocked(toast.error)).toHaveBeenLastCalledWith(
      "channelDialog:messages.saveFailed",
    )
    expect(toastPayload).not.toContain(providerText)
    expect(toastPayload).not.toContain(hiddenSecret)
    expect(loggedError.message).toBe("")

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent)
    })

    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "managedSiteChannels:toasts.channelUpdated",
      }),
    )
    expect(JSON.stringify(onSuccess.mock.calls)).not.toContain(providerText)
    expect(JSON.stringify(onSuccess.mock.calls)).not.toContain(hiddenSecret)
  })

  it("invalidates loaded resource detail when the resource edit ref changes", async () => {
    const preventDefault = vi.fn()
    const channel = buildManagedSiteChannel({
      id: 32,
      name: "List Name",
      key: "sk-********",
    })
    const firstDetail: ManagedUpstreamResourceDetail<ManagedSiteChannel> = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.com",
          resourceId: "32",
        },
        displayName: "First Detail",
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: buildManagedSiteChannel({
        id: 32,
        name: "First Detail",
        key: "sk-********",
      }),
    }
    const secondRef = {
      managedSiteType: SITE_TYPES.NEW_API,
      scopeKey: "https://managed.example.com",
      resourceId: "33",
    } as const
    let resolveSecondDetail: (value: typeof firstDetail) => void = () => {}
    const getDetail = vi
      .fn()
      .mockResolvedValueOnce(firstDetail)
      .mockImplementationOnce(
        () =>
          new Promise<typeof firstDetail>((resolve) => {
            resolveSecondDetail = resolve
          }),
      )
    const update = vi.fn().mockResolvedValue({
      outcome: "succeeded",
      message: "",
      data: null,
      confirmedEffects: [
        { kind: "resource-updated", resourceKind: "channel", resourceId: 32 },
      ],
    })
    const resourceEdit: ChannelResourceEditContext = {
      config: {
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        userId: "1",
      },
      ref: firstDetail.summary.ref,
      capabilities: {
        items: {
          getDetail,
          update,
        },
        drafts: {
          prepareEditDraft: vi.fn(
            (): ChannelFormData => ({
              name: "Detail",
              type: ChannelType.OpenAI,
              key: "sk-********",
              base_url: "https://source.example.com",
              models: ["gpt-4o"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              status: 1,
            }),
          ),
          describeFields: vi.fn(() => [
            { name: "name", label: "Name", type: "text" as const },
          ]),
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    }

    const { result, rerender } = renderHook(
      ({ edit }) =>
        useChannelForm({
          mode: DIALOG_MODES.EDIT,
          channel,
          isOpen: true,
          onClose: vi.fn(),
          resourceEdit: edit,
        }),
      {
        initialProps: { edit: resourceEdit },
      },
    )

    await waitFor(() => {
      expect(result.current.isResourceEditReady).toBe(true)
    })

    rerender({
      edit: {
        ...resourceEdit,
        ref: secondRef,
      },
    })

    expect(result.current.isResourceEditReady).toBe(false)

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(update).not.toHaveBeenCalled()

    await act(async () => {
      resolveSecondDetail({
        ...firstDetail,
        summary: {
          ...firstDetail.summary,
          ref: secondRef,
          displayName: "Second Detail",
        },
      })
    })

    await waitFor(() => {
      expect(result.current.isResourceEditReady).toBe(true)
    })
  })

  it("lets resource-backed Claude Code Hub edits submit empty visible models when resource validation allows it", async () => {
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      messagesKey: "claudecodehub",
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(true),
      getConfig: mockGetConfig,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)

    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const preventDefault = vi.fn()
    const channel = buildManagedSiteChannel({
      id: 34,
      type: "claude",
      key: "sk-********",
      name: "Prefix Provider",
      base_url: "https://source.example.com",
      models: "",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://managed.example.com",
          resourceId: "34",
        },
        displayName: "Prefix Provider",
        nativeKind: "provider",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: {
        id: 34,
        name: "Prefix Provider",
        allowedModels: [{ matchType: "prefix", pattern: "claude-" }],
      },
    } as const
    const update = vi.fn().mockResolvedValue({
      outcome: "succeeded",
      message: "",
      data: null,
      confirmedEffects: [
        { kind: "resource-updated", resourceKind: "channel", resourceId: 34 },
      ],
    })
    const validateDraft = vi.fn(() => ({ valid: true, errors: [] }))
    const resourceEdit = {
      config: {
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
      },
      ref: detail.summary.ref,
      capabilities: {
        items: {
          getDetail: vi.fn().mockResolvedValue(detail),
          update,
        },
        drafts: {
          prepareEditDraft: vi.fn(
            (): ChannelFormData & {
              _claudeCodeHubNativeAllowedModels: Array<{
                matchType: "prefix"
                pattern: string
              }>
            } => ({
              name: "Prefix Provider",
              type: "claude",
              key: "sk-********",
              base_url: "https://source.example.com",
              models: [],
              groups: ["default"],
              priority: 0,
              weight: 1,
              status: 1,
              _claudeCodeHubNativeAllowedModels: [
                { matchType: "prefix", pattern: "claude-" },
              ],
            }),
          ),
          describeFields: vi.fn(() => [
            { name: "models", label: "Models", type: "multi_select" as const },
          ]),
          validateDraft,
        },
      },
    }

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose,
        onSuccess,
        resourceEdit,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.models).toEqual([])
      expect(result.current.isFormValid).toBe(true)
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(validateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Prefix Provider",
        models: [],
      }),
    )
    expect(update).toHaveBeenCalledWith(
      resourceEdit.config,
      detail,
      expect.objectContaining({
        name: "Prefix Provider",
        models: [],
      }),
    )
    expect(mockUpdateChannel).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error)).not.toHaveBeenCalledWith(
      "channelDialog:validation.modelsRequired",
    )
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "managedSiteChannels:toasts.channelUpdated",
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("marks resource-backed edits invalid when adapter draft validation fails", async () => {
    const preventDefault = vi.fn()
    const channel = buildManagedSiteChannel({
      id: 35,
      name: "Invalid Resource Channel",
      key: "sk-********",
      models: "",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.com",
          resourceId: "35",
        },
        displayName: "Invalid Resource Channel",
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: channel,
    } as const
    const update = vi.fn()
    const validateDraft = vi.fn(() => ({
      valid: false,
      errors: [{ field: "models", message: "At least one model is required" }],
    }))
    const resourceEdit = {
      config: {
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
      },
      ref: detail.summary.ref,
      capabilities: {
        items: {
          getDetail: vi.fn().mockResolvedValue(detail),
          update,
        },
        drafts: {
          prepareEditDraft: vi.fn(
            (): ChannelFormData => ({
              name: "Invalid Resource Channel",
              type: ChannelType.OpenAI,
              key: "sk-********",
              base_url: "https://source.example.com",
              models: [],
              groups: ["default"],
              priority: 0,
              weight: 0,
              status: 1,
            }),
          ),
          describeFields: vi.fn(() => [
            { name: "models", label: "Models", type: "multi_select" as const },
          ]),
          validateDraft,
        },
      },
    }

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
        resourceEdit,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.models).toEqual([])
      expect(result.current.isFormValid).toBe(false)
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(validateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        models: [],
      }),
    )
    expect(update).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "At least one model is required",
    )
  })

  it("exposes resource detail load errors and retries the detail request", async () => {
    const channel = buildManagedSiteChannel({
      id: 33,
      name: "List Name",
      key: "sk-********",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.com",
          resourceId: "33",
        },
        displayName: "Retried Detail",
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: buildManagedSiteChannel({
        id: 33,
        name: "Retried Detail",
        key: "sk-********",
      }),
    } as const
    const getDetail = vi
      .fn()
      .mockRejectedValueOnce(new Error("detail unavailable"))
      .mockResolvedValueOnce(detail)
    const prepareEditDraft = vi.fn(
      (): ChannelFormData => ({
        name: "Retried Detail",
        type: ChannelType.OpenAI,
        key: "sk-********",
        base_url: "https://source.example.com",
        models: ["gpt-4o"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      }),
    )
    const describeFields = vi.fn(() => [
      { name: "name", label: "Name", type: "text" as const, required: true },
    ])
    const config = {
      baseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      userId: "1",
    }
    const resourceEdit = {
      config,
      ref: detail.summary.ref,
      capabilities: {
        items: {
          getDetail,
          update: vi.fn(),
        },
        drafts: {
          prepareEditDraft,
          describeFields,
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    }

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
        resourceEdit,
      }),
    )

    await waitFor(() => {
      expect(result.current.resourceEditLoadError?.message).toBe(
        "detail unavailable",
      )
    })
    expect(result.current.isResourceEditReady).toBe(false)
    expect(getDetail).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.retryResourceEditLoad()
    })

    await waitFor(() => {
      expect(result.current.formData.name).toBe("Retried Detail")
      expect(result.current.resourceEditLoadError).toBeNull()
      expect(result.current.isResourceEditReady).toBe(true)
    })
    expect(getDetail).toHaveBeenCalledTimes(2)
  })

  it("does not require a real provider key when editing a Claude Code Hub channel", async () => {
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      messagesKey: "claudecodehub",
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(true),
      getConfig: mockGetConfig,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)

    mockGetConfig.mockResolvedValue({
      baseUrl: "https://managed.example.com",
      token: "admin-token",
      userId: "1",
    })
    mockUpdateChannel.mockResolvedValue({
      outcome: "succeeded",
      data: null,
      confirmedEffects: [
        { kind: "resource-updated", resourceKind: "channel", resourceId: 1 },
      ],
      message: "success",
    })

    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const preventDefault = vi.fn()
    const channel = buildManagedSiteChannel({
      type: "openai-compatible",
      key: "sk-***",
      group: "default",
    })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.key).toBe("sk-***")
    })

    expect(result.current.isFormValid).toBe(true)

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()
    expect(mockBuildChannelPayload).not.toHaveBeenCalled()
    expect(mockUpdateChannel).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "success",
      }),
    )
  })

  it("prefers the Claude Code Hub specific key toast in add mode", async () => {
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      messagesKey: "claudecodehub",
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(true),
      getConfig: mockGetConfig,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)

    const preventDefault = vi.fn()

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.type).toBe(
        DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS.type,
      )
    })

    await act(async () => {
      result.current.updateField("name", "Claude Provider")
      result.current.updateField("models", ["claude-sonnet"])
      result.current.updateField("key", "   ")
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "messages:claudecodehub.realProviderKeyRequired",
    )
    expect(vi.mocked(toast.error)).not.toHaveBeenCalledWith(
      "channelDialog:validation.keyRequired",
    )
    expect(mockCreateChannel).not.toHaveBeenCalled()
  })

  it("applies Claude Code Hub add defaults from the open effect", async () => {
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      messagesKey: "claudecodehub",
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(true),
      getConfig: mockGetConfig,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.type).toBe(
        DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS.type,
      )
    })

    expect(result.current.formData.weight).toBe(
      DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS.weight,
    )
  })
})
