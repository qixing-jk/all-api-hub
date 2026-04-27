import type { FormEvent } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useChannelForm } from "~/components/dialogs/ChannelDialog/hooks/useChannelForm"
import { DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS } from "~/constants/claudeCodeHub"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { AXON_HUB, CLAUDE_CODE_HUB, NEW_API } from "~/constants/siteType"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import type {
  CreateChannelPayload,
  ManagedSiteChannel,
} from "~/types/managedSite"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
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

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: NEW_API,
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(false),
      getConfig: mockGetConfig,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
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
      siteType: AXON_HUB,
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
    mockCreateChannel.mockResolvedValue({ success: true, message: "" })

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

  it("does not require a real provider key when editing a Claude Code Hub channel", async () => {
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: CLAUDE_CODE_HUB,
      messagesKey: "claudeCodeHub",
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
    mockUpdateChannel.mockResolvedValue({ success: true, message: "success" })

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

  it("applies Claude Code Hub add defaults from the open effect", async () => {
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: CLAUDE_CODE_HUB,
      messagesKey: "claudeCodeHub",
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
